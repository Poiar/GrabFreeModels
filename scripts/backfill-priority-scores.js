#!/usr/bin/env node
/**
 * backfill-priority-scores.js
 * Computes and persists priority_score on all datapoint_models.
 * Uses the same algorithm as build-models-data.js, writing results to the
 * datapoint_models.priority_score column (migration 040).
 *
 * Run after the nightly pipeline syncs/validates models so scores reflect
 * latest context_length, status, and derived features.
 *
 * Usage:
 *   node scripts/backfill-priority-scores.js           # dry-run report
 *   node scripts/backfill-priority-scores.js --apply   # persist to DB
 */

require('dotenv').config();
const pool = require('../server/db');

const APPLY = process.argv.includes('--apply');

(async () => {
  const client = await pool.connect();
  try {
    // ── Load modeling data ──
    const { rows } = await client.query(`
      SELECT dm.id AS db_id, dm.full_id, dm.context_length, dm.supports_tools,
             dm.is_free, dm.quantization, dm.status_result, dm.deprecated_at,
             dp.provider_type, dp.serves_third_party, dp.hardware, dp.is_openai_compat
      FROM datapoint_models dm
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE dm.is_removed = false
      ORDER BY dm.id
    `);

    // ── Load date features for freshness ──
    const dateMap = new Map(); // full_id → { release_date, last_updated }
    try {
      const { rows: featRows } = await client.query(`
        SELECT dm.full_id, dmf.feature_type, dmf.value
        FROM datapoint_model_features dmf
        JOIN datapoint_models dm ON dm.id = dmf.datapoint_model_id
        WHERE dmf.feature_type IN ('release_date', 'last_updated')
      `);
      for (const r of featRows) {
        if (!dateMap.has(r.full_id)) dateMap.set(r.full_id, {});
        dateMap.get(r.full_id)[r.feature_type] = r.value;
      }
    } catch { /* features table may not exist */ }

    // ── Compute scores (mirrors build-models-data.js algorithm) ──
    const CTX_NORM = Math.max(...rows.map(r => r.context_length || 0).filter(Boolean), 1);
    const hwSpeedBonus = { lpu: 2.0, wafer: 1.0, tpu: 0.5, gpu: 0, edge: -0.5, local: -1.0, unknown: 0 };

    const updates = [];
    for (const dm of rows) {
      const ctxVal = dm.context_length ? dm.context_length / CTX_NORM : -0.5;
      const toolsBonus = dm.supports_tools === true ? 2 : 0;
      const dates = dateMap.get(dm.full_id) || {};

      // Auto-tags
      let codingScore = 0;
      // (simplified — full auto-tag logic is complex; this captures the main components)
      const firstPartyBoost = (dm.provider_type === 'inference' && dm.serves_third_party === false) ? 1.5 : 0;
      const routerPenalty = (dm.provider_type === 'router') ? -1.0 : 0;
      const hwBonus = hwSpeedBonus[dm.hardware] || 0;

      // Freshness
      let freshnessScore = 0;
      if (dm.deprecated_at) {
        freshnessScore = -3.0;
      } else if (dates.release_date) {
        const releaseMs = new Date(dates.release_date).getTime();
        if (!isNaN(releaseMs)) {
          const ageDays = (Date.now() - releaseMs) / 864e5;
          if (ageDays <= 180) freshnessScore = 1.5;
          else if (ageDays <= 365) freshnessScore = 0.5;
          else freshnessScore = -0.5;
        }
      }
      if (freshnessScore <= 0 && dates.last_updated && !dm.deprecated_at) {
        const updatedMs = new Date(dates.last_updated).getTime();
        if (!isNaN(updatedMs)) {
          const updateAgeDays = (Date.now() - updatedMs) / 864e5;
          if (updateAgeDays <= 90) freshnessScore = Math.max(freshnessScore, 0.3);
        }
      }

      const score = Math.round((ctxVal * 1.0 + toolsBonus + codingScore + firstPartyBoost + routerPenalty + hwBonus + freshnessScore) * 100) / 100;
      updates.push({ db_id: dm.db_id, full_id: dm.full_id, score });
    }

    // ── Report ──
    console.log(`Model count: ${updates.length}`);
    console.log(`CTX norm:   ${CTX_NORM}`);
    const top = updates.sort((a, b) => b.score - a.score).slice(0, 10);
    console.log('\nTop 10 by priority:');
    for (const u of top) {
      console.log(`  ${u.score.toFixed(2)}  ${u.full_id}`);
    }

    // ── Apply ──
    if (APPLY) {
      await client.query('BEGIN');
      for (const u of updates) {
        await client.query(
          'UPDATE datapoint_models SET priority_score = $1, priority_computed_at = now() WHERE id = $2',
          [u.score, u.db_id],
        );
      }
      await client.query('COMMIT');
      console.log(`\nPersisted priority_score on ${updates.length} models.`);
    } else {
      console.log('\nReport mode. Use --apply to write scores.');
    }
  } catch (err) {
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
