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

const path = require('path');
require('dotenv').config();
const buildModelsData = require('./build-models-data');

async function loadModels(existingPool) {
  let pool = existingPool;
  let ownPool = false;

  if (!pool) {
    const rawConnectionString = process.env.DATABASE_URL;
    let connectionString = rawConnectionString;
    if (connectionString && connectionString.includes('sslmode=require') && !connectionString.includes('uselibpqcompat')) {
      connectionString = connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
    }
    const { Pool } = require('pg');
    if (connectionString) {
      const isNeon = (rawConnectionString || '').includes('neon.tech');
      pool = new Pool({
        connectionString,
        max: isNeon ? 3 : 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ...(isNeon ? { ssl: { rejectUnauthorized: false } } : {}),
      });
    } else {
      pool = new Pool({
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      });
    }
    ownPool = true;
  }

  const client = await pool.connect();
  try {
    return await buildModelsData(client, pool);
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

module.exports = loadModels;

if (require.main === module) {
  loadModels()
    .then(data => { process.stdout.write(JSON.stringify(data, null, 2) + '\n'); })
    .catch(err => { console.error(err.message); process.exit(1); });
}
