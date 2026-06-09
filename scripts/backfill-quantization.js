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
  '4-bit': 'int4',
  '8-bit': 'int8',
  '2-bit': 'int2',
  '3-bit': 'int3',
  int4: 'int4',
  int8: 'int8',
  int2: 'int2',
  int3: 'int3',
  fp8: 'fp8',
  fp4: 'fp4',
  fp16: 'fp16',
  bf16: 'bf16',
  nf4: 'nf4',
  nf4_4bit: 'nf4',
  nf4_8bit: 'nf4',
  exl2: 'exl2',
  hqq: 'hqq',
  bitsandbytes: 'bnb',
  'qlora-4bit': 'int4',
  'qlora-8bit': 'int8',
};

// Name suffixes/patterns that indicate quantization
const NAME_PATTERNS = [
  // Existing patterns (kept for backwards compat)
  { regex: /[-_]fp8$/i, value: 'fp8' },
  { regex: /[-_]fp4$/i, value: 'fp4' },
  { regex: /[-_]fp16$/i, value: 'fp16' },
  { regex: /[-_]bf16$/i, value: 'bf16' },
  { regex: /[-_]int8$/i, value: 'int8' },
  { regex: /[-_]int4$/i, value: 'int4' },
  { regex: /[-_]nvfp4$/i, value: 'fp4' },
  { regex: /[-_]gguf$/i, value: 'gguf' },

  // FP8 variants — not just suffix, also prefix, underscore
  { regex: /[-_]fp8[-_]/i, value: 'fp8' },
  { regex: /_fp8_/i, value: 'fp8' },
  { regex: /^fp8[-_]/i, value: 'fp8' },

  // INT2/INT3
  { regex: /[-_]int2$/i, value: 'int2' },
  { regex: /[-_]int3$/i, value: 'int3' },

  // GGUF Q-levels: Q2_K, Q3_K_S, Q4_K_M, Q5_K_M, Q6_K, Q8_0, etc.
  { regex: /[-_/]Q[2-8](?:_[A-Z0-9]+)?$/i, value: 'gguf' },
  { regex: /[-_/]Q[2-8]_[A-Z0-9]+(?:_[A-Z0-9]+)?$/i, value: 'gguf' },

  // IQ variants (GGUF importance-matrix quantized)
  { regex: /[-_/]IQ[0-9_A-Z]+$/i, value: 'gguf' },

  // Standalone AWQ / GPTQ as name components (for non-HF providers)
  { regex: /[-_/]awq$/i, value: 'awq' },
  { regex: /[-_/]gptq$/i, value: 'gptq' },

  // NF4
  { regex: /[-_]nf4$/i, value: 'nf4' },

  // EXL2 (ExLlamaV2)
  { regex: /[-_]exl2$/i, value: 'exl2' },
  { regex: /[-_]exllama/i, value: 'exl2' },

  // HQQ (Half-Quadratic Quantization)
  { regex: /[-_]hqq$/i, value: 'hqq' },

  // BitsAndBytes variants
  { regex: /bnb[-_]?4bit/i, value: 'bnb' },
  { regex: /bnb[-_]?8bit/i, value: 'bnb' },
  { regex: /bitsandbytes/i, value: 'bnb' },

  // SmoothQuant
  { regex: /smoothquant/i, value: 'smoothquant' },
  { regex: /[-_]sqft/i, value: 'sqft' },
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

// Keywords to scan in model card data (cardData / model_limits text fields)
const CARD_QUANT_KEYWORDS = [
  // Direct quantization claims
  { keyword: '"quantization":', value: null }, // special: extract value from JSON
  { keyword: '"quantized":', value: null },    // special: extract bool
  { keyword: '"fp8"', value: 'fp8' },
  { keyword: '"fp4"', value: 'fp4' },
  { keyword: '"int8"', value: 'int8' },
  { keyword: '"int4"', value: 'int4' },
  { keyword: '"int2"', value: 'int2' },
  { keyword: '"int3"', value: 'int3' },
  { keyword: '"nf4"', value: 'nf4' },
  { keyword: '"awq"', value: 'awq' },
  { keyword: '"gptq"', value: 'gptq' },
  { keyword: '"gguf"', value: 'gguf' },
  { keyword: '"exl2"', value: 'exl2' },
  { keyword: '"hqq"', value: 'hqq' },
  { keyword: '"bitsandbytes"', value: 'bnb' },
  { keyword: '"bnb"', value: 'bnb' },
  { keyword: '"smoothquant"', value: 'smoothquant' },
  // Model card text mentions (case-insensitive)
  { keyword: 'GGUF', value: 'gguf', caseSensitive: false },
  { keyword: 'GPTQ', value: 'gptq', caseSensitive: false },
  { keyword: 'AWQ', value: 'awq', caseSensitive: false },
  { keyword: 'FP8', value: 'fp8', caseSensitive: false },
  { keyword: 'FP4', value: 'fp4', caseSensitive: false },
  { keyword: 'INT8', value: 'int8', caseSensitive: false },
  { keyword: 'INT4', value: 'int4', caseSensitive: false },
  { keyword: 'NF4', value: 'nf4', caseSensitive: false },
  { keyword: 'EXL2', value: 'exl2', caseSensitive: false },
  { keyword: 'HQQ', value: 'hqq', caseSensitive: false },
  { keyword: 'Q4_K_M', value: 'gguf', caseSensitive: false },
  { keyword: 'Q8_0', value: 'gguf', caseSensitive: false },
  { keyword: 'Q2_K', value: 'gguf', caseSensitive: false },
  { keyword: 'Q5_K', value: 'gguf', caseSensitive: false },
  { keyword: 'Q6_K', value: 'gguf', caseSensitive: false },
  { keyword: 'BitsAndBytes', value: 'bnb', caseSensitive: false },
  { keyword: 'bitsandbytes', value: 'bnb', caseSensitive: false },
  { keyword: 'SmoothQuant', value: 'smoothquant', caseSensitive: false },
];

function parseQuantFromCardData(cardData) {
  if (!cardData) return null;
  const text = typeof cardData === 'string' ? cardData : JSON.stringify(cardData);
  for (const entry of CARD_QUANT_KEYWORDS) {
    if (!entry.caseSensitive) {
      if (text.toLowerCase().includes(entry.keyword.toLowerCase())) return entry.value;
    } else {
      if (text.includes(entry.keyword)) return entry.value;
    }
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
    const hfCardDataMap = new Map(); // HF model_name → cardData text (for card text parsing)
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
        // Collect cardData for card text parsing
        const cardData = limits.cardData || limits.card_data || null;
        if (cardData) {
          hfCardDataMap.set(row.model_name, cardData);
        }
      }
      console.log(`Parsed ${hfQuantMap.size} quantization entries from HF Hub tags.`);
      console.log(`Collected cardData for ${hfCardDataMap.size} HF models.`);
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
      let source;
      if (!quant) {
        quant = parseQuantFromName(row.model_instance_key) || parseQuantFromName(row.super_name);
        if (quant) source = 'name pattern';
      } else {
        source = 'HF tag';
      }

      // Third check: cardData text from HF model_limits
      if (!quant) {
        const cardData = hfCardDataMap.get(row.model_instance_key);
        if (cardData) {
          quant = parseQuantFromCardData(cardData);
          if (quant) source = 'cardData';
        }
      }

      if (quant) {
        updates.push({
          full_id: row.full_id,
          quantization: quant,
          source,
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
