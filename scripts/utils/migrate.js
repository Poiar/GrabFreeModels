#!/usr/bin/env node
/**
 * migrate.js — Database migration runner
 *
 * Reads .sql files from db/migrations/, applies pending ones in order,
 * records them in the _migrations tracking table.
 *
 * Usage:
 *   node scripts/utils/migrate.js              # apply all pending
 *   node scripts/utils/migrate.js --dry-run    # show what would run, don't apply
 *   node scripts/utils/migrate.js --status     # list applied + pending migrations
 *   node scripts/utils/migrate.js --redo 030   # re-apply a specific migration
 *   node scripts/utils/migrate.js --strict     # halt on checksum mismatch
 *
 * The runner loads the pool from server/db.js and runs each migration inside
 * a transaction.  Checksums are SHA-256 of the file body (comments stripped
 * for idempotent comparison).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(ROOT, 'db', 'migrations');

// ── CLI flags ──
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATUS = args.includes('--status');
const STRICT = args.includes('--strict');
const REDO = (() => {
  const idx = args.indexOf('--redo');
  return idx !== -1 ? args[idx + 1] : null;
})();

// ── Helpers ──
function checksum(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Strip SQL comments so checksums are stable across formatting-only changes */
function stripComments(sql) {
  return sql
    .replace(/--.*$/gm, '') // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^\s*\n/gm, ''); // blank lines
}

/** List migration files in natural sort order */
function listMigrationFiles() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return files;
}

// ── Main ──
async function main() {
  // Lazy-require pool so --help / --status don't need DB
  const pool = require(path.join(ROOT, 'server', 'db'));

  const files = listMigrationFiles();
  if (files.length === 0) {
    console.log('No migration files found.');
    await pool.end();
    return;
  }

  // Ensure tracking table exists (can't be inside a tx or part of the migration sequence)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(256) NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      checksum    VARCHAR(64),
      duration_ms INTEGER
    )
  `);

  // Get already-applied migrations
  const { rows: appliedRows } = await pool.query(
    'SELECT filename, checksum FROM _migrations ORDER BY filename',
  );
  const applied = new Map(appliedRows.map((r) => [r.filename, r.checksum]));

  // Determine which files to apply
  let toApply;
  if (REDO) {
    // Find the file matching the redo prefix
    const match = files.filter((f) => f.startsWith(REDO));
    if (match.length === 0) {
      console.error(`No migration file found matching "${REDO}"`);
      await pool.end();
      process.exit(1);
    }
    toApply = match;
    console.log(`Re-applying: ${match.join(', ')}`);
  } else {
    toApply = files.filter((f) => !applied.has(f));
  }

  if (STATUS) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log('Migration Status');
    console.log(`${'─'.repeat(70)}`);
    let appliedCount = 0,
      pendingCount = 0;
    for (const f of files) {
      const isApplied = applied.has(f);
      const chk = applied.get(f) || '';
      const shortChk = chk ? chk.slice(0, 8) : '';
      console.log(`  ${isApplied ? '✓' : '○'}  ${f}  ${shortChk}`);
      if (isApplied) appliedCount++;
      else pendingCount++;
    }
    console.log(`${'─'.repeat(70)}`);
    console.log(`Applied: ${appliedCount}  Pending: ${pendingCount}`);
    console.log(`${'─'.repeat(70)}\n`);
    await pool.end();
    return;
  }

  if (toApply.length === 0) {
    console.log('All migrations already applied.');
    await pool.end();
    return;
  }

  console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Applying ${toApply.length} migration(s):`);
  for (const f of toApply) console.log(`  → ${f}`);
  console.log();

  let appliedCount = 0;
  let skippedCount = 0;

  for (const f of toApply) {
    const filePath = path.join(MIGRATIONS_DIR, f);
    const sql = fs.readFileSync(filePath, 'utf8');
    const stripped = stripComments(sql);
    const chk = checksum(stripped);
    const prevChk = applied.get(f);

    // If re-applying, skip checksum check
    if (!REDO && prevChk && prevChk !== chk) {
      const msg = `Checksum mismatch for ${f}: stored=${prevChk.slice(0, 8)} current=${chk.slice(0, 8)}`;
      if (STRICT) {
        throw new Error(`${msg}. Use --redo ${f.slice(0, 3)} to re-apply, or --strict to halt.`);
      }
      console.warn(`  ⚠ ${msg} (skipping)`);
      skippedCount++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would apply: ${f} (${(sql.length / 1024).toFixed(1)} KB)`);
      continue;
    }

    const start = Date.now();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      // Upsert tracking row
      await client.query(
        `INSERT INTO _migrations (filename, checksum, duration_ms)
         VALUES ($1, $2, $3)
         ON CONFLICT (filename) DO UPDATE
           SET checksum = $2, applied_at = now(), duration_ms = $3`,
        [f, chk, Date.now() - start],
      );
      await client.query('COMMIT');
      console.log(`  ✓ ${f}  (${Date.now() - start}ms)`);
      appliedCount++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ ${f} FAILED: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`\n${appliedCount} applied, ${skippedCount} skipped, 0 failed`);
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
