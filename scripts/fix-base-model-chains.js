#!/usr/bin/env node
/**
 * fix-base-model-chains.js
 * Fix base_model relationships using known lineage rules for major model families.
 * Sequential version detection (GPT-5.x) can't be done by substring matching alone
 * — e.g. GPT-5.2 contains "GPT 5" but NOT "GPT 5.1". This script applies explicit
 * corrections and verifies the full chain.
 *
 * Usage:
 *   node scripts/fix-base-model-chains.js          # dry-run
 *   node scripts/fix-base-model-chains.js --apply  # write to DB
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../server/db');
const { wouldCreateCycle } = require('./utils/safe-chain-walker');

const APPLY = process.argv.includes('--apply');

/**
 * Known sequential version families.
 * Each entry defines a major.minor version scheme where minor version N+1
 * is the successor of minor version N. The base_model of each version
 * should point to the previous version.
 *
 * `prefix` - slug prefix that identifies this family
 * `base`   - the root/foundation model slug
 * `versions` - array of [version, base_model_slug] pairs
 *   where version is added to the prefix to form the child slug
 *   and base_model_slug is the slug of the parent
 */
const SEQUENTIAL_FAMILIES = [
  {
    name: 'GPT-5.x',
    prefix: 'gpt-5',
    // [child_slug, parent_slug] — full slugs
    rules: [
      ['gpt-5-1', 'gpt-5'],
      ['gpt-5-2', 'gpt-5-1'],
      // gpt-5-3 doesn't exist as standalone — 5.3 was Codex-only (gpt-5-3-codex)
      // 5.4→5.3 and 5.5→5.4 handled by VARIANT_RULES
      ['gpt-5-5', 'gpt-5-4'],
    ],
  },
  {
    name: 'GPT-4.x',
    prefix: 'gpt-4',
    rules: [
      ['gpt-4-1', 'gpt-4'],
      ['gpt-4-1-mini', 'gpt-4-1'],
      ['gpt-4-1-nano', 'gpt-4-1'],
    ],
  },
  {
    name: 'Claude Opus',
    prefix: 'claude-opus',
    rules: [
      ['anthropic-claude-opus-4-1', 'anthropic-claude-opus-4'],
      ['anthropic-claude-opus-4-5', 'anthropic-claude-opus-4-1'],
      ['anthropic-claude-opus-4-6', 'anthropic-claude-opus-4-5'],
      ['anthropic-claude-opus-4-7', 'anthropic-claude-opus-4-6'],
      ['anthropic-claude-opus-4-8', 'anthropic-claude-opus-4-7'],
    ],
  },
  {
    name: 'Claude Sonnet',
    prefix: 'claude-sonnet',
    rules: [
      ['anthropic-claude-sonnet-4-5', 'anthropic-claude-sonnet-4'],
      ['anthropic-claude-sonnet-4-6', 'anthropic-claude-sonnet-4-5'],
    ],
  },
  {
    name: 'DeepSeek V3.x',
    prefix: 'deepseek-v3',
    rules: [
      ['deepseek-ai-deepseek-v3-1', 'deepseek-v3'],
      ['deepseek-ai-deepseek-v3-2', 'deepseek-ai-deepseek-v3-1'],
      ['deepseek-ai-deepseek-v3-1-terminus', 'deepseek-ai-deepseek-v3-1'],
      ['deepseek-v3-0324', 'deepseek-v3'],
    ],
  },
  {
    name: 'Grok 4.x',
    prefix: 'grok-4',
    rules: [
      ['grok-4-1-fast', 'grok-4'],
      ['grok-4-20', 'grok-4-1'],
    ],
  },
];

/**
 * Variant rules: models that should point to a specific parent
 * because substring/token matching can't determine the relationship.
 * Format: { child_slug: parent_slug }
 */
const VARIANT_RULES = {
  // GPT-5.x size/capability variants → their version base
  'gpt-5-mini': 'gpt-5',
  'gpt-5-nano': 'gpt-5',
  'gpt-5-codex': 'gpt-5',
  'gpt-5-chat': 'gpt-5',
  'gpt-5-pro': 'gpt-5',
  'gpt-5-image': 'gpt-5',

  'gpt-5-1-chat': 'gpt-5-1',
  'gpt-5-1-codex': 'gpt-5-1',

  'gpt-5-2-chat': 'gpt-5-2',
  'gpt-5-2-codex': 'gpt-5-2',
  'gpt-5-2-pro': 'gpt-5-2',

  'gpt-5-3-chat': 'gpt-5-2',
  'gpt-5-3-codex': 'gpt-5-2',

  'gpt-5-4-mini': 'gpt-5-4',
  'gpt-5-4-nano': 'gpt-5-4',
  'gpt-5-4-pro': 'gpt-5-4',

  'gpt-5-5-pro': 'gpt-5-5',

  // Codex sub-variants
  'gpt-5-1-codex-max': 'gpt-5-1-codex',
  'gpt-5-1-codex-mini': 'gpt-5-1-codex',

  // DeepSeek R1 distill variants → R1 (the teacher)
  'deepseek-ai-deepseek-r1-distill-llama-70b': 'deepseek-r1',
  'deepseek-ai-deepseek-r1-distill-llama-8b': 'deepseek-r1',
  'deepseek-ai-deepseek-r1-distill-qwen-1-5b': 'deepseek-r1',
  'deepseek-ai-deepseek-r1-distill-qwen-14b': 'deepseek-r1',
  'deepseek-ai-deepseek-r1-distill-qwen-32b': 'deepseek-r1',
  'deepseek-ai-deepseek-r1-distill-qwen-7b': 'deepseek-r1',
  'deepseek-r1-0528': 'deepseek-r1',
  'deepseek-deepseek-r1-0528-qwen3-8b': 'deepseek-r1-0528',
  'deepseek-r1-distill-llama-70b': 'deepseek-r1',
  'deepseek-r1-distill-qwen-32b': 'deepseek-r1',
  'deepseek-deepseek-r1-turbo': 'deepseek-r1',

  // Image sub-variants
  'gpt-5-image-mini': 'gpt-5-image',
  'gpt-5-4-image-2': 'gpt-5-4',

  // Remaining version overrides (gpt-5-3 doesn't exist as standalone;
  // gpt-5-3-codex IS GPT-5.3 — it was a Codex-only release)
  'openai-gpt-5-3-chat': 'gpt-5-2', // 5.3 Chat → 5.2 (sequential, 5.3 has no standalone)
  'gpt-5-4': 'gpt-5-3-codex', // 5.4 → 5.3 (which is 5.3-codex)
  'openai-gpt-5-4': 'gpt-5-3-codex', // same
  'openai-gpt-5-5': 'gpt-5-4', // 5.5 → 5.4 (sequential)

  // GPT-4.x
  'gpt-4o-mini': 'openai-gpt-4o',
  'gpt-4o-mini-search-preview': 'openai-gpt-4o-mini',

  // Mistral versioning
  'mistral-small-3-1-24b': 'mistral-small-3',
  'mistral-small-3-2-24b': 'mistral-small-3-1-24b',
  'mistral-large-3': 'mistral-large-2407',

  // Gemini 3.5 Flash based on Gemini 3 Flash (not Step 3.5 Flash)
  'gemini-3-5-flash': 'gemini-3-flash',
};

/**
 * Wrong parent overrides: models that should have base_model = NULL
 * because they are NOT derived from the detected parent (coincidental
 * name matches from the derivation detector).
 */
const NULL_OVERRIDES = new Set([
  // Dolly v2 was trained by Databricks on EleutherAI Pythia/GPT-Neo,
  // not on Llama or Mistral or UnslopNemo
  'databricks-dolly-v2-7b',
  'databricks-dolly-v2-12b',
  'databricks-dolly-v2-3b',

  // OLMo is an AI2 original model, not derived from Gemma
  'allenai-olmo-1b-hf',
  'allenai-olmoe-1-7-7b-hf',

  // These models don't exist as distinct super_models (merged or never separate)

  // R1 is the foundation model — not derived from R1-0528 (its own update)
  'deepseek-r1',

  // Direction-reversed: these are base/foundation models mistakenly linked
  // as children of models derived FROM them (R1-distill → Qwen, not Qwen → R1)
  'qwen-qwen1-5-32b',
  'nemotron-research-reasoning-qwen-1-5b',
]);

// ── Main ──

(async () => {
  const client = await pool.connect();

  try {
    console.log(APPLY ? '=== APPLY MODE ===\n' : '=== DRY RUN ===\n');

    // Load all super_models into a map for lookup
    const { rows: allModels } = await client.query(
      'SELECT id, name, slug, base_model, base_creator, creator FROM super_models ORDER BY slug',
    );
    const slugToModel = new Map(allModels.map((m) => [m.slug, m]));

    const fixes = [];
    const skipped = [];
    const notFound = [];

    // A. Apply variant rules
    console.log('--- Variant Rules ---');
    for (const [childSlug, parentSlug] of Object.entries(VARIANT_RULES)) {
      const child = slugToModel.get(childSlug);
      const parent = slugToModel.get(parentSlug);

      if (!child) {
        notFound.push({ type: 'variant', childSlug, reason: 'child not in DB' });
        continue;
      }
      if (!parent) {
        notFound.push({ type: 'variant', childSlug, reason: `parent ${parentSlug} not in DB` });
        continue;
      }

      if (child.base_model === parentSlug) continue; // already correct

      // Cycle check
      if (wouldCreateCycle(childSlug, parentSlug, slugToModel)) {
        skipped.push({
          childSlug,
          current: child.base_model,
          proposed: parentSlug,
          reason: 'would create cycle',
        });
        continue;
      }

      fixes.push({
        childSlug,
        childName: child.name,
        currentBase: child.base_model || '(null)',
        newBase: parentSlug,
        parentName: parent.name,
        source: 'variant-rule',
      });
    }

    // A2. Apply null overrides (models that should NOT have a parent)
    console.log('--- Null Overrides ---');
    for (const childSlug of NULL_OVERRIDES) {
      const child = slugToModel.get(childSlug);
      if (!child) { notFound.push({ type: 'null-override', childSlug, reason: 'slug not in DB' }); continue; }
      if (!child.base_model) continue; // already null
      fixes.push({
        childSlug,
        childName: child.name,
        currentBase: child.base_model,
        newBase: null,
        parentName: '(none)',
        source: 'null-override',
      });
    }

    // B. Apply sequential family rules
    console.log('--- Sequential Families ---');
    for (const family of SEQUENTIAL_FAMILIES) {
      for (const [childSlug, parentSlug] of family.rules) {
        const child = slugToModel.get(childSlug);
        if (!child) {
          // Try alternate slug prefixes for models that exist under different names
          for (const altSlug of slugToModel.keys()) {
            if (altSlug.endsWith('-' + childSlug) || altSlug.endsWith('/' + childSlug)) {
              // Found it under alt prefix — but only use if existing slug doesn't exist
              continue;
            }
          }
          notFound.push({
            type: 'sequential',
            family: family.name,
            childSlug,
            reason: 'child slug not in DB',
          });
          continue;
        }

        if (!slugToModel.has(parentSlug)) {
          notFound.push({
            type: 'sequential',
            family: family.name,
            childSlug,
            reason: `parent ${parentSlug} not in DB`,
          });
          continue;
        }

        if (child.base_model === parentSlug) continue; // already correct

        if (wouldCreateCycle(childSlug, parentSlug, slugToModel)) {
          skipped.push({
            childSlug,
            current: child.base_model,
            proposed: parentSlug,
            reason: 'would create cycle',
          });
          continue;
        }

        fixes.push({
          childSlug,
          childName: child.name,
          currentBase: child.base_model || '(null)',
          newBase: parentSlug,
          parentName: slugToModel.get(parentSlug).name,
          source: `sequential:${family.name}`,
        });
      }
    }

    // C. General verification: detect wrong parents by creator mismatch
    console.log('--- Creator Mismatch Detection ---');
    let creatorMismatchCount = 0;
    for (const model of allModels) {
      if (!model.base_model) continue;
      const parent = slugToModel.get(model.base_model);
      if (!parent) continue;

      // If child and parent have different creators AND the child's
      // base_creator matches the parent's creator, flag it
      if (
        model.creator &&
        parent.creator &&
        model.creator !== parent.creator &&
        model.base_creator &&
        model.base_creator === parent.creator
      ) {
        creatorMismatchCount++;
      }
    }
    console.log(
      `  ${creatorMismatchCount} models with creator/base_creator mismatch (informational)`,
    );

    // D. Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Fixes proposed:     ${fixes.length}`);
    console.log(`Skipped (unsafe):   ${skipped.length}`);
    console.log(`Not found:          ${notFound.length}`);

    if (fixes.length > 0) {
      console.log('\n--- Proposed Fixes ---');
      for (const f of fixes.slice(0, 40)) {
        console.log(`  ${f.childSlug} (${f.childName})`);
        console.log(`    ${f.currentBase} → ${f.newBase} (${f.parentName})  [${f.source}]`);
      }
      if (fixes.length > 40) console.log(`  ... and ${fixes.length - 40} more`);
    }

    if (skipped.length > 0) {
      console.log('\n--- Skipped ---');
      for (const s of skipped.slice(0, 10)) {
        console.log(`  ${s.childSlug}: ${s.reason}`);
      }
    }

    if (notFound.filter((n) => n.reason.includes('parent')).length > 0) {
      console.log('\n--- Missing Parents ---');
      for (const n of notFound.filter((n) => n.reason.includes('parent'))) {
        console.log(`  ${n.childSlug}: ${n.reason}`);
      }
    }

    if (!APPLY) {
      console.log('\nDry run — use --apply to write fixes.');
      return;
    }

    // Apply fixes
    console.log('\nApplying fixes...');
    let applied = 0;
    for (const f of fixes) {
      try {
        await client.query('UPDATE super_models SET base_model = $1 WHERE slug = $2', [
          f.newBase,
          f.childSlug,
        ]);
        applied++;
      } catch (err) {
        console.error(`  ERROR updating ${f.childSlug}: ${err.message}`);
      }
    }
    console.log(`Applied ${applied} base_model fixes.`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
