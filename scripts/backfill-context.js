#!/usr/bin/env node
/**
 * backfill-context.js
 *
 * Fetches context_length for models where it's null, using the OpenRouter model catalog
 * (which includes full metadata for NVIDIA/other models routed through OpenRouter).
 *
 * Usage:
 *   node scripts/backfill-context.js          # dry-run
 *   node scripts/backfill-context.js --apply  # write changes
 */

const https = require('https')
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

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

async function getOpenRouterContext(modelId) {
  try {
    const r = await httpsGet(`https://openrouter.ai/api/v1/models`)
    const found = r.data?.find(m => m.id === modelId)
    return found?.context_length ?? null
  } catch { return null }
}

const KNOWN_CONTEXT = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'known-context.json'), 'utf8')
)

;(async () => {
  const client = await pool.connect()
  try {
    const { rows: targets } = await client.query(`
      SELECT m.id, m.name
      FROM models m
      JOIN provider_models pm ON pm.model_id = m.id
      WHERE m.context_length IS NULL
        AND m.is_free = true
        AND pm.status_result = 'working'
        AND pm.removed = false
      ORDER BY m.id
    `)

    console.log(`Models with null context_length: ${targets.length}\n`)

    const auth = JSON.parse(
      fs.readFileSync(
        process.env.GFM_AUTH_FILE ||
          path.join(process.env.XDG_DATA_HOME || path.join(process.env.HOME || process.env.USERPROFILE, '.local', 'share'), 'opencode', 'auth.json'),
        'utf8'
      )
    )

    let updated = 0
    for (const m of targets) {
      let ctx = null

      const orId = m.id.startsWith('nvidia/') ? m.id.replace('nvidia/', '') : m.id
      ctx = await getOpenRouterContext(orId)
      if (ctx) { console.log(`  ${m.id}: ${ctx} (from OpenRouter)`) }

      if (!ctx && KNOWN_CONTEXT[m.id]) {
        ctx = KNOWN_CONTEXT[m.id]
        console.log(`  ${m.id}: ${ctx} (from known catalog)`)
      }

      if (ctx) {
        if (APPLY) {
          await client.query('UPDATE models SET context_length = $1 WHERE id = $2', [ctx, m.id])
        }
        updated++
      } else {
        console.log(`  ${m.id}: still null (no source)`)
      }
    }

    console.log(`\n${updated}/${targets.length} models ${APPLY ? 'updated' : 'would be updated'}`)
    if (APPLY && updated > 0) {
      const exportData = require('./export-from-pg')
      await exportData(pool)
      console.log('Exported to available-models.json')
    } else if (!APPLY) {
      console.log('Dry-run. Use --apply to write.')
    }
  } catch (err) {
    console.error('Backfill failed:', err.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
})()
