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
const dbPool = require('../server/db');
const buildModelsData = require('./build-models-data');

const DATA_FILE = path.join(__dirname, '..', 'available-models.json');

async function exportData(passedPool) {
  const pool = passedPool || dbPool;
  const client = await pool.connect();
  try {
    const result = await buildModelsData(client, pool);
    fs.writeFileSync(DATA_FILE, JSON.stringify(result, null, 2) + '\n');
    console.log(
      `Exported ${result.creators.reduce((sum, c) => sum + c.model_count, 0)} models to ${DATA_FILE}`,
    );
  } catch (err) {
    console.error('Export failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    if (!passedPool) await dbPool.end();
  }
}

if (require.main === module) {
  exportData().catch(() => process.exit(1));
}

module.exports = exportData;
