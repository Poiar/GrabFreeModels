#!/usr/bin/env node
/**
 * rank-models.js
 * Auto-ranks free working models into role-specific lists.
 *
 * Algorithm:
 *   1. Only includes models where is_free=true, _removed≠true, status=working, supports_tools=true
 *   2. Scores each model per role based on context_length + best_for tag relevance
 *   3. Sorts by score descending within each role
 *
 * Role scoring:
 *   model       — context_length weight 1.0, bonus for agentic/tool/reasoning/general tags
 *   build       — context_length weight 0.6, bonus for coding/code/refactor/agentic tags
 *   general     — context_length weight 0.8, bonus for general/multimodal tags
 *   small_model — context_length weight -0.5 (prefer smaller), bonus for lightweight/fast/ultra tags
 *   explore     — context_length weight 0.3, bonus for diversity (provider spread) + new/unique tags
 *   stable      — context_length weight 0.5, bonus for proven/long-standing (currently empty; manually curated)
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
const CTX_NORM = 1048756 // 1M context as normalization baseline

function ctxScore(m) {
  if (!m.context_length) return -0.5 // penalize unknown context
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

// ── Role definitions ──
const ROLES = {
  model: {
    description: 'Primary model for everyday use',
    ctxWeight: 1.0,
    tagKeywords: ['agentic', 'tool', 'reasoning', 'general', 'current default'],
  },
  build: {
    description: 'Coding-focused tasks',
    ctxWeight: 0.6,
    tagKeywords: ['coding', 'code', 'refactor', 'agentic', 'tool'],
  },
  general: {
    description: 'Balanced general purpose',
    ctxWeight: 0.8,
    tagKeywords: ['general', 'multimodal', 'agentic', 'reasoning'],
  },
  small_model: {
    description: 'Lightweight, fast responses — prefer smaller context',
    ctxWeight: -0.5,
    tagKeywords: ['lightweight', 'ultra-lightweight', 'fast', 'quick', 'small'],
  },
  explore: {
    description: 'Interesting models to try — diverse, experimental',
    ctxWeight: 0.3,
    tagKeywords: ['thinking', 'reasoning', 'multimodal', 'new'],
  },
  stable: {
    description: 'Proven reliable over time (manually curated)',
    ctxWeight: 0,
    tagKeywords: [],
    manual: true,
  },
}

// ── Score & rank ──
const newRankings = {}

for (const [role, cfg] of Object.entries(ROLES)) {
  if (cfg.manual) { newRankings[role] = []; continue }

  const scored = eligible.map(m => {
    const ctx = ctxScore(m)
    const tags = tagBonus(m, cfg.tagKeywords)
    const score = ctx * cfg.ctxWeight + tags
    return { id: m.id, score, ctx: m.context_length || 0 }
  })

  // Sort: score desc, then context desc as tiebreaker
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.ctx - a.ctx
  })

  newRankings[role] = scored.map(s => s.id)

  // Print top 5 for visibility
  console.log(`\n${role} — top 5:`)
  for (let i = 0; i < Math.min(5, scored.length); i++) {
    const m = scored[i]
    const model = eligible.find(x => x.id === m.id)
    const ctx = model.context_length
      ? (model.context_length >= CTX_NORM ? (model.context_length / CTX_NORM).toFixed(1) + 'M' : Math.round(model.context_length / 1000) + 'K')
      : '?'
    console.log(`  #${i + 1} [${ctx}] score=${m.score.toFixed(2)} ${m.id}`)
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

// ── Apply ──
if (process.argv.includes('--apply')) {
  for (const role of Object.keys(ROLES)) {
    data._role_rankings[role] = newRankings[role]
  }
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
  console.log('\n✅ Rankings updated in available-models.json')
} else {
  console.log('\nReport mode. Use --apply to write changes.')
}

console.log(`\nDone. ${eligible.length} eligible models ranked across ${Object.keys(ROLES).length} roles.`)
