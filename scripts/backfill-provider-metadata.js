#!/usr/bin/env node
/**
 * backfill-provider-metadata.js
 * Reads provider-descriptions.json and populates datapoint_providers.description.
 * Run after migration 043 adds the description column.
 *
 * Usage: node scripts/backfill-provider-metadata.js [--apply]
 */

require('dotenv').config();
const pool = require('../server/db');
const descriptions = require('../data/provider-descriptions.json');

const APPLY = process.argv.includes('--apply');

(async () => {
  const client = await pool.connect();
  try {
    let updated = 0;
    let skipped = 0;

    for (const [slug, desc] of Object.entries(descriptions)) {
      if (!desc || !slug) continue;
      if (APPLY) {
        const { rowCount } = await client.query(
          'UPDATE datapoint_providers SET description = $1 WHERE slug = $2',
          [desc, slug],
        );
        updated += rowCount;
        if (rowCount === 0) skipped++;
      } else {
        const { rows } = await client.query(
          'SELECT name, description FROM datapoint_providers WHERE slug = $1',
          [slug],
        );
        if (rows.length > 0) {
          console.log(`  ${slug}: "${rows[0].name}" → "${desc.slice(0, 80)}..."`);
          updated++;
        } else {
          console.log(`  ${slug}: NOT FOUND in DB (skipped)`);
          skipped++;
        }
      }
    }

    console.log(`\n${APPLY ? 'Applied:' : 'Dry-run:'} ${updated} updated, ${skipped} not found`);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
