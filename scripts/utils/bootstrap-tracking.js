#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // Create tracking table
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(256) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum VARCHAR(64),
    duration_ms INTEGER
  )`);
  console.log('Tracking table ready');

  // Mark pre-existing migrations (001-027) as applied
  const files = fs.readdirSync(path.join(ROOT, 'db', 'migrations'))
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const f of files) {
    const num = parseInt(f);
    if (num <= 27) {
      await pool.query(
        'INSERT INTO _migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING',
        [f, 'pre-existing']
      );
      console.log('  marked: ' + f);
    }
  }

  const r = await pool.query('SELECT count(*) FROM _migrations');
  console.log('Done — ' + r.rows[0].count + ' migrations tracked');
  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
