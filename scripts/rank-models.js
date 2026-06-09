#!/usr/bin/env node
/**
 * rank-models.js
 * Auto-ranks free working models into role-specific scoring lists.
 *
 * Reads from PostgreSQL. On --apply, writes rankings to metadata table and exports JSON.
 *
 * Usage:
 *   node scripts/rank-models.js          # report mode
 *   node scripts/rank-models.js --apply  # write rankings to DB + export JSON
 */

require('dotenv').config();
const pool = require('../server/db');
const APPLY = process.argv.includes('--apply');

async function rankModels() {
  const client = await pool.connect();
  try {
    // Load eligible models: free + working + tools + not removed
    const { rows: eligibleRows } = await client.query(`
      SELECT dm.id AS db_id, dm.full_id AS id, mm.name, dm.context_length, dm.is_free, dm.supports_tools,
             dp.name AS provider
      FROM datapoint_models dm
      JOIN super_models mm ON mm.id = dm.super_model_id
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE dm.is_free = true
        AND dm.supports_tools = true
        AND dm.status_result = 'working'
        AND dm.is_removed = false
      ORDER BY dm.full_id
    `);

    // Load ineligible (working + free but no tools) for reporting
    const { rows: ineligibleRows } = await client.query(`
      SELECT dm.full_id AS id
      FROM datapoint_models dm
      WHERE dm.is_free = true
        AND dm.supports_tools IS NOT TRUE
        AND dm.status_result = 'working'
        AND dm.is_removed = false
    `);

    // Load best_for tags for eligible datapoint models
    const eligibleFullIds = new Set(eligibleRows.map((m) => m.id));
    const { rows: featureRows } = await client.query(`
      SELECT dm.full_id, dmf.value
      FROM datapoint_model_features dmf
      JOIN datapoint_models dm ON dm.id = dmf.datapoint_model_id
      WHERE dmf.feature_type = 'best_for'
        AND dm.status_result = 'working'
    `);
    const bestForMap = new Map();
    for (const r of featureRows) {
      if (!eligibleFullIds.has(r.full_id)) continue;
      if (!bestForMap.has(r.full_id)) bestForMap.set(r.full_id, []);
      bestForMap.get(r.full_id).push(r.value);
    }

    // Attach best_for to models
    const eligible = eligibleRows.map((m) => ({
      ...m,
      best_for: bestForMap.get(m.id) || [],
    }));

    if (ineligibleRows.length > 0) {
      console.log('Ineligible (supports_tools!=true, excluded from rankings):');
      for (const m of ineligibleRows) console.log('  ' + m.id);
      console.log('');
    }

    // Load benchmark scores for eligible models
    const eligibleDbIds = eligible.map((m) => m.db_id);
    const scoreMap = new Map();
    let scoredCount = 0;
    if (eligibleDbIds.length > 0) {
      const { rows: scoreRows } = await client.query(`
        SELECT dm.full_id, ms.source, ms.score_type, ms.score_value
        FROM model_scores ms
        JOIN datapoint_models dm ON dm.id = ms.datapoint_model_id
        WHERE dm.id = ANY($1)
      `, [eligibleDbIds]);
      for (const r of scoreRows) {
        if (!scoreMap.has(r.full_id)) scoreMap.set(r.full_id, []);
        scoreMap.get(r.full_id).push({ source: r.source, score_type: r.score_type, score_value: Number(r.score_value) });
      }
      scoredCount = new Set(scoreRows.map(r => r.full_id)).size;
    }

    console.log(`Eligible models: ${eligible.length} (${scoredCount} with benchmark scores)\n`);

    // ── Scoring helpers ──
    const CTX_NORM = 1048756;

    function ctxScore(m) {
      if (!m.context_length) return -0.5;
      return m.context_length / CTX_NORM;
    }

    function findScore(scores, type, source) {
      const s = scores?.find((s) => s.score_type === type && (!source || s.source === source));
      return s ? s.score_value : null;
    }

    function tagBonus(m, keywords) {
      let bonus = 0;
      const tags = (m.best_for || []).map((t) => t.toLowerCase());
      for (const kw of keywords) {
        for (const tag of tags) {
          if (tag.includes(kw)) {
            bonus += 1;
            break;
          }
        }
      }
      return bonus;
    }

    function qualityScore(m, role, source) {
      const scores = scoreMap.get(m.id);
      if (!scores || scores.length === 0) return 0;
      const intelligence = findScore(scores, 'intelligence', source);
      const speed = findScore(scores, 'output_speed', source);
      const coding = findScore(scores, 'aider-polyglot', source) || findScore(scores, 'swe-bench-verified', source);
      const latency = findScore(scores, 'latency_total', source);
      let qs = 0;
      if (intelligence !== null && ['model', 'build', 'general', 'explore'].includes(role)) {
        qs += Math.max(0, intelligence / 40);
      }
      if (role === 'build' && coding !== null) {
        qs += Math.min(coding / 30, 1.5);
      }
      if (['general', 'small_model'].includes(role) && speed !== null) {
        qs += Math.min(speed / 80, 1.5);
      }
      if (role === 'small_model' && latency !== null && latency > 0) {
        qs -= Math.min(latency / 4, 1);
      }
      return Math.max(0, Math.min(qs, 3));
    }

    // ── Role definitions ──
    const ROLES = {
      model: {
        description: 'Primary model — agentic, large context, best overall capability',
        ctxWeight: 1.2,
        tagKeywords: ['agentic', 'tool', 'reasoning', 'current default', 'general purpose'],
      },
      build: {
        description: 'Coding-focused tasks',
        ctxWeight: 0.6,
        tagKeywords: ['coding', 'code', 'refactor', 'agentic', 'tool'],
      },
      general: {
        description: 'Balanced everyday use — prefer speed + multimodal over raw size',
        ctxWeight: 0.5,
        tagKeywords: ['general', 'multimodal', 'fast', 'lightweight', 'chinese'],
      },
      small_model: {
        description: 'Lightweight, fast responses — prefer smaller context',
        ctxWeight: 0.0,
        tagKeywords: ['lightweight', 'ultra-lightweight', 'fast', 'quick', 'small'],
      },
      explore: {
        description: 'Interesting models to try — diverse, experimental',
        ctxWeight: 0.3,
        tagKeywords: ['thinking', 'reasoning', 'multimodal', 'new'],
      },
    };

    // ── Score & rank ──
    const newRankings = {};
    const allScores = {};
    const allMeta = {};

    for (const [role, cfg] of Object.entries(ROLES)) {
      if (cfg.manual) {
        newRankings[role] = [];
        allScores[role] = [];
        continue;
      }

      const scored = eligible.map((m) => {
        const ctx = ctxScore(m);
        const tags = tagBonus(m, cfg.tagKeywords);
        const quality = qualityScore(m, role);
        const score = ctx * cfg.ctxWeight + tags + quality;
        const ctxContrib = ctx * cfg.ctxWeight;
        const matchedTags = (cfg.tagKeywords || []).filter((kw) =>
          (m.best_for || []).some((t) => t.toLowerCase().includes(kw.toLowerCase())),
        );
        return {
          id: m.id,
          score,
          ctx: m.context_length || 0,
          ctxScore: ctx,
          ctxWeight: cfg.ctxWeight,
          ctxContrib,
          tagBonus: tags,
          tagPenalty: 0,
          penaltyContrib: 0,
          nameSizePenalty: 0,
          matchedTags,
          matchedPenaltyTags: [],
          qualityBonus: quality,
        };
      });

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.ctx - a.ctx;
      });

      newRankings[role] = scored.map((s) => s.id);
      allScores[role] = scored;
      allMeta[role] = {
        description: cfg.description,
        ctxWeight: cfg.ctxWeight,
        tagKeywords: cfg.tagKeywords || [],
        tagPenaltyKeywords: cfg.tagPenaltyKeywords || [],
        nameSizePenalty: cfg.nameSizePenalty || false,
        maxCtx: cfg.maxCtx || null,
        needsTools: cfg.needsTools || false,
      };

      console.log(`\n${role} — top 5:`);
      for (let i = 0; i < Math.min(5, scored.length); i++) {
        const m = scored[i];
        const model = eligible.find((x) => x.id === m.id);
        const ctx = model.context_length
          ? model.context_length >= CTX_NORM
            ? (model.context_length / CTX_NORM).toFixed(1) + 'M'
            : Math.round(model.context_length / 1000) + 'K'
          : '?';
        console.log(`  #${i + 1} [${ctx}] score=${m.score.toFixed(2)} ${m.id}`);
      }
    }

    // ── Per-source ranking variants ──
    const SOURCES = ['artificial_analysis', 'modelsdev'];
    const allVariants = { combined: { ...newRankings, _scores: allScores, _meta: allMeta } };

    for (const source of SOURCES) {
      const srcRankings = {};
      const srcScores = {};
      const srcMeta = allMeta; // same role metadata

      for (const [role, cfg] of Object.entries(ROLES)) {
        if (cfg.manual) { srcRankings[role] = []; srcScores[role] = []; continue; }

        const scored = eligible.map((m) => {
          const ctx = ctxScore(m);
          const tags = tagBonus(m, cfg.tagKeywords);
          const quality = qualityScore(m, role, source);
          const score = ctx * cfg.ctxWeight + tags + quality;
          const ctxContrib = ctx * cfg.ctxWeight;
          const matchedTags = (cfg.tagKeywords || []).filter((kw) =>
            (m.best_for || []).some((t) => t.toLowerCase().includes(kw.toLowerCase())),
          );
          return { id: m.id, score, ctx: m.context_length || 0, ctxScore: ctx, ctxWeight: cfg.ctxWeight, ctxContrib, tagBonus: tags, tagPenalty: 0, penaltyContrib: 0, nameSizePenalty: 0, matchedTags, matchedPenaltyTags: [], qualityBonus: quality };
        });

        scored.sort((a, b) => { if (b.score !== a.score) return b.score - a.score; return b.ctx - a.ctx; });
        srcRankings[role] = scored.map((s) => s.id);
        srcScores[role] = scored;
      }

      allVariants[source] = { ...srcRankings, _scores: srcScores, _meta: srcMeta };

      console.log(`\n-- ${source} --`);
      for (const role of Object.keys(ROLES)) {
        console.log(`  ${role}: ${srcRankings[role].slice(0, 3).join(', ')}`);
      }
    }

    // Benchmarks-only variant: pure qualityScore, no context or tags
    {
      const bmRankings = {};
      const bmScores = {};
      for (const [role, cfg] of Object.entries(ROLES)) {
        if (cfg.manual) { bmRankings[role] = []; bmScores[role] = []; continue; }
        const scored = eligible.map((m) => {
          const quality = qualityScore(m, role, null);
          return { id: m.id, score: quality, ctx: m.context_length || 0, ctxScore: 0, ctxWeight: 0, ctxContrib: 0, tagBonus: 0, tagPenalty: 0, penaltyContrib: 0, nameSizePenalty: 0, matchedTags: [], matchedPenaltyTags: [], qualityBonus: quality };
        });
        scored.sort((a, b) => b.score - a.score);
        bmRankings[role] = scored.map((s) => s.id);
        bmScores[role] = scored;
      }
      allVariants._benchmarks = { ...bmRankings, _scores: bmScores, _meta: allMeta };

      console.log('\n-- benchmarks only --');
      for (const role of Object.keys(ROLES)) {
        console.log(`  ${role}: ${bmRankings[role].slice(0, 3).join(', ')}`);
      }
    }

    // ── Diff against current rankings in DB ──
    const { rows: metaRows } = await client.query(
      "SELECT value::text FROM metadata WHERE key = '_role_rankings'",
    );
    const oldRankings = metaRows.length > 0 ? JSON.parse(metaRows[0].value) : {};

    console.log('\n-- Diff --');
    for (const role of Object.keys(ROLES)) {
      const oldList = oldRankings[role] || [];
      const newList = newRankings[role];
      if (JSON.stringify(oldList) === JSON.stringify(newList)) {
        console.log(`  ${role}: unchanged (${newList.length} models)`);
      } else {
        const added = newList.filter((id) => !oldList.includes(id));
        const removed = oldList.filter((id) => !newList.includes(id));
        console.log(`  ${role}: ${oldList.length} → ${newList.length} models`);
        for (const id of added) console.log(`    + ${id}`);
        for (const id of removed) console.log(`    - ${id}`);
      }
    }

    // ── Apply ──
    if (APPLY) {
      await client.query('BEGIN');
      const rankingsWithMeta = { ...newRankings, _variants: allVariants, _scores: allScores, _meta: allMeta };
      await client.query(
        `INSERT INTO metadata (key, value) VALUES ('_role_rankings', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(rankingsWithMeta)],
      );
      await client.query('COMMIT');
      console.log('\nRankings updated in PostgreSQL metadata');

      // Export to JSON
      const exportData = require('./export-from-pg');
      await exportData(pool);
      console.log('JSON exported');
    } else {
      console.log('\nReport mode. Use --apply to write changes.');
    }

    console.log(
      `\nDone. ${eligible.length} eligible models ranked across ${Object.keys(ROLES).length} roles.`,
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
