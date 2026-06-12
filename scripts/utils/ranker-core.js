/**
 * ranker-core.js — Shared ranking/scoring engine for free AND paid models.
 *
 * Extracted from rank-models.js + rank-paid-models.js (which were ~90% identical).
 * All scoring functions, role definitions, variant builders live here.
 * The entry point scripts/rank.js handles the free/paid split at the query level.
 */

// ── Quantization adjustment ──
const QUANT_ADJUSTMENT = {
  fp16: 1.0,
  bf16: 1.0,
  fp8: 0.995,
  int8: 0.99,
  fp4: 0.98,
  int4: 0.98,
  gguf: 0.98,
  awq: 0.98,
  gptq: 0.98,
  bnb: 0.98,
  quantized: 0.985,
  default: 1.0,
};

function getQuantFactor(quantization) {
  if (!quantization) return 1.0;
  const factor = QUANT_ADJUSTMENT[quantization];
  return factor !== undefined ? factor : QUANT_ADJUSTMENT.default;
}

// ── Math helpers ──
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}
function sigSquash(x, mean) {
  if (!x || !mean || mean <= 0) return 0;
  return 2 * sigmoid((2 * x) / mean) - 1;
}

// ── Time-decay for benchmark scores ──
const HALF_LIFE_DAYS = 90;
const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_DAYS;
function freshnessWeight(fetchedAt) {
  if (!fetchedAt) return 1;
  const days = (Date.now() - new Date(fetchedAt).getTime()) / 864e5;
  return Math.exp(-DECAY_LAMBDA * Math.max(0, days));
}

// ── Scoring helpers ──
function ctxScore(m, maxContext) {
  if (!m.context_length) return -0.5;
  return m.context_length / maxContext;
}

function findDecayedScore(scores, type, source) {
  const s = scores?.find((s) => s.score_type === type && (!source || s.source === source));
  return s ? s.score_value * freshnessWeight(s.fetched_at) : null;
}

function tagBonus(m, keywords) {
  if (!keywords || keywords.length === 0) return 0;
  let matched = 0;
  const tags = (m.best_for || []).map((t) => t.toLowerCase());
  for (const kw of keywords) {
    for (const tag of tags) {
      if (tag.includes(kw)) {
        matched++;
        break;
      }
    }
  }
  return Math.min(matched / keywords.length, 1.0);
}

function modelFreshnessScore(m) {
  if (m.deprecated_at) return -3.0;
  const releaseDate = m.release_date || null;
  const lastUpdated = m.last_updated || null;
  let score = 0;
  if (releaseDate) {
    const releaseMs = new Date(releaseDate).getTime();
    if (!isNaN(releaseMs)) {
      const ageDays = (Date.now() - releaseMs) / 864e5;
      if (ageDays <= 180) score = 1.5;
      else if (ageDays <= 365) score = 0.5;
      else score = -0.5;
    }
  }
  if (score <= 0 && lastUpdated && !m.deprecated_at) {
    const updatedMs = new Date(lastUpdated).getTime();
    if (!isNaN(updatedMs)) {
      const updateAgeDays = (Date.now() - updatedMs) / 864e5;
      if (updateAgeDays <= 90) score = Math.max(score, 0.3);
    }
  }
  return score;
}

function qualityScore(m, role, scoreMap, scoreTypeStats, source, linear) {
  const scores = scoreMap.get(m.id);
  if (!scores || scores.length === 0)
    return { total: 0, intel: 0, coding: 0, speed: 0, latency: 0 };
  const intelligence = findDecayedScore(scores, 'intelligence', source);
  const speed = findDecayedScore(scores, 'output_speed', source);
  const coding =
    findDecayedScore(scores, 'aider-polyglot', source) ||
    findDecayedScore(scores, 'swe-bench-verified', source);
  const latency = findDecayedScore(scores, 'latency_total', source);
  let intel = 0,
    cod = 0,
    spd = 0,
    lat = 0;
  if (intelligence !== null && ['model', 'build', 'general', 'explore'].includes(role)) {
    const maxI = scoreTypeStats.get('intelligence')?.max || 60;
    intel = linear ? intelligence / Math.max(maxI, 1) : Math.max(0, intelligence / maxI);
  }
  if (role === 'build' && coding !== null) {
    if (linear) {
      const cStats =
        scoreTypeStats.get('aider-polyglot') || scoreTypeStats.get('swe-bench-verified');
      cod = coding / Math.max(cStats?.max || 50, 1);
    } else {
      const cStats =
        scoreTypeStats.get('aider-polyglot') || scoreTypeStats.get('swe-bench-verified');
      cod = sigSquash(coding, cStats?.mean || 25);
    }
  }
  if (['general', 'small_model'].includes(role) && speed !== null) {
    if (linear) {
      spd = Math.min(speed / Math.max(scoreTypeStats.get('output_speed')?.max || 150, 1), 1);
    } else {
      spd = sigSquash(speed, scoreTypeStats.get('output_speed')?.mean || 60);
    }
  }
  if (role === 'small_model' && latency !== null && latency > 0) {
    if (linear) {
      lat = Math.min(latency / Math.max(scoreTypeStats.get('latency_total')?.max || 20, 1), 1);
    } else {
      lat = sigSquash(latency, scoreTypeStats.get('latency_total')?.mean || 2);
    }
  }
  // Soft cap via tanh — preserves differentiation at the high end
  // instead of hard-clamping all top models to the same value
  const sum = intel + cod + spd - lat;
  const total = linear ? Math.max(0, sum) : Math.max(0, 3 * Math.tanh(sum / 2));
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

// ── Source variants ──
const SOURCES = ['artificial_analysis', 'modelsdev'];

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
  model:
    'Pure benchmark scores — zero context length or tag weighting. Matches external leaderboards.',
  build:
    'Coding benchmarks only — SWE-Bench, Aider Polyglot, SciCode, Terminal-Bench. No context bonus.',
  general:
    'Speed + intelligence benchmarks only — output speed, latency, AA Intelligence. No context bonus.',
  small_model:
    'Speed + latency benchmarks only — fastest models win. Context length ignored entirely.',
  explore: 'Diverse benchmarks — all available scores weighted equally. No context or tag bias.',
};

// ── Pre-compute normalization bounds from benchmark data ──
function buildScoreTypeStats(scoreMap) {
  const stats = new Map();
  for (const scores of scoreMap.values()) {
    for (const s of scores) {
      const v = Number(s.score_value);
      if (!isFinite(v)) continue;
      let st = stats.get(s.score_type);
      if (!st) {
        st = { max: 0, sum: 0, count: 0 };
        stats.set(s.score_type, st);
      }
      st.max = Math.max(st.max, Math.abs(v));
      st.sum += v;
      st.count++;
    }
  }
  for (const [, st] of stats) st.mean = st.count > 0 ? st.sum / st.count : 1;
  return stats;
}

// ── Score a single model ──
function scoreModel(m, role, cfg, maxContext, scoreMap, scoreTypeStats) {
  const ctx = ctxScore(m, maxContext);
  const tags = tagBonus(m, cfg.tagKeywords);
  const q = qualityScore(m, role, scoreMap, scoreTypeStats, null, false);
  const freshness =
    m.release_date || m.last_updated || m.deprecated_at ? modelFreshnessScore(m) : 0;
  const score = (ctx * cfg.ctxWeight + tags + q.total + freshness) * getQuantFactor(m.quantization);
  return {
    id: m.id,
    score,
    ctx: m.context_length || 0,
    ctxScore: ctx,
    ctxWeight: cfg.ctxWeight,
    ctxContrib: ctx * cfg.ctxWeight,
    tagBonus: tags,
    tagPenalty: 0,
    penaltyContrib: 0,
    nameSizePenalty: 0,
    matchedTags: (cfg.tagKeywords || []).filter((kw) =>
      (m.best_for || []).some((t) => t.toLowerCase().includes(kw.toLowerCase())),
    ),
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
}

// ── Score a model for a source-specific variant (linear scoring, no context/tags) ──
function scoreModelSource(m, role, source, scoreMap, scoreTypeStats) {
  const q = qualityScore(m, role, scoreMap, scoreTypeStats, source, true);
  return {
    id: m.id,
    score: q.total * getQuantFactor(m.quantization),
    ctx: m.context_length || 0,
    ctxScore: 0,
    ctxWeight: 0,
    ctxContrib: 0,
    tagBonus: 0,
    tagPenalty: 0,
    penaltyContrib: 0,
    nameSizePenalty: 0,
    matchedTags: [],
    matchedPenaltyTags: [],
    qualityBonus: q.total,
    qualityIntel: q.intel,
    qualityCoding: q.coding,
    qualitySpeed: q.speed,
    qualityLatency: q.latency,
    freshness: 0,
    releaseDate: null,
    deprecated: false,
  };
}

// ── Build per-source ranking variants ──
function buildSourceVariants(eligible, scoreMap, scoreTypeStats) {
  const allVariants = {};

  for (const source of SOURCES) {
    const srcRankings = {};
    const srcScores = {};
    const srcMeta = {};
    const descMap = SOURCE_DESCRIPTIONS[source];

    for (const [role, cfg] of Object.entries(ROLES)) {
      if (cfg.manual) {
        srcRankings[role] = [];
        srcScores[role] = [];
        continue;
      }
      const scored = eligible.map((m) =>
        scoreModelSource(m, role, source, scoreMap, scoreTypeStats),
      );
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
  }

  return allVariants;
}

// ── Build benchmarks-only variant ──
function buildBenchmarkVariant(eligible, scoreMap, scoreTypeStats) {
  const bmRankings = {};
  const bmScores = {};
  const bmMeta = {};

  for (const [role, cfg] of Object.entries(ROLES)) {
    if (cfg.manual) {
      bmRankings[role] = [];
      bmScores[role] = [];
      continue;
    }
    const scored = eligible.map((m) =>
      scoreModelSource(m, role, 'artificial_analysis', scoreMap, scoreTypeStats),
    );
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

  return { ...bmRankings, _scores: bmScores, _meta: bmMeta };
}

// ── Build the base (combined) rankings ──
function buildBaseRankings(eligible, maxContext, scoreMap, scoreTypeStats) {
  const newRankings = {};
  const allScores = {};
  const allMeta = {};

  for (const [role, cfg] of Object.entries(ROLES)) {
    if (cfg.manual) {
      newRankings[role] = [];
      allScores[role] = [];
      continue;
    }

    const scored = eligible.map((m) =>
      scoreModel(m, role, cfg, maxContext, scoreMap, scoreTypeStats),
    );
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
  }

  return { newRankings, allScores, allMeta };
}

// ── Compute diff between old and new rankings ──
function diffRankings(oldRankings, newRankings) {
  const diffs = {};
  const allKeys = new Set([...Object.keys(oldRankings || {}), ...Object.keys(newRankings || {})]);
  for (const role of allKeys) {
    if (role.startsWith('_')) continue; // skip _variants, _scores, _meta
    const oldList = Array.isArray(oldRankings[role]) ? oldRankings[role] : [];
    const newList = Array.isArray(newRankings[role]) ? newRankings[role] : [];
    if (JSON.stringify(oldList) === JSON.stringify(newList)) {
      diffs[role] = { unchanged: true, count: newList.length };
    } else {
      const added = newList.filter((id) => !oldList.includes(id));
      const removed = oldList.filter((id) => !newList.includes(id));
      diffs[role] = {
        unchanged: false,
        oldCount: oldList.length,
        newCount: newList.length,
        added,
        removed,
      };
    }
  }
  return diffs;
}

module.exports = {
  QUANT_ADJUSTMENT,
  getQuantFactor,
  sigmoid,
  sigSquash,
  freshnessWeight,
  ctxScore,
  findDecayedScore,
  tagBonus,
  modelFreshnessScore,
  qualityScore,
  ROLES,
  SOURCES,
  SOURCE_DESCRIPTIONS,
  BM_DESCRIPTIONS,
  buildScoreTypeStats,
  scoreModel,
  scoreModelSource,
  buildSourceVariants,
  buildBenchmarkVariant,
  buildBaseRankings,
  diffRankings,
};
