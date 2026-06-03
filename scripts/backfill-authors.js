#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

const SKIP_PREFIXES = ['modelsdev', 'openrouter', 'github-models', 'inference-net'];

function deriveAuthor(fullId, providerName) {
  const parts = fullId.split('/').filter(Boolean);
  if (parts.length < 2) return providerName;
  let author = parts[0];
  if (SKIP_PREFIXES.includes(author)) {
    if (parts.length >= 3) author = parts[1];
    else return providerName;
  }
  return author
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

async function backfill() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const { rows } = await pool.query(`
      SELECT sm.id, sm.name, dm.full_id, dp.name AS provider_name
      FROM super_models sm
      JOIN datapoint_models dm ON dm.super_model_id = sm.id
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE sm.author IS NULL
    `);

    const bySuper = new Map();
    for (const r of rows) {
      if (!bySuper.has(r.id)) bySuper.set(r.id, { name: r.name, entries: [] });
      bySuper.get(r.id).entries.push({ full_id: r.full_id, provider: r.provider_name });
    }

    const updates = [];
    for (const [id, sup] of bySuper) {
      const entry = sup.entries.find(e => !SKIP_PREFIXES.includes(e.full_id.split('/')[0]))
        || sup.entries[0];
      const author = deriveAuthor(entry.full_id, entry.provider);
      updates.push({ id, author, name: sup.name });
    }

    console.log(`Found ${updates.length} super models with null author`);
    for (const u of updates.slice(0, 20)) {
      console.log(`  ${u.id}: ${u.name} → ${u.author}`);
    }
    if (updates.length > 20) console.log(`  ... and ${updates.length - 20} more`);

    if (APPLY) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const u of updates) {
          await client.query('UPDATE super_models SET author = $1 WHERE id = $2', [u.author, u.id]);
        }
        await client.query('COMMIT');
        console.log(`\nBackfilled ${updates.length} authors`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else {
      console.log('\nDry-run. Use --apply to write.');
    }
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

backfill();
