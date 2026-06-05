#!/usr/bin/env node
/**
 * backfill-metadata.js
 *
 * Backfills `supports_tools` on free models based on known patterns.
 *
 * Usage:
 *   node scripts/backfill-metadata.js          # dry-run
 *   node scripts/backfill-metadata.js --apply  # write changes
 */

require('dotenv').config();
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

// ── Known supports_tools=false patterns ──
const TOOLS_FALSE_PATTERNS = [
  /^qwen3:(?!.*coder)/i,
  /^llama3\./i,
  /^codellama/i,
  /^deepseek-coder/i,
  /^mistral.*7b/i,
  /^phi-4$/i,
];

function isToolsFalse(id) {
  return TOOLS_FALSE_PATTERNS.some((re) => re.test(id));
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
    });

async function backfillMetadata() {
  const client = await pool.connect();
  try {
    const { rows: toolsNullRows } = await client.query(`
      SELECT dm.id, dm.full_id
      FROM datapoint_models dm
      WHERE dm.supports_tools IS NULL
        AND dm.is_free = true
      ORDER BY dm.full_id
    `);

    let toolsUpdates = 0;
    for (const row of toolsNullRows) {
      const val = !isToolsFalse(row.full_id);
      toolsUpdates++;
      console.log(`  ${row.full_id}: supports_tools → ${val}`);

      if (APPLY) {
        await client.query('UPDATE datapoint_models SET supports_tools = $1 WHERE id = $2', [
          val,
          row.id,
        ]);
      }
    }
    console.log(
      `\nsupports_tools: ${toolsUpdates} models ${APPLY ? 'updated' : 'would be updated'}`,
    );

    if (APPLY) {
      const exportData = require('./export-from-pg');
      await exportData(pool);
      console.log('JSON exported');
    } else {
      console.log('\nDry-run. Use --apply to write changes.');
    }

    console.log(`\nDone. ${toolsUpdates} supports_tools updates.`);
  } catch (err) {
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

backfillMetadata().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
