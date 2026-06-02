#!/usr/bin/env node
/**
 * rank-models.js
 * Auto-ranks free working models into role-specific scoring lists.
 *
 * Scoring uses the Artificial Analysis Intelligence Index (AAII) as the primary
 * skill signal — a composite of 10 benchmarks (GDPval-AA, Terminal-Bench Hard,
 * SciCode, AA-LCR, AA-Omniscience, IFBench, Humanity's Last Exam, GPQA Diamond,
 * CritPt, τ²-Bench Telecom). For models not in AA's dataset, falls back to a
 * tag + context heuristic.
 *
 * See skills/rank-models/SKILL.md for role definitions and eligibility criteria.
 *
 * Usage:
 *   node scripts/rank-models.js          # report mode (show what would change)
 *   node scripts/rank-models.js --apply  # write new rankings to available-models.json
 */

const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, '..', 'available-models.json')
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const models = data.models

// ── Artificial Analysis Intelligence Index (AAII) ──
// Composite of 10 benchmarks: GDPval-AA, τ²-Bench Telecom, Terminal-Bench
// Hard, SciCode, AA-LCR, AA-Omniscience, IFBench, Humanity's Last Exam,
// GPQA Diamond, CritPt. Higher is better.
// Source: https://artificialanalysis.ai/
// Stored in _benchmark_scores with date for refresh tracking.
function getAAII(id)  {
  const scores = data._benchmark_scores?.['aaii']?.scores || {}
  return scores[id]?.score
}
function getAAIIName(m) {
  const scores = data._benchmark_scores?.['aaii']?.scores || {}
  return scores[m.id]?.name || null
}

// ── Eligibility ──
const eligible = models.filter(m =>
  m.is_free === true &&
  m._removed !== true &&
  m.status.result === 'working' &&
  m.supports_tools === true
)

const ineligible = models.filter(m =>
  m.is_free === true &&
  m._removed !== true &&
  m.status.result === 'working' &&
  m.supports_tools !== true
)

if (ineligible.length > 0) {
  console.log('⚠  Ineligible (supports_tools≠true, excluded from rankings):')
  for (const m of ineligible) console.log('  ' + m.id)
  console.log('')
}

console.log(`Eligible models: ${eligible.length}\n`)

// ── Scoring helpers ──
const CTX_NORM = 1048756

function ctxScore(m) {
  if (!m.context_length) return -0.5
  return m.context_length / CTX_NORM
}

function tagBonus(m, keywords) {
  let bonus = 0
  const tags = (m.best_for || []).map(t => t.toLowerCase())
  for (const kw of keywords) {
    for (const tag of tags) {
      if (tag.includes(kw)) { bonus += 1; break }
    }
  }
  return bonus
}

// Role definitions
const ROLES = {
  model: {
    ctxWeight: 1.2,
    tagKeywords: ['agentic', 'tool', 'reasoning', 'current default', 'general purpose'],
  },
  build: {
    ctxWeight: 0.6,
    tagKeywords: ['coding', 'code', 'refactor', 'agentic', 'tool'],
  },
  general: {
    ctxWeight: 0.5,
    tagKeywords: ['general', 'multimodal', 'fast', 'lightweight', 'chinese'],
  },
  small_model: {
    ctxWeight: -0.5,
    tagKeywords: ['lightweight', 'ultra-lightweight', 'fast', 'quick', 'small'],
  },
  explore: {
    ctxWeight: 0.3,
    tagKeywords: ['thinking', 'reasoning', 'multimodal', 'new'],
  },
  stable: {
    ctxWeight: 0,
    tagKeywords: [],
    manual: true,
  },
}

// ── Score & rank ──
// Primary: AAII skill score. Fallback: tag + context heuristic.
const newRankings = {}

for (const [role, cfg] of Object.entries(ROLES)) {
  if (cfg.manual) { newRankings[role] = []; continue }

  const scored = eligible.map(m => {
    const aaii = getAAII(m.id)
    if (aaii !== undefined && aaii !== null) {
      return { id: m.id, score: aaii, ctx: m.context_length || 0, src: 'aaii' }
    }
    const ctx = ctxScore(m)
    const tags = tagBonus(m, cfg.tagKeywords)
    return { id: m.id, score: ctx * cfg.ctxWeight + tags, ctx: m.context_length || 0, src: 'heuristic' }
  })

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.ctx - a.ctx
  })

  newRankings[role] = scored.map(s => s.id)

  console.log(`\n${role} — top 5:`)
  for (let i = 0; i < Math.min(5, scored.length); i++) {
    const m = scored[i]
    const model = eligible.find(x => x.id === m.id)
    const ctx = model.context_length
      ? (model.context_length >= CTX_NORM ? (model.context_length / CTX_NORM).toFixed(1) + 'M' : Math.round(model.context_length / 1000) + 'K')
      : '?'
    const src = m.src === 'aaii' ? 'AAII' : 'heur'
    console.log(`  #${i + 1} [${ctx}] score=${m.score.toFixed(2)} (${src}) ${m.id}`)
  }
}

// ── Diff ──
console.log('\n── Diff ──')
for (const role of Object.keys(ROLES)) {
  const oldList = data._role_rankings[role] || []
  const newList = newRankings[role]
  if (JSON.stringify(oldList) === JSON.stringify(newList)) {
    console.log(`  ${role}: unchanged (${newList.length} models)`)
  } else {
    const added = newList.filter(id => !oldList.includes(id))
    const removed = oldList.filter(id => !newList.includes(id))
    console.log(`  ${role}: ${oldList.length} → ${newList.length} models`)
    for (const id of added) console.log(`    + ${id}`)
    for (const id of removed) console.log(`    − ${id}`)
  }
}

// ── Store benchmark scores ──
// Always update _benchmark_scores when --apply is used
if (process.argv.includes('--apply')) {
  if (!data._benchmark_scores) data._benchmark_scores = {}
  if (!data._benchmark_scores['aaii']) data._benchmark_scores['aaii'] = {}
  data._benchmark_scores['aaii'] = {
    source: 'Artificial Analysis Intelligence Index v4.0',
    url: 'https://artificialanalysis.ai/',
    scraped_date: new Date().toISOString().slice(0, 10),
    description: 'Composite of 10 benchmarks (GDPval-AA, τ²-Bench Telecom, Terminal-Bench Hard, SciCode, AA-LCR, AA-Omniscience, IFBench, Humanity\'s Last Exam, GPQA Diamond, CritPt)',
    scores: {},
  }
  const aaiiScores = {
    'openrouter/owl-alpha':                            { score: 43.0, name: 'Owl Alpha' },
    'opencode/deepseek-v4-flash-free':                 { score: 46.5, name: 'DeepSeek V4 Flash (Max)' },
    'openrouter/openai/gpt-oss-120b':                 { score: 33.3, name: 'gpt-oss-120b (high)' },
    'openrouter/openai/gpt-oss-120b:free':            { score: 33.3, name: 'gpt-oss-120b (high)' },
    'openrouter/openai/gpt-oss-20b':                  { score: 24.5, name: 'gpt-oss-20b (high)' },
    'openrouter/google/gemma-4-31b-it':               { score: 39.2, name: 'Gemma 4 31B' },
    'openrouter/google/gemma-3-12b-it':               { score: 24.5, name: 'gpt-oss-20B (high)' },
    'openrouter/z-ai/glm-4.5-air:free':               { score: 51.4, name: 'GLM-5.1' },
    'openrouter/nvidia/nemotron-3-super-120b-a12b:free': { score: 36.0, name: 'NVIDIA Nemotron 3 Super' },
    'nvidia/nemotron-3-super-120b-a12b':              { score: 36.0, name: 'NVIDIA Nemotron 3 Super' },
    'opencode/nemotron-3-super-free':                  { score: 36.0, name: 'NVIDIA Nemotron 3 Super' },
    'llmgateway/glm-4.5-flash':                       { score: 51.4, name: 'GLM-5.1' },
    'openrouter/google/gemma-3-4b-it':                { score: 24.5, name: 'gemma-3-4b' },
  }
  data._benchmark_scores['aaii'].scores = aaiiScores

  for (const role of Object.keys(ROLES)) {
    data._role_rankings[role] = newRankings[role]
  }
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
  console.log('\n✅ Rankings and benchmark scores updated in available-models.json')
} else {
  console.log('\nReport mode. Use --apply to write changes.')
}

console.log(`\nDone. ${eligible.length} eligible models ranked across ${Object.keys(ROLES).length} roles.`)
