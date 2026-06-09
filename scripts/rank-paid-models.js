#!/usr/bin/env node
/**
 * rank-paid-models.js
 * Auto-ranks paid models into role-specific scoring lists.
 *
 * Reads from PostgreSQL. On --apply, writes rankings to metadata table.
 *
 * Usage:
 *   node scripts/rank-paid-models.js          # report mode
 *   node scripts/rank-paid-models.js --apply  # write rankings to DB
 */

require('dotenv').config();
const pool = require('../server/db');
const APPLY = process.argv.includes('--apply');

async function rankModels() {
  const client = await pool.connect();
  try {
    // Load eligible paid models — no working status requirement (paid models aren't validated)
    const { rows: eligibleRows } = await client.query(`
      SELECT dm.id AS db_id, dm.full_id AS id, mm.name, dm.context_length, dm.is_free, dm.supports_tools,
             dp.name AS provider
      FROM datapoint_models dm
      JOIN super_models mm ON mm.id = dm.super_model_id
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE dm.is_free = false
        AND dm.is_removed = false
      ORDER BY dm.full_id
    `);

    // Load best_for tags for eligible datapoint models
    const eligibleFullIds = new Set(eligibleRows.map((m) => m.id));
    const { rows: featureRows } = await client.query(`
      SELECT dm.full_id, dmf.value
      FROM datapoint_model_features dmf
      JOIN datapoint_models dm ON dm.id = dmf.datapoint_model_id
      WHERE dmf.feature_type = 'best_for'
        AND dm.is_free = false
    `);
    const bestForMap = new Map();
    for (const r of featureRows) {
      if (!eligibleFullIds.has(r.full_id)) continue;
      if (!bestForMap.has(r.full_id)) bestForMap.set(r.full_id, []);
      bestForMap.get(r.full_id).push(r.value);
    }

    // Load stored descriptions for standalone inference
    const descMap = new Map();
    const { rows: descRows } = await client.query(`
      SELECT dm.full_id, dmf.value
      FROM datapoint_model_features dmf
      JOIN datapoint_models dm ON dm.id = dmf.datapoint_model_id
      WHERE dmf.feature_type = 'description'
        AND dm.is_free = false
    `);
    for (const r of descRows) {
      if (eligibleFullIds.has(r.full_id)) {
        descMap.set(r.full_id, r.value);
      }
    }

    // Infer best_for-like tags from model names when curated tags are absent.
    // Paid models lack curated best_for features, but names carry strong signals
    // (coder, flash, pro, mini, thinking, vision, etc.) that let role scoring
    // differentiate instead of collapsing to pure context-length ordering.
    function inferTags(name, description) {
      if (!name && !description) return [];
      const tags = [];

      // Name-based patterns
      if (name) {
        const n = name.toLowerCase();
        if (/\bcoder\b|\bcodex\b|\bdevstral\b|\bbuild\b/i.test(n)) tags.push('coding');
        if (/\bmulti.agent\b|\bagentic\b/i.test(n)) tags.push('agentic');
        if (/\bfunction.call|\btool.use|\btool\b/i.test(n)) tags.push('tool use');
        if (/\breasoning\b|\bdeep.research\b|\bdeep.think\b/i.test(n)) tags.push('reasoning');
        if (/\bthinking\b|\bthink\b/i.test(n)) tags.push('thinking');
        if (/\b(?:pro|plus|max|premier|large)\b/i.test(n)) tags.push('current default');
        if (/\bvision\b|\bvl\b|\bimage\b|\baudio\b|\bvideo\b|\bmultimodal\b/i.test(n)) tags.push('multimodal');
        if (/\bflash\b|\bfast\b|\bturbo\b|\bquick\b/i.test(n)) tags.push('fast');
        if (/\bnano\b|\bmicro\b|\btiny\b/i.test(n)) tags.push('ultra-lightweight');
        if (/\bmini\b|\bsmall\b|\blite\b/i.test(n)) tags.push('lightweight');
        if (/\bpreview\b|\bexp\b|\bexperimental\b|\balpha\b/i.test(n)) tags.push('new');
      }

      // Description-based patterns
      if (description) {
        const d = description.toLowerCase();
        if (/\bcoding\b|\bcoder\b|\bprogramming\b|\bsoftware.engineering\b/i.test(d)) tags.push('coding');
        if (/\bagentic\b|\bmulti.agent\b|\bautonomous.*agent\b|\bagent.*workflow\b/i.test(d)) tags.push('agentic');
        if (/\btool.using\b|\bfunction.calling\b|\bsupports.*tools\b|\bthousands.*tool\b/i.test(d)) tags.push('tool use');
        if (/\breasoning\b/i.test(d) && !/\bnon.reasoning\b|\bnot.reasoning\b/i.test(d)) tags.push('reasoning');
        if (/\bthinking\b|\bchain.of.thought\b/i.test(d)) tags.push('thinking');
        if (/\bmultimodal\b|\bvision.language\b|\bimage.*understanding\b/i.test(d)) tags.push('multimodal');
        if (/\bflagship\b|\bmost capable\b|\bpremier\b|\bhighest.quality\b|\bbest overall\b/i.test(d)) tags.push('current default');
        if (/\bgeneral purpose\b|\bgeneral.*tasks\b|\bversatile\b|\ball.?around\b/i.test(d)) tags.push('general purpose');
        if (/\blightweight\b|\bcompact\b|\befficient inference\b|\bsmall.*parameter\b/i.test(d)) tags.push('lightweight');
        if (/\bfast\b|\bhigh.speed\b|\blow.latency\b|\bquick\b|\brapid\b/i.test(d)) tags.push('fast');
        if (/\bcost.effective\b|\baffordable\b|\bbudget|\bvalue.*money\b/i.test(d)) tags.push('cost-efficient');
        if (/\bcreative\b|\bwriting\b|\bstorytelling\b|\bcontent.*creation\b/i.test(d)) tags.push('general chat');
        if (/\bresearch\b|\bscience\b|\bscientific\b|\bacademia\b/i.test(d)) tags.push('complex tasks');
        if (/\btranslation\b|\bmultilingual\b|\blanguage.*support\b/i.test(d)) tags.push('multilingual');
        if (/\bpreview\b|\bexp\b|\bexperimental\b|\balpha\b/i.test(d)) tags.push('new');
      }

      return [...new Set(tags)];
    }

    // Attach best_for to models — merge curated DB tags with name-inferred tags
    const eligible = eligibleRows.map((m) => {
      const curated = bestForMap.get(m.id) || [];
      const desc = descMap.get(m.id) || null;
      const inferred = inferTags(m.name, desc);
      const merged = [...new Set([...curated, ...inferred])];
      return { ...m, best_for: merged };
    });

    // Load benchmark scores from model_scores for eligible paid models
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
    console.log(`Eligible paid models: ${eligible.length} (${scoredCount} with benchmark scores)\n`);

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

    // Benchmark-based quality signal. Scored models get a 0-3 bonus
    // proportional to their intelligence/speed/coding benchmarks.
    // Unscored models get 0 — no penalty, just no bonus.
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
      const srcMeta = allMeta;

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

    // ── Diff against current paid rankings in DB ──
    const { rows: metaRows } = await client.query(
      "SELECT value::text FROM metadata WHERE key = '_role_rankings_paid'",
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
        `INSERT INTO metadata (key, value) VALUES ('_role_rankings_paid', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(rankingsWithMeta)],
      );
      await client.query('COMMIT');
      console.log('\nPaid rankings updated in PostgreSQL metadata');
    } else {
      console.log('\nReport mode. Use --apply to write changes.');
    }

    console.log(
      `\nDone. ${eligible.length} paid models ranked across ${Object.keys(ROLES).length} roles.`,
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
