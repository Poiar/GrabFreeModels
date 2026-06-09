#!/usr/bin/env node
/**
 * backfill-quantization.js
 *
 * Parses quantization info from HuggingFace Hub tags and model names,
 * backfills datapoint_models.quantization.
 *
 * Sources:
 *   - HF tags: gguf, gptq, awq, bnb, quantized
 *   - Model name patterns: fp8, fp4, fp16, bf16, int8, int4
 *
 * Idempotent — safe to re-run.
 * Only updates rows where quantization IS NULL (won't overwrite manual fixes).
 *
 * Usage: node scripts/backfill-quantization.js [--apply]
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

let connectionString = process.env.DATABASE_URL;
if (connectionString && connectionString.includes('sslmode=require') && !connectionString.includes('uselibpqcompat')) {
  connectionString = connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
}
const pool = new Pool({
  connectionString,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

// HF tags that indicate quantization
const QUANT_TAGS = {
  gguf: 'gguf',
  gptq: 'gptq',
  awq: 'awq',
  bnb: 'bnb',
  quantized: 'quantized',
};

// Name suffixes/patterns that indicate quantization
const NAME_PATTERNS = [
  { regex: /[-_]fp8$/i, value: 'fp8' },
  { regex: /[-_]fp4$/i, value: 'fp4' },
  { regex: /[-_]fp16$/i, value: 'fp16' },
  { regex: /[-_]bf16$/i, value: 'bf16' },
  { regex: /[-_]int8$/i, value: 'int8' },
  { regex: /[-_]int4$/i, value: 'int4' },
  { regex: /[-_]nvfp4$/i, value: 'fp4' },
  { regex: /[-_]gguf$/i, value: 'gguf' },
];

function parseQuantFromTags(tags) {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    const key = tag.toLowerCase().replace(/[_-]/g, '_');
    if (QUANT_TAGS[key]) return QUANT_TAGS[key];
  }
  return null;
}

function parseQuantFromName(name) {
  if (!name) return null;
  for (const pat of NAME_PATTERNS) {
    if (pat.regex.test(name)) return pat.value;
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  const dryRun = !process.argv.includes('--apply');

  try {
    // Get the huggingface-hub source ID
    const { rows: srcRows } = await client.query(
      `SELECT id FROM sources WHERE slug = 'huggingface-hub'`
    );
    const hfSourceId = srcRows.length > 0 ? srcRows[0].id : null;

    // 3. Parse quantization from HF Hub tags → map to datapoint_models
    const hfQuantMap = new Map(); // HF model_name → quantization
    if (hfSourceId) {
      const { rows: hfModels } = await client.query(`
        SELECT esm.model_name, esm.model_limits
        FROM external_source_models esm
        WHERE esm.source_id = $1
      `, [hfSourceId]);

      for (const row of hfModels) {
        let limits;
        try { limits = JSON.parse(row.model_limits); } catch { continue; }
        const tags = limits.tags || [];
        const quant = parseQuantFromTags(tags);
        if (quant) {
          hfQuantMap.set(row.model_name, quant);
        }
      }
      console.log(`Parsed ${hfQuantMap.size} quantization entries from HF Hub tags.`);
    }

    // 4. Build updates list: for each datapoint_model, check HF tags + name patterns
    const updates = []; // { full_id, quantization, source }
    const { rows: dmRows } = await client.query(`
      SELECT dm.id, dm.full_id, dm.model_instance_key, dm.super_model_id,
             sm.name AS super_name
      FROM datapoint_models dm
      JOIN super_models sm ON sm.id = dm.super_model_id
      WHERE NOT dm.is_removed AND dm.quantization IS NULL
    `);

    for (const row of dmRows) {
      // First check: HF Hub tag match (only for huggingface provider models)
      let quant = hfQuantMap.get(row.model_instance_key);

      // Second check: name pattern
      if (!quant) {
        quant = parseQuantFromName(row.model_instance_key) || parseQuantFromName(row.super_name);
      }

      if (quant) {
        updates.push({
          full_id: row.full_id,
          quantization: quant,
          source: hfQuantMap.has(row.model_instance_key) ? 'HF tag' : 'name pattern',
        });
      }
    }

    // 5. Display results
    console.log(`\nFound ${updates.length} datapoint_models with quantization info.`);

    const byQuant = {};
    for (const u of updates) {
      byQuant[u.quantization] = (byQuant[u.quantization] || 0) + 1;
    }
    console.log('\nBy quantization:');
    for (const [q, count] of Object.entries(byQuant).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${q}: ${count}`);
    }

    console.log('\nExample assignments:');
    for (const u of updates.slice(0, 20)) {
      console.log(`  ${u.full_id} → ${u.quantization}  (${u.source})`);
    }

    if (dryRun) {
      console.log(`\nDry run — use --apply to update ${updates.length} datapoint_models.`);
      return;
    }

    // 6. Apply updates
    await client.query('BEGIN');
    let updated = 0;
    for (const u of updates) {
      await client.query(
        `UPDATE datapoint_models SET quantization = $1 WHERE full_id = $2 AND quantization IS NULL`,
        [u.quantization, u.full_id]
      );
      updated++;
    }
    await client.query('COMMIT');
    console.log(`\nUpdated ${updated} datapoint_models with quantization.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
