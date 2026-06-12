#!/usr/bin/env node
/**
 * fix-meta-creators.js
 * One-time fix for models incorrectly attributed to Meta.
 * Uses the org prefix from model_instance_key to determine the actual creator.
 *
 * Usage:
 *   node scripts/fix-meta-creators.js          # dry-run
 *   node scripts/fix-meta-creators.js --apply  # write to DB
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

let connectionString = process.env.DATABASE_URL;
if (
  connectionString &&
  connectionString.includes('sslmode=require') &&
  !connectionString.includes('uselibpqcompat')
) {
  connectionString = connectionString.replace(
    'sslmode=require',
    'uselibpqcompat=true&sslmode=require',
  );
}

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString, max: 1, ssl: { rejectUnauthorized: false } });

// Org prefix → correct creator name (must be in AUTHOR_OVERRIDES / CREATOR_WHITELIST)
const FIXES = {
  tiiuae: 'TII',
  nvidia: 'NVIDIA',
  allenai: 'AI2',
  abacusai: 'Abacus AI',
  salesforce: 'Salesforce',
  sao10k: 'Sao10K',
  teknium: 'Teknium',
  openbmb: 'OpenBMB',
};

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT DISTINCT ON (sm.slug) sm.id, sm.name, sm.slug, sm.creator,
        SPLIT_PART(dm.model_instance_key, '/', 1) AS org_prefix
      FROM super_models sm
      JOIN datapoint_models dm ON dm.super_model_id = sm.id
      WHERE sm.creator = 'Meta'
        AND dm.is_removed = false
        AND dm.model_instance_key LIKE '%/%'
    `);

    const updates = [];
    for (const row of rows) {
      const prefix = row.org_prefix.toLowerCase();
      if (FIXES[prefix] && FIXES[prefix] !== row.creator) {
        updates.push({ id: row.id, name: row.name, old: row.creator, new: FIXES[prefix], prefix });
      }
    }

    console.log('Models to fix from Meta → correct creator:');
    const byCreator = {};
    for (const u of updates) {
      byCreator[u.new] = (byCreator[u.new] || 0) + 1;
    }
    for (const [creator, count] of Object.entries(byCreator).sort((a, b) => b[1] - a[1])) {
      console.log(`  → ${creator}: ${count} models`);
    }

    if (updates.length === 0) {
      console.log('No fixes needed.');
      return;
    }

    if (!APPLY) {
      console.log(`\nDry run — use --apply to write ${updates.length} updates.`);
      console.log('\nAffected models:');
      for (const u of updates.slice(0, 20)) {
        console.log(`  ${u.name} (${u.prefix}) → ${u.new}`);
      }
      return;
    }

    for (const u of updates) {
      await client.query('UPDATE super_models SET creator = $1 WHERE id = $2', [u.new, u.id]);
    }
    console.log(`Applied ${updates.length} creator fixes.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
