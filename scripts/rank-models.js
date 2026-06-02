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

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const APPLY = process.argv.includes('--apply')

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'gfm',
  password: process.env.PGPASSWORD || 'gfm',
  database: process.env.PGDATABASE || 'grabfreemodels',
})

async function rankModels() {
  const client = await pool.connect()
  try {
    // Load eligible models: free + working + tools + not removed
    const { rows: eligibleRows } = await client.query(`
      SELECT dm.full_id AS id, mm.name, dm.context_length, dm.is_free, dm.supports_tools,
             dp.name AS provider
      FROM datapoint_models dm
      JOIN master_models mm ON mm.id = dm.master_model_id
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE dm.is_free = true
        AND dm.supports_tools = true
        AND dm.status_result = 'working'
        AND dm.is_removed = false
      ORDER BY dm.full_id
    `)

    // Load ineligible (working + free but no tools) for reporting
    const { rows: ineligibleRows } = await client.query(`
      SELECT dm.full_id AS id
      FROM datapoint_models dm
      WHERE dm.is_free = true
        AND dm.supports_tools IS NOT TRUE
        AND dm.status_result = 'working'
        AND dm.is_removed = false
    `)

    // Load best_for tags for eligible datapoint models
    const eligibleFullIds = new Set(eligibleRows.map(m => m.id));
    const { rows: featureRows } = await client.query(`
      SELECT dm.full_id, dmf.value
      FROM datapoint_model_features dmf
      JOIN datapoint_models dm ON dm.id = dmf.datapoint_model_id
      WHERE dmf.feature_type = 'best_for'
        AND dm.status_result = 'working'
    `)
    const bestForMap = new Map()
    for (const r of featureRows) {
      if (!eligibleFullIds.has(r.full_id)) continue
      if (!bestForMap.has(r.full_id)) bestForMap.set(r.full_id, [])
      bestForMap.get(r.full_id).push(r.value)
    }

    // Attach best_for to models
    const eligible = eligibleRows.map(m => ({
      ...m,
      best_for: bestForMap.get(m.id) || [],
    }))

    if (ineligibleRows.length > 0) {
      console.log('Ineligible (supports_tools!=true, excluded from rankings):')
      for (const m of ineligibleRows) console.log('  ' + m.id)
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
        console.log(`  #${i + 1} [${ctx}] score=${m.score.toFixed(2)} ${m.id}`)
      }
    }

    // ── Diff against current rankings in DB ──
    const { rows: metaRows } = await client.query(
      "SELECT value::text FROM metadata WHERE key = '_role_rankings'"
    )
    const oldRankings = metaRows.length > 0 ? JSON.parse(metaRows[0].value) : {}

    console.log('\n-- Diff --')
    for (const role of Object.keys(ROLES)) {
      const oldList = oldRankings[role] || []
      const newList = newRankings[role]
      if (JSON.stringify(oldList) === JSON.stringify(newList)) {
        console.log(`  ${role}: unchanged (${newList.length} models)`)
      } else {
        const added = newList.filter(id => !oldList.includes(id))
        const removed = oldList.filter(id => !newList.includes(id))
        console.log(`  ${role}: ${oldList.length} → ${newList.length} models`)
        for (const id of added) console.log(`    + ${id}`)
        for (const id of removed) console.log(`    - ${id}`)
      }
    }

    // ── Apply ──
    if (APPLY) {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO metadata (key, value) VALUES ('_role_rankings', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(newRankings)]
      )
      await client.query('COMMIT')
      console.log('\nRankings updated in PostgreSQL metadata')

      // Export to JSON
      const exportData = require('./export-from-pg')
      await exportData(pool)
      console.log('JSON exported')
    } else {
      console.log('\nReport mode. Use --apply to write changes.')
    }

    console.log(`\nDone. ${eligible.length} eligible models ranked across ${Object.keys(ROLES).length} roles.`)
  } catch (err) {
    console.error('Rank failed:', err.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

rankModels()
