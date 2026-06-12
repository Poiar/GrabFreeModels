#!/usr/bin/env node
/**
 * backfill-base-creators.js
 * Populate super_models.base_creator for ALL models using slug patterns.
 * Unlike backfill-creators.js, this runs on every model regardless of
 * whether creator is null — it only fills base_creator when missing.
 *
 * Usage: node scripts/backfill-base-creators.js [--apply]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../server/db');

const APPLY = process.argv.includes('--apply');

// Slug prefix → canonical base creator
const PATTERNS = [
  { patterns: [/^llama/, /^llama-guard/, /^codellama/], creator: 'Meta' },
  { patterns: [/^qwen/], creator: 'Alibaba' },
  { patterns: [/^phi/, /^phi-/, /^phi3/, /^phi-3/], creator: 'Microsoft' },
  {
    patterns: [/^mistral/, /^mixtral/, /^ministral/, /^codestral/, /^pixtral/],
    creator: 'Mistral AI',
  },
  { patterns: [/^gemma/, /^gemini/, /^palm/, /^t5-/], creator: 'Google' },
  { patterns: [/^recurrentgemma/], creator: 'Google' },
  { patterns: [/^olmo/, /^olmoe/], creator: 'AI2' },
  { patterns: [/^falcon/], creator: 'TII' },
  { patterns: [/^dbrx/], creator: 'Databricks' },
  { patterns: [/^jamba/], creator: 'AI21 Labs' },
  { patterns: [/^solar-/], creator: 'Upstage' },
  { patterns: [/^starcoder/], creator: 'BigCode' },
  { patterns: [/^granite/], creator: 'IBM' },
  { patterns: [/^nemotron/, /^hymba/], creator: 'NVIDIA' },
  { patterns: [/^bloom/], creator: 'BigScience' },
  { patterns: [/^exaone/], creator: 'LG AI' },
  { patterns: [/^glm/, /^chatglm/], creator: 'Zhipu AI' },
  { patterns: [/^deepseek/], creator: 'DeepSeek' },
  { patterns: [/^internlm/], creator: 'InternLM' },
  { patterns: [/^yi-/], creator: '01.AI' },
  { patterns: [/^stablelm/, /^stable-code/], creator: 'Stability AI' },
  { patterns: [/^rwkv/], creator: 'RWKV' },
  { patterns: [/^command-r/, /^c4ai-/], creator: 'Cohere' },
  { patterns: [/^gpt-/], creator: 'OpenAI' },
  { patterns: [/^claude/], creator: 'Anthropic' },
  { patterns: [/^aria/], creator: 'Rhymes AI' },
  { patterns: [/^mpt/], creator: 'MosaicML' },
  { patterns: [/^gpt-neox/, /^gpt-j/, /^gpt-neo/, /^pythia/], creator: 'EleutherAI' },
  { patterns: [/^grok/], creator: 'xAI' },
  { patterns: [/^ernie/], creator: 'Baidu' },
  { patterns: [/^baichuan/], creator: 'Baichuan' },
  { patterns: [/^minimax/, /^abab/], creator: 'MiniMax' },
  { patterns: [/^seed-/], creator: 'ByteDance' },
  { patterns: [/^openai/, /^o1/, /^o3/, /^o4/], creator: 'OpenAI' },
  { patterns: [/^whisper/], creator: 'OpenAI' },
];

function infer(slug) {
  for (const entry of PATTERNS) {
    if (entry.patterns.some((p) => p.test(slug))) return entry.creator;
  }
  return null;
}

(async () => {
  const client = await pool.connect();
  try {
    const { rows: models } = await client.query(`
      SELECT id, name, slug, creator, base_creator
      FROM super_models
      WHERE base_creator IS NULL
      ORDER BY id
    `);
    console.log(`Scanning ${models.length} models with null base_creator...\n`);

    const updates = [];
    const skipped = [];

    for (const m of models) {
      const inferred = infer(m.slug);
      if (inferred) {
        updates.push({ id: m.id, name: m.name, slug: m.slug, creator: m.creator, base: inferred });
      } else {
        skipped.push(m);
      }
    }

    console.log(`Matched: ${updates.length}  Skipped: ${skipped.length}\n`);

    if (!APPLY) {
      // Show summary by base
      const byBase = {};
      for (const u of updates) {
        const key = `${u.creator || '(null)'}  →  ${u.base}`;
        byBase[key] = (byBase[key] || 0) + 1;
      }
      for (const [key, count] of Object.entries(byBase).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${key}: ${count}`);
      }
      console.log(`\nDry-run. Use --apply to update ${updates.length} models.`);
      return;
    }

    let updated = 0;
    for (const u of updates) {
      const { rowCount } = await client.query(
        'UPDATE super_models SET base_creator = $1 WHERE id = $2 AND base_creator IS NULL',
        [u.base, u.id],
      );
      updated += rowCount;
    }
    console.log(`Updated ${updated} super_models.`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
