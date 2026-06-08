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

const DATA_FILE_FREE = path.join(__dirname, '..', 'available-models.json');
const DATA_FILE_PAID = path.join(__dirname, '..', 'available-models-paid.json');

async function exportData(passedPool, options = {}) {
  const { isFree = true } = options;
  const dataFile = isFree ? DATA_FILE_FREE : DATA_FILE_PAID;
  const pool = passedPool || dbPool;
  const client = await pool.connect();
  try {
    const result = await buildModelsData(client, pool, { isFree });
    fs.writeFileSync(dataFile, JSON.stringify(result, null, 2) + '\n');
    console.log(
      `Exported ${result.creators.reduce((sum, c) => sum + c.model_count, 0)} models to ${dataFile}`,
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
  const isFree = !process.argv.includes('--paid');
  exportData(null, { isFree }).catch(() => process.exit(1));
}

module.exports = exportData;
