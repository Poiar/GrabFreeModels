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

const APPLY = process.argv.includes('--apply')
const FILE = path.join(__dirname, '..', 'available-models.json')
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))

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

// Load known context values from shared catalog (add new entries here as they're discovered)
const KNOWN_CONTEXT = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'known-context.json'), 'utf8')
)

;(async () => {
  const targets = data.models.filter(
    m => m.is_free && !m._removed && m.status.result === 'working' && !m.context_length
  )
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

    // Try OpenRouter API first (many NVIDIA models are routed through it)
    const orId = m.id.startsWith('nvidia/') ? m.id.replace('nvidia/', '') : m.id
    ctx = await getOpenRouterContext(orId)
    if (ctx) { console.log(`  ${m.id}: ${ctx} (from OpenRouter)`) }

    // Fallback to known values
    if (!ctx && KNOWN_CONTEXT[m.id]) {
      ctx = KNOWN_CONTEXT[m.id]
      console.log(`  ${m.id}: ${ctx} (from known catalog)`)
    }

    if (ctx) {
      if (APPLY) m.context_length = ctx
      updated++
    } else {
      console.log(`  ${m.id}: still null (no source)`)
    }
  }

  console.log(`\n${updated}/${targets.length} models ${APPLY ? 'updated' : 'would be updated'}`)
  if (APPLY && updated > 0) {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
    console.log('✅ Written to available-models.json')
  } else if (!APPLY) {
    console.log('Dry-run. Use --apply to write.')
  }
})()
