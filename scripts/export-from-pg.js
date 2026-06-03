#!/usr/bin/env node
/**
 * export-from-pg.js — Export PostgreSQL data to available-models.json
 *
 * Usage:
 *   node scripts/export-from-pg.js          # uses DATABASE_URL
 *   const exportData = require('./export-from-pg'); await exportData(pool);
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const buildModelsData = require('./build-models-data');

const DATA_FILE = path.join(__dirname, '..', 'available-models.json');

async function exportData(pool) {
  let ownPool = false;
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    pool = connectionString
      ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
      : new Pool({
          host: process.env.PGHOST || 'localhost',
          port: parseInt(process.env.PGPORT || '5432'),
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE,
        });
    ownPool = true;
  }

  const client = await pool.connect();
  try {
    const result = await buildModelsData(client);
    fs.writeFileSync(DATA_FILE, JSON.stringify(result, null, 2) + '\n');
    console.log(`Exported ${result.models.length} models to ${DATA_FILE}`);
  } catch (err) {
    console.error('Export failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

if (require.main === module) {
  exportData().catch(() => process.exit(1));
}

module.exports = exportData;
