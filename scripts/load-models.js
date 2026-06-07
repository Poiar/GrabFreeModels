#!/usr/bin/env node
/**
 * load-models.js
 * Shared module: builds the full models data object from PostgreSQL.
 * Returns the same shape as available-models.json / GET /api/data.
 *
 * Usage as module:
 *   const loadModels = require('./load-models');
 *   const data = await loadModels();          // from DATABASE_URL
 *   const data = await loadModels(pool);      // from existing pool
 *
 * Usage as CLI (exports to stdout):
 *   node scripts/load-models.js
 */

require('dotenv').config();
const buildModelsData = require('./build-models-data');
const dbPool = require('../server/db');

async function loadModels(existingPool, options = {}) {
  const pool = existingPool || dbPool;
  const ownPool = !existingPool;

  const client = await pool.connect();
  try {
    return await buildModelsData(client, pool, options);
  } finally {
    client.release();
    if (ownPool) await dbPool.end();
  }
}

module.exports = loadModels;

if (require.main === module) {
  loadModels()
    .then((data) => {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
