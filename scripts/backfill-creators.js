#!/usr/bin/env node
/**
 * backfill-creators.js
 * One-shot script to backfill `creator` and `base_creator` on existing
 * super_models rows where these fields are null.
 *
 * Creator inference (tried in order per model):
 *   1. From super_model name containing `:` — extract part before the colon
 *   2. From super_model name containing `/` — extract part before the slash
 *   3. From datapoint_models full_ids — find the most common org across
 *      datapoints (second segment of full_id after providerSlug/)
 *
 * Usage: node scripts/backfill-creators.js [--apply]
 *   --apply  : Write updates to PostgreSQL (default: dry-run)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../server/db');

const APPLY = process.argv.includes('--apply');

// ── Reuse creator humanization from import-external-models.js ──
const CREATOR_WHITELIST = new Map([
  ['ai21labs', 'AI21 Labs'],
  ['meta-llama', 'Meta'],
  ['mistralai', 'Mistral AI'],
  ['deepseek-ai', 'DeepSeek'],
  ['qwen', 'Alibaba Qwen'],
  ['google', 'Google'],
  ['nvidia', 'NVIDIA'],
  ['microsoft', 'Microsoft'],
  ['openai', 'OpenAI'],
  ['cohere', 'Cohere'],
  ['anthropic', 'Anthropic'],
  ['ibm', 'IBM'],
  ['intel', 'Intel'],
  ['amazon', 'Amazon'],
  ['baidu', 'Baidu'],
  ['bytedance', 'ByteDance'],
  ['alibaba', 'Alibaba'],
  ['tencent', 'Tencent'],
  ['apple', 'Apple'],
  ['samsung', 'Samsung'],
  ['oracle', 'Oracle'],
  ['salesforce', 'Salesforce'],
  ['databricks', 'Databricks'],
  ['stabilityai', 'Stability AI'],
  ['upstage', 'Upstage'],
  ['writer', 'Writer'],
  ['togethercomputer', 'Together AI'],
  ['xai', 'xAI'],
  ['x-ai', 'xAI'],
  ['01-ai', '01.AI'],
  ['abacusai', 'Abacus AI'],
  ['yandex', 'Yandex'],
  ['sberbank', 'Sber'],
  ['h2o', 'H2O.ai'],
  ['tii', 'TII'],
  ['tiiuae', 'TII'],
  ['rhymes-ai', 'Rhymes AI'],
  ['cognitivecomputations', 'Cognitive Computations'],
  ['princeton-nlp', 'Princeton NLP'],
  ['siliconflow-cn', 'SiliconFlow'],
  ['siliconflow', 'SiliconFlow'],
  ['arcee-ai', 'Arcee AI'],
  ['ibm-granite', 'IBM'],
  ['black-forest-labs', 'Black Forest Labs'],
  ['sentence-transformers', 'Sentence Transformers'],
  ['github-models', 'GitHub Models'],
  ['anthracite-org', 'Anthracite'],
  ['mergekit-community', 'MergeKit Community'],
  ['allura-org', 'Allura'],
  ['huihui-ai', 'Huihui AI'],
  ['zai-org', 'Z.AI'],
  ['kaist-ai', 'KAIST AI'],
  ['openai-community', 'OpenAI Community'],
  ['llm360', 'LLM360'],
  ['llmgateway', 'LLM Gateway'],
  ['opencode', 'OpenCode'],
  ['ontocord', 'Ontocord'],
  ['inception', 'Inception AI'],
  ['mbzuai', 'MBZUAI'],
  ['kaist', 'KAIST'],
  ['etri', 'ETRI'],
  ['tsinghua', 'Tsinghua University'],
  ['pku', 'Peking University'],
  ['sail', 'SAIL'],
  ['llama', 'Meta'],
  ['@cf', 'Cloudflare'],
  ['groq', 'Groq'],
  ['rekaai', 'Reka'],
  ['canopylabs', 'Canopy Labs'],
  ['thenlper', 'NLPer'],
  ['minimaxai', 'MiniMax'],
  ['nousresearch', 'Nous Research'],
  ['sao10k', 'Sao10K'],
  ['baichuan', 'Baichuan'],
  ['gryphe', 'Gryphe'],
  ['undi95', 'Undi95'],
  ['thedrummer', 'TheDrummer'],
  ['meta', 'Meta'],
  ['microsoft', 'Microsoft'],
  ['openai', 'OpenAI'],
  ['cohere', 'Cohere'],
  ['anthropic', 'Anthropic'],
  ['google', 'Google'],
  ['nvidia', 'NVIDIA'],
  ['baidu', 'Baidu'],
  ['ByteDance', 'ByteDance'],
  ['alibaba', 'Alibaba'],
  ['deepseek', 'DeepSeek'],
  ['bytedance', 'ByteDance'],
  ['amazon', 'Amazon'],
  ['apple', 'Apple'],
  ['ibm', 'IBM'],
  ['tencent', 'Tencent'],
  ['OpenAI', 'OpenAI'],
  ['DeepSeek', 'DeepSeek'],
  ['xAI', 'xAI'],
  ['ByteDance', 'ByteDance'],
  ['MiniMax', 'MiniMax'],
]);

function humanizeCreator(raw) {
  if (CREATOR_WHITELIST.has(raw)) return CREATOR_WHITELIST.get(raw);
  if (/[-_]/.test(raw)) {
    return raw
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  if (/[A-Z]/.test(raw) && /[a-z]/.test(raw)) {
    return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  return raw;
}

// ── Name-pattern → base_creator for known model families ──
// Used when architecture data isn't readily available via a join.
const NAME_BASE_CREATOR = [
  // Pattern: match on slug prefix (lowercased slug)
  { patterns: [/^llama/, /^llama-guard/, /^codellama/], creator: 'Meta' },
  { patterns: [/^qwen/], creator: 'Alibaba Qwen' },
  { patterns: [/^phi/, /^phi-/, /^phi3/, /^phi-3/], creator: 'Microsoft' },
  { patterns: [/^mistral/, /^mixtral/, /^ministral/, /^codestral/, /^pixtral/], creator: 'Mistral AI' },
  { patterns: [/^gemma/, /^gemini/, /^palm/, /^t5-/], creator: 'Google' },
  { patterns: [/^gemma/, /^recurrentgemma/], creator: 'Google' },
  { patterns: [/^olmo/, /^olmoe/], creator: 'AI2' },
  { patterns: [/^falcon/, /^falcon-/], creator: 'TII' },
  { patterns: [/^dbrx/], creator: 'Databricks' },
  { patterns: [/^jamba/], creator: 'AI21 Labs' },
  { patterns: [/^solar-/], creator: 'Upstage' },
  { patterns: [/^starcoder/, /^starcoder2/], creator: 'BigCode' },
  { patterns: [/^granite/], creator: 'IBM' },
  { patterns: [/^nemotron/, /^hymba/], creator: 'NVIDIA' },
  { patterns: [/^bloom/], creator: 'BigScience' },
  { patterns: [/^exaone/], creator: 'LG AI' },
  { patterns: [/^glm/, /^chatglm/], creator: 'Zhipu AI' },
  { patterns: [/^deepseek/, /^deepseek-/], creator: 'DeepSeek' },
  { patterns: [/^internlm/, /^internlm2/], creator: 'InternLM' },
  { patterns: [/^yi-/], creator: '01.AI' },
  { patterns: [/^stablelm/, /^stable-code/], creator: 'Stability AI' },
  { patterns: [/^rwkv/], creator: 'RWKV' },
  { patterns: [/^command-/, /^command-r/, /^c4ai-/], creator: 'Cohere' },
  { patterns: [/^gpt-/], creator: 'OpenAI' },
  { patterns: [/^claude/], creator: 'Anthropic' },
  { patterns: [/^aria/], creator: 'Rhymes AI' },
  { patterns: [/^mpt/], creator: 'MosaicML' },
  { patterns: [/^gpt-neox/, /^gpt-j/, /^gpt-neo/, /^pythia/], creator: 'EleutherAI' },
];

function inferBaseCreator(slug) {
  for (const entry of NAME_BASE_CREATOR) {
    if (entry.patterns.some((p) => p.test(slug))) {
      return entry.creator;
    }
  }
  return null;
}

/**
 * Extract a raw creator slug from a super_model name.
 * Returns null if nothing useful found.
 */
function extractFromName(name) {
  // Pattern 1: "Qwen: Qwen3 VL..." → "Qwen"
  const colonIdx = name.indexOf(':');
  if (colonIdx > 0 && colonIdx < name.length - 1) {
    return name.slice(0, colonIdx).trim();
  }
  // Pattern 2: "qwen/qwen3-vl-235b" → "qwen"
  const slashIdx = name.indexOf('/');
  if (slashIdx > 0 && slashIdx < name.length - 1) {
    return name.slice(0, slashIdx).trim();
  }
  return null;
}

(async () => {
  const client = await pool.connect();
  try {
    // ── Load null-creator super_models ──
    const { rows: nullModels } = await client.query(`
      SELECT id, name, slug
      FROM super_models
      WHERE creator IS NULL
      ORDER BY id
    `);
    console.log(`\nScanned: ${nullModels.length} super_models with null creator\n`);

    if (nullModels.length === 0) {
      console.log('No null creators found. Nothing to do.');
      return;
    }

    // ── Load datapoint full_ids for these models ──
    const modelIds = nullModels.map((m) => m.id);
    const { rows: dpRows } = await client.query(`
      SELECT dm.super_model_id, dm.full_id
      FROM datapoint_models dm
      WHERE dm.super_model_id = ANY($1) AND dm.is_removed = false
    `, [modelIds]);

    // Group full_ids by super_model_id
    const fullIdsBySuper = new Map();
    for (const row of dpRows) {
      if (!fullIdsBySuper.has(row.super_model_id)) {
        fullIdsBySuper.set(row.super_model_id, []);
      }
      fullIdsBySuper.get(row.super_model_id).push(row.full_id);
    }

    // ── Resolve creator for each model ──
    const updates = [];

    for (const model of nullModels) {
      let rawCreator = null;
      let source = null;

      // Try 1: from name (colon before org name)
      rawCreator = extractFromName(model.name);
      if (rawCreator) {
        source = 'name';
      }

      // Try 2: from datapoint full_ids (only when remote_id includes org prefix)
      // full_id = "deepinfra/Qwen/Qwen3-VL-235B" → 3 parts → parts[1] = "Qwen"
      // full_id = "github-models/gpt-4" → 2 parts → skip (model name, not org)
      if (!rawCreator) {
        const ids = fullIdsBySuper.get(model.id) || [];
        if (ids.length > 0) {
          const orgCounts = new Map();
          for (const fullId of ids) {
            const parts = fullId.split('/');
            // Only use full_ids where remote_id has its own slash (org/model format)
            if (parts.length >= 3) {
              const org = parts[1];
              if (org && org.length >= 2) {
                orgCounts.set(org, (orgCounts.get(org) || 0) + 1);
              }
            }
          }
          if (orgCounts.size > 0) {
            let bestOrg = null;
            let bestCount = 0;
            for (const [org, count] of orgCounts) {
              if (count > bestCount) {
                bestOrg = org;
                bestCount = count;
              }
            }
            rawCreator = bestOrg;
            source = 'datapoint';
          }
        }
      }

      // Final fallback: match slug against NAME_BASE_CREATOR patterns
      if (!rawCreator) {
        const matched = inferBaseCreator(model.slug);
        if (matched) {
          rawCreator = matched;
          source = 'slug-pattern';
        }
      }

      if (!rawCreator) {
        console.log(`  [skip] ${model.name} (${model.slug}) — no creator inferred`);
        continue;
      }

      const creator = humanizeCreator(rawCreator);

      // Infer base_creator — only when it differs from creator
      let baseCreator = null;
      const inferredBase = inferBaseCreator(model.slug);
      if (inferredBase && inferredBase !== creator) {
        baseCreator = inferredBase;
      }

      updates.push({
        id: model.id,
        name: model.name,
        slug: model.slug,
        creator,
        base_creator: baseCreator,
        source,
      });
    }

    // ── Summary ──
    console.log(`Resolvable: ${updates.length} / ${nullModels.length}\n`);

    // ── Print planned updates ──
    for (const u of updates) {
      const baseStr = u.base_creator ? `, base_creator: "${u.base_creator}"` : '';
      console.log(`  [${APPLY ? 'apply' : 'dry'}] [${u.source}] ${u.name} → creator: "${u.creator}"${baseStr}`);
    }

    console.log(`\n${updates.length} models to update.`);
    if (!APPLY) {
      console.log('Dry-run mode. Use --apply to apply.\n');
      return;
    }

    // ── Apply updates ──
    let updated = 0;
    for (const u of updates) {
      const result = await client.query(
        `UPDATE super_models
         SET creator = $1,
             base_creator = COALESCE(base_creator, $2)
         WHERE id = $3 AND creator IS NULL`,
        [u.creator, u.base_creator, u.id],
      );
      updated += result.rowCount;
    }

    console.log(`Updated ${updated} super_models.`);
    console.log('Done.\n');
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
