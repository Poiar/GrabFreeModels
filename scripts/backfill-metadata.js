#!/usr/bin/env node
/**
 * backfill-metadata.js
 *
 * Backfills `supports_tools` on free models and populates the `stable` role ranking.
 *
 * 1. supports_tools:
 *    - true  — model supports OpenAI-style tool calling (default for modern models)
 *    - false — model is verified to NOT support tool calling
 *    Known-false: qwen3 base (not coder), llama3.*, codellama, deepseek-coder (old), mistral-7b, phi-4
 *
 * 2. stable ranking:
 *    Models that are free, working, have supports_tools=true, and status.tested >= 30 days ago.
 *    Sorted by context_length descending (best first).
 *
 * Usage:
 *   node scripts/backfill-metadata.js          # dry-run
 *   node scripts/backfill-metadata.js --apply  # write changes
 */

const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, '..', 'available-models.json')
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const APPLY = process.argv.includes('--apply')

// ── Known supports_tools=false patterns ──
const TOOLS_FALSE_PATTERNS = [
  /^qwen3:(?!.*coder)/i,          // qwen3 base/chat — NOT coder variants
  /^llama3\./i,                    // llama2/3.x — no native tool calling
  /^codellama/i,                   // Code Llama — no tools
  /^deepseek-coder/i,              // old deepseek-coder — no tools
  /^mistral.*7b/i,                 // Mistral 7B — no native tools
  /^phi-4$/i,                      // phi-4 base — echoes tools as text
]

function isToolsFalse(id) {
  return TOOLS_FALSE_PATTERNS.some(re => re.test(id))
}

// ── Pass 1: backfill supports_tools ──
let toolsUpdates = 0
for (const m of data.models) {
  if (m.supports_tools !== undefined) continue
  if (!m.is_free || m._removed) continue
  const id = m.id
  const val = !isToolsFalse(id)
  if (APPLY) m.supports_tools = val
  toolsUpdates++
  console.log(`  ${id}: supports_tools → ${val}`)
}
console.log(`\nsupports_tools: ${toolsUpdates} models ${APPLY ? 'updated' : 'would be updated'}`)

// ── Pass 2: populate stable ranking ──
const now = new Date()
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

const stableEligible = data.models.filter(m => {
  if (!m.is_free || m._removed || m.status.result !== 'working') return false
  if (m.supports_tools !== true) return false
  if (!m.status?.tested) return false
  const tested = new Date(m.status.tested)
  return (now - tested) >= THIRTY_DAYS
})

// Sort by context_length desc, then name
stableEligible.sort((a, b) => {
  const ca = a.context_length || 0
  const cb = b.context_length || 0
  if (cb !== ca) return cb - ca
  return a.name.localeCompare(b.name)
})

const newStable = stableEligible.map(m => m.id)
const oldStable = data._role_rankings.stable || []

console.log(`\nstable ranking: ${oldStable.length} → ${newStable.length} models`)
if (JSON.stringify(oldStable) !== JSON.stringify(newStable)) {
  const added = newStable.filter(id => !oldStable.includes(id))
  const removed = oldStable.filter(id => !newStable.includes(id))
  for (const id of added) console.log(`  + ${id}`)
  for (const id of removed) console.log(`  − ${id}`)
}

if (APPLY) {
  data._role_rankings.stable = newStable
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
  console.log('\n✅ Changes written to available-models.json')
} else {
  console.log('\nDry-run. Use --apply to write changes.')
}
