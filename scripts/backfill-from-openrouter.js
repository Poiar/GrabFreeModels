#!/usr/bin/env node
/**
 * backfill-from-openrouter.js
 *
 * Fetches model metadata from OpenRouter API and backfills supports_tools,
 * descriptions, and modality info for matching datapoint_models.
 *
 * OpenRouter's API returns supported_parameters (including "tools"), descriptions,
 * and architecture/modality data for every model they route — including models
 * from external providers like NVIDIA, Google, Meta, etc.
 *
 * Usage:
 *   node scripts/backfill-from-openrouter.js          # dry-run
 *   node scripts/backfill-from-openrouter.js --apply  # write changes
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

const authPath = process.env.OPENCODE_AUTH_PATH || require('os').homedir() + '/.local/share/opencode/auth.json';

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : require('http');
    mod.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Invalid JSON from ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const auth = require(authPath);
  const key = auth.openrouter?.key;
  if (!key) {
    console.error('No OpenRouter API key found in auth.json');
    process.exit(1);
  }

  console.log('=== Backfilling metadata from OpenRouter catalog ===\n');

  // Fetch all models from OpenRouter
  console.log('Fetching OpenRouter model catalog...');
  const catalog = await httpGet('https://openrouter.ai/api/v1/models', {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  });

  const allModels = catalog.data || [];
  console.log(`  ${allModels.length} total models in OpenRouter catalog\n`);

  const client = await pool.connect();
  try {
    // Get all existing datapoint_models with their full_ids
    const { rows: existingDps } = await client.query(`
      SELECT dm.id, dm.full_id, dm.supports_tools, dm.datapoint_provider_id, dp.slug as provider_slug
      FROM datapoint_models dm
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE dm.is_removed = false
    `);

    const dpByFullId = {};
    for (const dp of existingDps) {
      dpByFullId[dp.full_id] = dp;
    }

    console.log(`  ${existingDps.length} active datapoints in DB\n`);

    let toolsUpdates = 0;
    let newModalities = 0;
    let matched = 0;
    let skippedSame = 0;

    for (const orm of allModels) {
      const fullId = orm.id;  // e.g., "nvidia/nemotron-3-nano-omni:free"
      const dp = dpByFullId[fullId];
      if (!dp) continue;

      matched++;

      const supportsTools = (orm.supported_parameters || []).includes('tools');
      const currentTools = dp.supports_tools;

      if (currentTools === null || currentTools !== supportsTools) {
        toolsUpdates++;
        if (APPLY) {
          await client.query(
            'UPDATE datapoint_models SET supports_tools = $1 WHERE id = $2',
            [supportsTools, dp.id]
          );
        }
        console.log(`  ${fullId}: tools ${currentTools} → ${supportsTools}`);
      } else {
        skippedSame++;
      }
    }

    console.log(`\nMatched ${matched} models against OpenRouter catalog`);
    console.log(`Tools updates:     ${toolsUpdates} models ${APPLY ? 'written' : 'would be written'}`);
    console.log(`Already correct:   ${skippedSame} models`);
    console.log(`New modality info: ${newModalities} models`);

    if (!APPLY) {
      console.log('\nDry-run mode. Use --apply to write changes.');
    } else {
      // Export updated data
      const exportData = require('./export-from-pg');
      await exportData(pool);
      console.log('JSON exported');
    }

    console.log('\nDone.');
  } catch (err) {
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
