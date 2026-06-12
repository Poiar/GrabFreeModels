#!/usr/bin/env node
/**
 * propagate-scores-to-paid.js
 *
 * Copies benchmark scores from free datapoints to paid (openrouter) datapoints
 * by matching super_model names. Free and paid models are separate super_model
 * rows (different providers create different records for the same abstract model),
 * so we match by normalized name.
 *
 * Usage:
 *   node scripts/propagate-scores-to-paid.js          # dry-run
 *   node scripts/propagate-scores-to-paid.js --apply  # persist to DB
 */

require('dotenv').config();
const pool = require('../server/db');
const APPLY = process.argv.includes('--apply');

// Manual overrides: free super_name → paid super_name(s)
const NAME_OVERRIDES = {
  'Claude 3.5 Haiku': ['Claude 3.5 Haiku'],
  'Claude 3.5 Sonnet': ['Claude 3.5 Sonnet'],
  'Claude Opus 4': ['Claude Opus 4', 'Claude Opus 4.1'],
  'Claude Opus 4.5': ['Claude Opus 4.5'],
  'Claude Sonnet 4': ['Claude Sonnet 4'],
  'Claude Sonnet 4.5': ['Claude Sonnet 4.5'],
  'GPT-4o (2024-05-13)': ['GPT-4o (2024-05-13)'],
  'GPT-4o (2024-08-06)': ['GPT-4o (2024-08-06)'],
  'GPT-4o (2024-11-20)': ['GPT-4o (2024-11-20)'],
  'GPT-4.1': ['GPT-4.1'],
  'GPT-5': ['GPT-5', 'GPT-5 Chat', 'GPT-5 Codex'],
  'Mistral Large 3 675B Instruct 2512': ['Mistral Large 3 2512'],
  'Mistral Small 4 119B 2603': ['Mistral Small 3.2 24B', 'Mistral Small 4'],
  'Qwen3 Coder 30B A3B': ['Qwen3 Coder 30B A3B Instruct'],
  'Qwen3 235B A22B': ['Qwen3 235B A22B'],
  'Qwen3.5 397B A17B': ['Qwen3.5 397B A17B'],
  'DeepSeek V3': ['DeepSeek V3', 'DeepSeek V3 0324'],
  'DeepSeek R1': ['DeepSeek-R1'],
  'Gemma 4 31B Instruct': ['Gemma 4 26B A4B', 'Gemma 4 31B Instruct'],
  'Mistral Large': ['Mistral Large 2407', 'Mistral Large 3 2512'],
  'gpt-oss-120b': ['GPT-OSS-120B'],
  'gpt-oss-20b': ['GPT-OSS-20B'],
  'qwen3-next-80b-a3b-instruct': ['Qwen3 Next 80B A3B Thinking'],
  'gemma-4-26b-a4b-it': ['Gemma 4 26B A4B'],
  'mistralai/mistral-medium-3': ['Mistral Medium 3'],
  'Devstral Small 2': ['Devstral 2 2512'],
  'Gemma 3n E2b It': ['Gemma 3n E2b It'],
  'LFM2.5-1.2B-Instruct': ['LFM2-24B-A2B'],
  'LFM2.5-1.2B-Thinking': ['LFM2-24B-A2B'],
  'Magistral Small 2506': ['Mistral Small 3', 'Mistral Small 3.1 24B'],
  'mistral-nemotron': ['Nemotron 3 Ultra', 'Nemotron 3 Super'],
  'Claude Opus 4.6': ['Claude Opus 4.6', 'Claude Opus 4.6 (Fast)'],
  'Claude Opus 4.7': ['Claude Opus 4.7', 'Claude Opus 4.7 (Fast)'],
};

function normalizeName(n) {
  return n
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function propagate() {
  const client = await pool.connect();
  try {
    // Get all free datapoints with scores, with their super_name
    const { rows: scored } = await client.query(`
      SELECT sm.name AS free_name, ms.source, ms.score_type, ms.score_value, ms.raw_data
      FROM model_scores ms
      JOIN datapoint_models dm ON dm.id = ms.datapoint_model_id
      JOIN super_models sm ON sm.id = dm.super_model_id
      WHERE dm.is_free = true AND dm.is_removed = false
      ORDER BY sm.name, ms.score_type
    `);

    // Get all paid datapoints with their super_name
    const { rows: paid } = await client.query(`
      SELECT dm.id AS paid_dp_id, dm.full_id, sm.name AS paid_name
      FROM datapoint_models dm
      JOIN super_models sm ON sm.id = dm.super_model_id
      WHERE dm.is_free = false AND dm.is_removed = false
      ORDER BY sm.name
    `);

    // Build normalized lookup from paid name → paid dp
    const paidByName = new Map();
    for (const p of paid) {
      const norm = normalizeName(p.paid_name);
      if (!paidByName.has(norm)) paidByName.set(norm, []);
      paidByName.get(norm).push(p);
    }

    // Match scored free models to paid models by name
    const matches = []; // { paid_dp_id, full_id, source, score_type, score_value, raw_data }
    const unmatched = [];

    for (const s of scored) {
      const normFree = normalizeName(s.free_name);
      let found = false;

      // Check manual overrides
      const overrides = NAME_OVERRIDES[s.free_name] || [];
      for (const overrideName of overrides) {
        const normOverride = normalizeName(overrideName);
        const paidDps = paidByName.get(normOverride);
        if (paidDps) {
          for (const pd of paidDps) {
            matches.push({
              paid_dp_id: pd.paid_dp_id,
              full_id: pd.full_id,
              source: s.source,
              score_type: s.score_type,
              score_value: s.score_value,
              raw_data: s.raw_data,
            });
          }
          found = true;
        }
      }

      // Exact normalized name match
      if (!found) {
        const paidDps = paidByName.get(normFree);
        if (paidDps) {
          for (const pd of paidDps) {
            matches.push({
              paid_dp_id: pd.paid_dp_id,
              full_id: pd.full_id,
              source: s.source,
              score_type: s.score_type,
              score_value: s.score_value,
              raw_data: s.raw_data,
            });
          }
          found = true;
        }
      }

      if (!found) unmatched.push(s.free_name);
    }

    // Group by paid datapoint
    const byPaid = new Map();
    for (const m of matches) {
      if (!byPaid.has(m.paid_dp_id)) {
        byPaid.set(m.paid_dp_id, { full_id: m.full_id, scores: [] });
      }
      byPaid.get(m.paid_dp_id).scores.push(m);
    }

    console.log(
      `Scored free models: ${new Set(scored.map((s) => s.free_name)).size} (${scored.length} score rows)`,
    );
    console.log(`Paid models: ${paid.length}`);
    console.log(`Matched paid models: ${byPaid.size}`);
    console.log(`Score rows to propagate: ${matches.length}\n`);

    // Summary by source/type
    const summary = {};
    for (const m of matches) {
      const k = `${m.source}/${m.score_type}`;
      summary[k] = (summary[k] || 0) + 1;
    }
    for (const [k, c] of Object.entries(summary).sort()) {
      console.log(`  ${k}: ${c} rows`);
    }

    if (!APPLY) {
      console.log('\nDry-run mode. Use --apply to persist.');
      console.log('\nPaid models that would get scores:');
      for (const [, info] of byPaid) {
        const types = [...new Set(info.scores.map((s) => s.score_type))];
        console.log(`  ${info.full_id} → ${types.join(', ')} (${info.scores.length} scores)`);
      }
      if (unmatched.length > 0) {
        console.log(`\nUnmatched free scored models (${unmatched.length}):`);
        for (const n of unmatched.sort()) console.log(`  ${n}`);
      }
      return;
    }

    // Apply: upsert each score onto the paid datapoint
    await client.query('BEGIN');
    let inserted = 0;
    for (const [paidDpId, info] of byPaid) {
      for (const s of info.scores) {
        await client.query(
          `
          INSERT INTO model_scores (datapoint_model_id, source, score_type, score_value, raw_data, fetched_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (datapoint_model_id, source, score_type)
          DO UPDATE SET score_value = EXCLUDED.score_value,
                        raw_data = EXCLUDED.raw_data,
                        fetched_at = NOW()
        `,
          [paidDpId, s.source, s.score_type, s.score_value, s.raw_data],
        );
        inserted++;
      }
    }
    await client.query('COMMIT');

    console.log(`\nPropagated ${inserted} score rows to ${byPaid.size} paid datapoints.`);
  } catch (err) {
    console.error('Propagation failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

propagate().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
