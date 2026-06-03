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

require('dotenv').config();
const { Pool } = require('pg')

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

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    })

async function backfillMetadata() {
  const client = await pool.connect()
  try {
    // ── Pass 1: backfill supports_tools ──
    const { rows: toolsNullRows } = await client.query(`
      SELECT dm.id, dm.full_id
      FROM datapoint_models dm
      WHERE dm.supports_tools IS NULL
        AND dm.is_free = true
      ORDER BY dm.full_id
    `)

    let toolsUpdates = 0
    for (const row of toolsNullRows) {
      const val = !isToolsFalse(row.full_id)
      toolsUpdates++
      console.log(`  ${row.full_id}: supports_tools → ${val}`)

      if (APPLY) {
        await client.query(
          'UPDATE datapoint_models SET supports_tools = $1 WHERE id = $2',
          [val, row.id]
        )
      }
    }
    console.log(`\nsupports_tools: ${toolsUpdates} models ${APPLY ? 'updated' : 'would be updated'}`)

    // ── Pass 2: populate stable ranking ──
    const { rows: stableCandidates } = await client.query(`
      SELECT dm.full_id AS id, dm.context_length
      FROM datapoint_models dm
      WHERE dm.is_free = true
        AND dm.supports_tools = true
        AND dm.status_result = 'working'
        AND dm.is_removed = false
        AND dm.status_tested IS NOT NULL
      ORDER BY dm.context_length DESC, dm.full_id
    `)

    const newStable = stableCandidates.map(m => m.id)

    // Load current rankings
    const { rows: metaRows } = await client.query(
      "SELECT value::text FROM metadata WHERE key = '_role_rankings'"
    )
    const oldRankings = metaRows.length > 0 ? JSON.parse(metaRows[0].value) : {}
    const oldStable = oldRankings.stable || []

    console.log(`\nstable ranking: ${oldStable.length} → ${newStable.length} models`)
    if (JSON.stringify(oldStable) !== JSON.stringify(newStable)) {
      const added = newStable.filter(id => !oldStable.includes(id))
      const removed = oldStable.filter(id => !newStable.includes(id))
      for (const id of added) console.log(`  + ${id}`)
      for (const id of removed) console.log(`  − ${id}`)
    }

    // ── Apply ──
    if (APPLY) {
      await client.query('BEGIN')
      
      // Merge new stable ranking into existing rankings
      const updatedRankings = {
        ...oldRankings,
        stable: newStable
      }
      
      await client.query(
        `INSERT INTO metadata (key, value) VALUES ('_role_rankings', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(updatedRankings)]
      )
      
      await client.query('COMMIT')
      console.log('\n✅ Changes committed to PostgreSQL metadata')

      // Export to JSON
      const exportData = require('./export-from-pg')
      await exportData(pool)
      console.log('JSON exported')
    } else {
      console.log('\nDry-run. Use --apply to write changes.')
    }

    console.log(`\nDone. ${toolsUpdates} supports_tools updates, ${newStable.length} stable models identified.`)
  } catch (err) {
    console.error('Backfill failed:', err.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

backfillMetadata().catch(e => { console.error(e.message); process.exit(1); })