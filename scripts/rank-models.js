#!/usr/bin/env node
/**
 * rank-models.js
 * Auto-ranks free working models into role-specific scoring lists.
 *
 * See skills/rank-models/SKILL.md for the full algorithm spec, eligibility criteria, and role definitions.
 * This script is the implementation; the skill is the source of truth for weights and keywords.
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
