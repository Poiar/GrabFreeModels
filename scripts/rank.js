#!/usr/bin/env node
/**
 * rank.js — Auto-ranks free AND paid models into role-specific scoring lists.
 *
 * Replaces rank-models.js and rank-paid-models.js (which were ~90% identical).
 * All scoring logic lives in scripts/utils/ranker-core.js.
 *
 * Usage:
 *   node scripts/rank.js                 # report mode, free models
 *   node scripts/rank.js --apply         # write free rankings to DB
 *   node scripts/rank.js --paid          # report mode, paid models
 *   node scripts/rank.js --paid --apply  # write paid rankings to DB
 */

require('dotenv').config();
const pool = require('../server/db');
const {
  ROLES,
  buildScoreTypeStats,
  buildSourceVariants,
  buildBenchmarkVariant,
  buildBaseRankings,
  diffRankings,
} = require('./utils/ranker-core');
const { inferTags } = require('./utils/tag-inference');

const APPLY = process.argv.includes('--apply');
const PAID = process.argv.includes('--paid');

const MODE = PAID ? 'paid' : 'free';
const METADATA_KEY = PAID ? '_role_rankings_paid' : '_role_rankings';

async function rankModels() {
  const client = await pool.connect();
  try {
    // ── Load eligible models ──
    const whereClause = PAID
      ? 'WHERE dm.is_free = false AND dm.is_removed = false'
      : 'WHERE dm.is_free = true AND dm.supports_tools = true AND dm.status_result = \'working\' AND dm.is_removed = false';

    const { rows: eligibleRows } = await client.query(`
      SELECT dm.id AS db_id, dm.full_id AS id, mm.name, dm.context_length,
             dm.is_free, dm.supports_tools, dm.quantization, dp.name AS provider
      FROM datapoint_models dm
      JOIN super_models mm ON mm.id = dm.super_model_id
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      ${whereClause}
      ORDER BY dm.full_id
    `);

    // ── Ineligible models (free only) ──
    const ineligibleRows = [];
    if (!PAID) {
      const { rows } = await client.query(`
        SELECT dm.full_id AS id
        FROM datapoint_models dm
        WHERE dm.is_free = true
          AND dm.supports_tools IS NOT TRUE
          AND dm.status_result = 'working'
          AND dm.is_removed = false
      `);
      ineligibleRows.push(...rows);
    }

    // ── Load best_for tags ──
    const eligibleFullIds = new Set(eligibleRows.map((m) => m.id));
    const { rows: featureRows } = await client.query(`
      SELECT dm.full_id, dmf.value
      FROM datapoint_model_features dmf
      JOIN datapoint_models dm ON dm.id = dmf.datapoint_model_id
      WHERE dmf.feature_type = 'best_for'
        AND dm.${PAID ? 'is_free = false' : 'status_result = \'working\''}
    `);
    const bestForMap = new Map();
    for (const r of featureRows) {
      if (!eligibleFullIds.has(r.full_id)) continue;
      if (!bestForMap.has(r.full_id)) bestForMap.set(r.full_id, []);
      bestForMap.get(r.full_id).push(r.value);
    }

    // ── Date features (free only) ──
    const releaseDateMap = new Map();
    const lastUpdatedMap = new Map();
    const deprecatedMap = new Map();
    if (!PAID) {
      const { rows: dateFeatRows } = await client.query(`
        SELECT dm.full_id, dmf.feature_type, dmf.value
        FROM datapoint_model_features dmf
        JOIN datapoint_models dm ON dm.id = dmf.datapoint_model_id
        WHERE dmf.feature_type IN ('release_date', 'last_updated')
          AND dm.status_result = 'working'
      `);
      for (const r of dateFeatRows) {
        if (r.feature_type === 'release_date') releaseDateMap.set(r.full_id, r.value);
        if (r.feature_type === 'last_updated') lastUpdatedMap.set(r.full_id, r.value);
      }
      const { rows: depRows } = await client.query(`
        SELECT full_id, deprecated_at FROM datapoint_models
        WHERE full_id = ANY($1) AND deprecated_at IS NOT NULL
      `, [[...eligibleFullIds]]);
      for (const r of depRows) deprecatedMap.set(r.full_id, r.deprecated_at);
    }

    // ── Descriptions (paid only — for tag inference fallback) ──
    const descMap = new Map();
    if (PAID) {
      const { rows: descRows } = await client.query(`
        SELECT dm.full_id, dmf.value
        FROM datapoint_model_features dmf
        JOIN datapoint_models dm ON dm.id = dmf.datapoint_model_id
        WHERE dmf.feature_type = 'description' AND dm.is_free = false
      `);
      for (const r of descRows) {
        if (eligibleFullIds.has(r.full_id)) descMap.set(r.full_id, r.value);
      }
    }

    // ── Attach features to model objects ──
    const eligible = eligibleRows.map((m) => {
      const bestFor = bestForMap.get(m.id) || [];
      // Paid models: fall back to name/description-based tag inference when curated tags are absent
      const tags = (!PAID || bestFor.length > 0)
        ? bestFor
        : inferTags(m.name, descMap.get(m.id) || null);
      return {
        ...m,
        best_for: tags,
        release_date: releaseDateMap.get(m.id) || null,
        last_updated: lastUpdatedMap.get(m.id) || null,
        deprecated_at: deprecatedMap.get(m.id) || null,
      };
    });

    // ── Ineligible report ──
    if (ineligibleRows.length > 0) {
      console.log('Ineligible (supports_tools!=true, excluded from rankings):');
      for (const m of ineligibleRows) console.log('  ' + m.id);
      console.log('');
    }

    // ── Load benchmark scores ──
    const eligibleDbIds = eligible.map((m) => m.db_id);
    const scoreMap = new Map();
    let scoredCount = 0;
    if (eligibleDbIds.length > 0) {
      const { rows: scoreRows } = await client.query(`
        SELECT dm.full_id, ms.source, ms.score_type, ms.score_value, ms.fetched_at
        FROM model_scores ms
        JOIN datapoint_models dm ON dm.id = ms.datapoint_model_id
        WHERE dm.id = ANY($1)
      `, [eligibleDbIds]);
      for (const r of scoreRows) {
        if (!scoreMap.has(r.full_id)) scoreMap.set(r.full_id, []);
        scoreMap.get(r.full_id).push({
          source: r.source, score_type: r.score_type,
          score_value: Number(r.score_value), fetched_at: r.fetched_at,
        });
      }
      scoredCount = new Set(scoreRows.map(r => r.full_id)).size;
    }

    console.log(`Eligible ${MODE} models: ${eligible.length} (${scoredCount} with benchmark scores)\n`);

    // ── Compute stats ──
    const scoreTypeStats = buildScoreTypeStats(scoreMap);
    const maxContext = Math.max(...eligible.map((m) => m.context_length || 0), 1);

    // ── Build base rankings ──
    const { newRankings, allScores, allMeta } = buildBaseRankings(eligible, maxContext, scoreMap, scoreTypeStats);

    // Print top 5 per role
    for (const [role] of Object.entries(ROLES)) {
      const scored = allScores[role];
      if (!scored || scored.length === 0) continue;
      console.log(`\n${role} — top 5:`);
      for (let i = 0; i < Math.min(5, scored.length); i++) {
        const m = scored[i];
        const model = eligible.find((x) => x.id === m.id);
        const ctx = model?.context_length
          ? model.context_length >= 1000000
            ? (model.context_length / 1000000).toFixed(1) + 'M'
            : Math.round(model.context_length / 1000) + 'K'
          : '?';
        console.log(`  #${i + 1} [${ctx}] score=${m.score.toFixed(2)} ${m.id}`);
      }
    }

    // ── Build source variants ──
    const allVariants = {};
    const sourceVariants = buildSourceVariants(eligible, scoreMap, scoreTypeStats);
    Object.assign(allVariants, sourceVariants);

    for (const source of Object.keys(sourceVariants)) {
      console.log(`\n-- ${source} --`);
      for (const role of Object.keys(ROLES)) {
        console.log(`  ${role}: ${sourceVariants[source][role].slice(0, 3).join(', ')}`);
      }
    }

    // ── Build benchmarks-only variant ──
    const bmVariant = buildBenchmarkVariant(eligible, scoreMap, scoreTypeStats);
    allVariants._benchmarks = bmVariant;

    console.log('\n-- benchmarks only --');
    for (const role of Object.keys(ROLES)) {
      console.log(`  ${role}: ${bmVariant[role].slice(0, 3).join(', ')}`);
    }

    // ── Diff against previous rankings ──
    const { rows: metaRows } = await client.query(
      'SELECT value::text FROM metadata WHERE key = $1', [METADATA_KEY],
    );
    const oldRankings = metaRows.length > 0 ? JSON.parse(metaRows[0].value) : {};
    const diffs = diffRankings(oldRankings, newRankings);

    console.log('\n-- Diff --');
    for (const [role, diff] of Object.entries(diffs)) {
      if (diff.unchanged) {
        console.log(`  ${role}: unchanged (${diff.count} models)`);
      } else {
        console.log(`  ${role}: ${diff.oldCount} → ${diff.newCount} models`);
        for (const id of diff.added) console.log(`    + ${id}`);
        for (const id of diff.removed) console.log(`    - ${id}`);
      }
    }

    // ── Apply ──
    if (APPLY) {
      await client.query('BEGIN');
      const rankingsWithMeta = { ...newRankings, _variants: allVariants, _scores: allScores, _meta: allMeta };
      await client.query(
        `INSERT INTO metadata (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [METADATA_KEY, JSON.stringify(rankingsWithMeta)],
      );
      await client.query('COMMIT');
      console.log(`\n${PAID ? 'Paid' : 'Free'} rankings updated in PostgreSQL metadata`);

      // Export JSON for free rankings
      if (!PAID) {
        try {
          const exportData = require('./export-from-pg');
          if (typeof exportData === 'function') await exportData();
        } catch (e) {
          console.warn('Warning: JSON export failed:', e.message);
        }
      }
    } else {
      console.log('\nReport mode. Use --apply to write changes.');
    }

    console.log(
      `\nDone. ${eligible.length} ${MODE} models ranked across ${Object.keys(ROLES).length} roles.`,
    );
  } catch (err) {
    console.error('Rank failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

rankModels().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
