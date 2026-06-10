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

// Quantization adjustment factors — applied as a multiplicative penalty
// to the final score when a datapoint has a quantization format set.
// Small penalty (0.5–2%) only acts as a tiebreaker when scores are close.
const QUANT_ADJUSTMENT = {
  fp16: 1.00,
  bf16: 1.00,
  fp8: 0.995,
  int8: 0.99,
  fp4: 0.98,
  int4: 0.98,
  gguf: 0.98,
  awq: 0.98,
  gptq: 0.98,
  bnb: 0.98,
  quantized: 0.985,
  default: 1.00,
};

function getQuantFactor(quantization) {
  if (!quantization) return 1.0;
  const factor = QUANT_ADJUSTMENT[quantization];
  return factor !== undefined ? factor : QUANT_ADJUSTMENT.default;
}

async function rankModels() {
  const client = await pool.connect();
  try {
    // Load eligible models: free + working + tools + not removed
    const { rows: eligibleRows } = await client.query(`
      SELECT dm.id AS db_id, dm.full_id AS id, mm.name, dm.context_length, dm.is_free, dm.supports_tools,
             dm.quantization, dp.name AS provider
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

    // Load release_date and last_updated features for freshness scoring (#6)
    const { rows: dateFeatRows } = await client.query(`
      SELECT dm.full_id, dmf.feature_type, dmf.value
      FROM datapoint_model_features dmf
      JOIN datapoint_models dm ON dm.id = dmf.datapoint_model_id
      WHERE dmf.feature_type IN ('release_date', 'last_updated')
        AND dm.status_result = 'working'
    `);
    const releaseDateMap = new Map();
    const lastUpdatedMap = new Map();
    for (const r of dateFeatRows) {
      if (r.feature_type === 'release_date') releaseDateMap.set(r.full_id, r.value);
      if (r.feature_type === 'last_updated') lastUpdatedMap.set(r.full_id, r.value);
    }

    // Load deprecated_at from datapoint_models
    const { rows: depRows } = await client.query(`
      SELECT full_id, deprecated_at
      FROM datapoint_models
      WHERE full_id = ANY($1) AND deprecated_at IS NOT NULL
    `, [[...eligibleFullIds]]);
    const deprecatedMap = new Map(depRows.map(r => [r.full_id, r.deprecated_at]));

    // Attach best_for and date fields to models
    const eligible = eligibleRows.map((m) => ({
      ...m,
      best_for: bestForMap.get(m.id) || [],
      release_date: releaseDateMap.get(m.id) || null,
      last_updated: lastUpdatedMap.get(m.id) || null,
      deprecated_at: deprecatedMap.get(m.id) || null,
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
        SELECT dm.full_id, ms.source, ms.score_type, ms.score_value, ms.fetched_at
        FROM model_scores ms
        JOIN datapoint_models dm ON dm.id = ms.datapoint_model_id
        WHERE dm.id = ANY($1)
      `, [eligibleDbIds]);
      for (const r of scoreRows) {
        if (!scoreMap.has(r.full_id)) scoreMap.set(r.full_id, []);
        scoreMap.get(r.full_id).push({ source: r.source, score_type: r.score_type, score_value: Number(r.score_value), fetched_at: r.fetched_at });
      }
      scoredCount = new Set(scoreRows.map(r => r.full_id)).size;
    }

    console.log(`Eligible models: ${eligible.length} (${scoredCount} with benchmark scores)\n`);

    // ── Pre-compute normalization bounds from observed data (Items 1-3, 6) ──
    const scoreTypeStats = new Map();
    for (const scores of scoreMap.values()) {
      for (const s of scores) {
        const v = Number(s.score_value);
        if (!isFinite(v)) continue;
        let stats = scoreTypeStats.get(s.score_type);
        if (!stats) { stats = { max: 0, sum: 0, count: 0 }; scoreTypeStats.set(s.score_type, stats); }
        stats.max = Math.max(stats.max, Math.abs(v));
        stats.sum += v; stats.count++;
      }
    }
    for (const [, stats] of scoreTypeStats) stats.mean = stats.count > 0 ? stats.sum / stats.count : 1;

    const maxContext = Math.max(...eligible.map((m) => m.context_length || 0), 1);

    function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
    function sigSquash(x, mean) {
      if (!x || !mean || mean <= 0) return 0;
      return 2 * sigmoid(2 * x / mean) - 1;
    }

    // ── Freshness scoring (#6): release_date, last_updated, deprecated_at ──
    function modelFreshnessScore(m) {
      if (m.deprecated_at) return -3.0;
      const releaseDate = m.release_date || null;
      const lastUpdated = m.last_updated || null;
      let score = 0;
      if (releaseDate) {
        const releaseMs = new Date(releaseDate).getTime();
        if (!isNaN(releaseMs)) {
          const ageDays = (Date.now() - releaseMs) / 864e5;
          if (ageDays <= 180) score = 1.5;       // released within 6 months
          else if (ageDays <= 365) score = 0.5;   // released within 1 year
          else score = -0.5;                       // older than 1 year
        }
      }
      // If not recently released but has a recent update, small boost
      if (score <= 0 && lastUpdated && !m.deprecated_at) {
        const updatedMs = new Date(lastUpdated).getTime();
        if (!isNaN(updatedMs)) {
          const updateAgeDays = (Date.now() - updatedMs) / 864e5;
          if (updateAgeDays <= 90) score = Math.max(score, 0.3);
        }
      }
      return score;
    }

    // Time-decay: ~90-day half-life (benchmark score freshness)
    const HALF_LIFE_DAYS = 90;
    const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_DAYS;
    function freshnessWeight(fetchedAt) {
      if (!fetchedAt) return 1;
      const days = (Date.now() - new Date(fetchedAt).getTime()) / 864e5;
      return Math.exp(-DECAY_LAMBDA * Math.max(0, days));
    }

    // ── Scoring helpers ──
    function ctxScore(m) {
      if (!m.context_length) return -0.5;
      return m.context_length / maxContext;
    }

    // findDecayedScore applies time-decay freshness weight (Item 6)
    function findDecayedScore(scores, type, source) {
      const s = scores?.find((s) => s.score_type === type && (!source || s.source === source));
      return s ? s.score_value * freshnessWeight(s.fetched_at) : null;
    }

    // tagBonus normalized by total keywords per role (Item 4)
    function tagBonus(m, keywords) {
      if (!keywords || keywords.length === 0) return 0;
      let matched = 0;
      const tags = (m.best_for || []).map((t) => t.toLowerCase());
      for (const kw of keywords) {
        for (const tag of tags) {
          if (tag.includes(kw)) { matched++; break; }
        }
      }
      return Math.min(matched / keywords.length, 1.0);
    }

    // qualityScore: population-adaptive normalization + sigmoid squash (Items 1, 2)
    // When linear=true, uses raw value/max scaling instead of sigmoid — preserves
    // full-range differentiation for pure-benchmark variants where this IS the score.
    // Returns { total, intel, coding, speed, latency } for transparency in the UI.
    function qualityScore(m, role, source, linear) {
      const scores = scoreMap.get(m.id);
      if (!scores || scores.length === 0) return { total: 0, intel: 0, coding: 0, speed: 0, latency: 0 };
      const intelligence = findDecayedScore(scores, 'intelligence', source);
      const speed = findDecayedScore(scores, 'output_speed', source);
      const coding = findDecayedScore(scores, 'aider-polyglot', source) || findDecayedScore(scores, 'swe-bench-verified', source);
      const latency = findDecayedScore(scores, 'latency_total', source);
      let intel = 0, cod = 0, spd = 0, lat = 0;
      if (intelligence !== null && ['model', 'build', 'general', 'explore'].includes(role)) {
        const maxI = scoreTypeStats.get('intelligence')?.max || 40;
        intel = linear ? (intelligence / Math.max(maxI, 1)) : Math.max(0, intelligence / maxI);
      }
      if (role === 'build' && coding !== null) {
        if (linear) {
          const cStats = scoreTypeStats.get('aider-polyglot') || scoreTypeStats.get('swe-bench-verified');
          cod = coding / Math.max(cStats?.max || 100, 1);
        } else {
          const cStats = scoreTypeStats.get('aider-polyglot') || scoreTypeStats.get('swe-bench-verified');
          cod = sigSquash(coding, cStats?.mean || 30);
        }
      }
      if (['general', 'small_model'].includes(role) && speed !== null) {
        if (linear) {
          spd = Math.min(speed / Math.max(scoreTypeStats.get('output_speed')?.max || 300, 1), 1);
        } else {
          spd = sigSquash(speed, scoreTypeStats.get('output_speed')?.mean || 80);
        }
      }
      if (role === 'small_model' && latency !== null && latency > 0) {
        if (linear) {
          lat = Math.min(latency / Math.max(scoreTypeStats.get('latency_total')?.max || 100, 1), 1);
        } else {
          lat = sigSquash(latency, scoreTypeStats.get('latency_total')?.mean || 4);
        }
      }
      const total = linear
        ? Math.max(0, intel + cod + spd - lat)
        : Math.max(0, Math.min(intel + cod + spd - lat, 3));
      return { total, intel, coding: cod, speed: spd, latency: lat };
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
        const q = qualityScore(m, role);
        const freshness = modelFreshnessScore(m);
        const score = (ctx * cfg.ctxWeight + tags + q.total + freshness) * getQuantFactor(m.quantization);
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
          qualityBonus: q.total,
          qualityIntel: q.intel,
          qualityCoding: q.coding,
          qualitySpeed: q.speed,
          qualityLatency: q.latency,
          freshness,
          releaseDate: m.release_date || null,
          deprecated: !!m.deprecated_at,
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
          ? model.context_length >= 1000000
            ? (model.context_length / 1000000).toFixed(1) + 'M'
            : Math.round(model.context_length / 1000) + 'K'
          : '?';
        console.log(`  #${i + 1} [${ctx}] score=${m.score.toFixed(2)} ${m.id}`);
      }
    }

    // ── Per-source ranking variants ──
    const SOURCES = ['artificial_analysis', 'modelsdev'];
    const allVariants = { combined: { ...newRankings, _scores: allScores, _meta: allMeta } };

    const SOURCE_DESCRIPTIONS = {
      artificial_analysis: {
        model: 'Primary model — ranked by AA Intelligence Index (quality evaluation)',
        build: 'Coding tasks — ranked by AA Intelligence + output speed',
        general: 'Everyday use — ranked by AA Intelligence + speed + latency',
        small_model: 'Lightweight models — ranked by output speed + low latency',
        explore: 'Experimental — ranked by AA Intelligence + multimodal signals',
      },
      modelsdev: {
        model: 'Primary model — ranked by models.dev coding benchmarks',
        build: 'Coding tasks — ranked by SWE-Bench Verified, Aider Polyglot, SciCode',
        general: 'Everyday use — ranked by coding benchmarks + terminal benchmarks',
        small_model: 'Lightweight models — ranked by benchmark efficiency scores',
        explore: 'Experimental — ranked by diverse benchmark coverage',
      },
    };

    const BM_DESCRIPTIONS = {
      model: 'Pure benchmark scores — zero context length or tag weighting. Matches external leaderboards.',
      build: 'Coding benchmarks only — SWE-Bench, Aider Polyglot, SciCode, Terminal-Bench. No context bonus.',
      general: 'Speed + intelligence benchmarks only — output speed, latency, AA Intelligence. No context bonus.',
      small_model: 'Speed + latency benchmarks only — fastest models win. Context length ignored entirely.',
      explore: 'Diverse benchmarks — all available scores weighted equally. No context or tag bias.',
    };

    for (const source of SOURCES) {
      const srcRankings = {};
      const srcScores = {};
      const srcMeta = {};
      const descMap = SOURCE_DESCRIPTIONS[source];

      for (const [role, cfg] of Object.entries(ROLES)) {
        if (cfg.manual) { srcRankings[role] = []; srcScores[role] = []; continue; }

        // Pure benchmark ranking — no context, no tags. Matches source website 1-to-1.
        const scored = eligible.map((m) => {
          const q = qualityScore(m, role, source, true);
          return { id: m.id, score: q.total * getQuantFactor(m.quantization), ctx: m.context_length || 0, ctxScore: 0, ctxWeight: 0, ctxContrib: 0, tagBonus: 0, tagPenalty: 0, penaltyContrib: 0, nameSizePenalty: 0, matchedTags: [], matchedPenaltyTags: [], qualityBonus: q.total, qualityIntel: q.intel, qualityCoding: q.coding, qualitySpeed: q.speed, qualityLatency: q.latency, freshness: 0, releaseDate: null, deprecated: false };
        });

        scored.sort((a, b) => b.score - a.score);
        srcRankings[role] = scored.map((s) => s.id);
        srcScores[role] = scored;
        srcMeta[role] = {
          description: descMap[role] || cfg.description,
          ctxWeight: 0,
          tagKeywords: [],
          tagPenaltyKeywords: [],
          nameSizePenalty: false,
          maxCtx: null,
          needsTools: false,
        };
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
      const bmMeta = {};
      for (const [role, cfg] of Object.entries(ROLES)) {
        if (cfg.manual) { bmRankings[role] = []; bmScores[role] = []; continue; }
        const scored = eligible.map((m) => {
          const q = qualityScore(m, role, 'artificial_analysis', true);
          return { id: m.id, score: q.total * getQuantFactor(m.quantization), ctx: m.context_length || 0, ctxScore: 0, ctxWeight: 0, ctxContrib: 0, tagBonus: 0, tagPenalty: 0, penaltyContrib: 0, nameSizePenalty: 0, matchedTags: [], matchedPenaltyTags: [], qualityBonus: q.total, qualityIntel: q.intel, qualityCoding: q.coding, qualitySpeed: q.speed, qualityLatency: q.latency, freshness: 0, releaseDate: null, deprecated: false };
        });
        scored.sort((a, b) => b.score - a.score);
        bmRankings[role] = scored.map((s) => s.id);
        bmScores[role] = scored;
        bmMeta[role] = {
          description: BM_DESCRIPTIONS[role] || cfg.description,
          ctxWeight: 0,
          tagKeywords: [],
          tagPenaltyKeywords: [],
          nameSizePenalty: false,
          maxCtx: null,
          needsTools: false,
        };
      }
      allVariants._benchmarks = { ...bmRankings, _scores: bmScores, _meta: bmMeta };

      console.log('\n-- benchmarks only --');
      for (const role of Object.keys(ROLES)) {
        console.log(`  ${role}: ${bmRankings[role].slice(0, 3).join(', ')}`);
      }
    }

    // ── Bootstrap confidence intervals (Item 5) ──

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
