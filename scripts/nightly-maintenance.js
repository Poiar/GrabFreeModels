#!/usr/bin/env node
/**
 * nightly-maintenance.js
 * Intended for scheduled execution (e.g., Windows Task Scheduler / cron).
 * Snapshots current state, validates free models, backfills context, re-ranks,
 * runs ranking sanity check, regenerates test summary, commits and pushes changes.
 * Auto-rolls back if working count drops or health falls below 70%.
 *
 * Source of truth: PostgreSQL. JSON snapshots are exported only for git history.
 *
 * Usage: node scripts/nightly-maintenance.js
 */

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(REPO_ROOT, 'snapshots');
const SUMMARY_LOG = path.join(REPO_ROOT, 'nightly-summary.log');
const EXPORT_SCRIPT = path.join(__dirname, 'export-from-pg.js');
const LOAD_SCRIPT = path.join(__dirname, 'load-models.js');

if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const PREV_COPY = path.join(SNAPSHOT_DIR, `available-models-${today}.json`);

// Change to repo directory
process.chdir(REPO_ROOT);

// Ensure git identity is set
try {
  execSync('git config user.email', { stdio: 'pipe' });
} catch {
  execSync('git config user.email "nightly@grabfreemodels"');
  execSync('git config user.name "Nightly Maintenance"');
}

// Obtain webhook URLs
let webhookUrl = null;
const alertEndpoints = [];
try {
  const envRaw = process.env.GRAB_FREE_MODELS_ALERTS;
  if (envRaw) {
    const secretJson = JSON.parse(envRaw);
    if (secretJson.webhook) webhookUrl = secretJson.webhook;
    if (secretJson.slack) alertEndpoints.push(secretJson.slack);
    if (secretJson.teams) alertEndpoints.push(secretJson.teams);
    if (secretJson.email) alertEndpoints.push(secretJson.email);
  }
} catch { /* ignore parse errors */ }
if (!webhookUrl) webhookUrl = process.env.WEBHOOK_URL;
if (webhookUrl) alertEndpoints.push(webhookUrl);

/** Export current DB state to JSON file (for git snapshot) */
function exportJson() {
  execSync(`node ${EXPORT_SCRIPT}`, { stdio: 'inherit' });
}

/** Load full models data from DB */
function loadFromDb() {
  // Use require to get fresh data each time (invalidate cache)
  delete require.cache[require.resolve(LOAD_SCRIPT)];
  const load = require(LOAD_SCRIPT);
  return load();
}

// 0. Save previous state for rollback and recovery detection
exportJson();
if (fs.existsSync('available-models.json')) {
  fs.copyFileSync('available-models.json', PREV_COPY);
}

// 1. Run validation (updates statuses in PG, exports JSON)
console.log('Running validation...');
execSync('node scripts/validate-free-models.js --apply', { stdio: 'inherit' });

// 2. Prune stale non-working models from rankings metadata (7-day burn-in)
console.log('Pruning stale non-working models from rankings (7-day burn-in)...');
const { Pool } = require('pg');
const BURN_IN_MS = 7 * 24 * 60 * 60 * 1000;
const nowMs = Date.now();

(async () => {
  const connectionString = process.env.DATABASE_URL;
  const pool = connectionString
    ? new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 2 })
    : new Pool({
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        max: 2,
      });

  try {
    // Load current rankings + model test dates from DB
    const { rows: metaRows } = await pool.query(
      "SELECT value::text FROM metadata WHERE key = '_role_rankings'"
    );
    if (metaRows.length === 0) {
      console.log('  No rankings found, skipping prune.');
    } else {
      const rankings = JSON.parse(metaRows[0].value);

      // Get test dates for non-working free models
      const { rows: modelRows } = await pool.query(`
        SELECT dm.full_id, dm.status_result, dm.status_tested
        FROM datapoint_models dm
        WHERE dm.is_free = true AND dm.status_result != 'working'
      `);

      const staleIds = new Set(
        modelRows.filter(m => {
          if (!m.status_tested) return false;
          return (nowMs - new Date(m.status_tested).getTime()) > BURN_IN_MS;
        }).map(m => m.full_id)
      );

      let rankPruned = 0;
      for (const role of Object.keys(rankings)) {
        if (role === 'description') continue;
        const arr = rankings[role];
        if (!Array.isArray(arr)) continue;
        const before = arr.length;
        rankings[role] = arr.filter(id => !staleIds.has(id));
        rankPruned += before - rankings[role].length;
      }

      if (rankPruned > 0) {
        await pool.query(
          "UPDATE metadata SET value = $1, updated_at = now() WHERE key = '_role_rankings'",
          [JSON.stringify(rankings)]
        );
        console.log(`  Removed ${rankPruned} stale non-working entries from rankings`);
      } else {
        console.log('  No stale entries to prune.');
      }
    }
  } finally {
    await pool.end();
  }

  // 3. Backfill context_length
  console.log('\nBackfilling context_length...');
  execSync('node scripts/backfill-context.js --apply', { stdio: 'inherit' });

  // 4. Snapshot pre-ranking state for drift detection
  const preRankData = await loadFromDb();
  const preRankTop3 = {};
  for (const role of Object.keys(preRankData._role_rankings)) {
    if (role === 'description') continue;
    const arr = preRankData._role_rankings[role];
    preRankTop3[role] = Array.isArray(arr) ? arr.slice(0, 3) : [];
  }

  // 5. Re-rank models
  console.log('Re-ranking models...');
  execSync('node scripts/rank-models.js --apply', { stdio: 'inherit' });

  // 6. Detect ranking drift
  const postRankData = await loadFromDb();
  for (const role of Object.keys(preRankTop3)) {
    const postTop3 = (postRankData._role_rankings[role] || []).slice(0, 3);
    const preIds = new Set(preRankTop3[role]);
    const postIds = new Set(postTop3);
    const changed = ![...preIds].every(id => postIds.has(id));
    if (changed) {
      console.log(`  ⚠ ${role} top-3 changed: [${preRankTop3[role].join(', ')}] → [${postTop3.join(', ')}]`);
    }
  }

  // 7. Run ranking sanity check (reads from DB)
  console.log('Running ranking sanity check...');
  execSync('node scripts/check-rankings.js', { stdio: 'inherit' });

  // 8. Regenerate _test_summary and persist to PG
  console.log('Regenerating _test_summary...');
  const summaryData = await loadFromDb();
  const freeModels = summaryData.models.filter(m => m.is_free);
  const byResult = (r) => freeModels.filter(m => m.status.result === r).map(m => m.id).sort();
  const newSummary = {
    date: new Date().toISOString().slice(0, 10),
    results: {
      working: byResult('working'),
      rate_limited: byResult('rate_limited'),
      broken: byResult('broken'),
      untested: byResult('untested'),
      not_found: byResult('not_found'),
    },
  };

  const summaryPool = connectionString
    ? new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 })
    : new Pool({
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        max: 1,
      });
  try {
    await summaryPool.query(
      "INSERT INTO metadata (key, value) VALUES ('_test_summary', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
      [JSON.stringify(newSummary)]
    );
  } finally {
    await summaryPool.end();
  }
  console.log(`  _test_summary updated: ${newSummary.results.working.length} working, ${newSummary.results.rate_limited.length} rate_limited, ${newSummary.results.broken.length} broken`);

  // 10. Generate summary log
  const summaryOutput = execSync('node scripts/model-summary.js', { encoding: 'utf8' });
  fs.writeFileSync(SUMMARY_LOG, summaryOutput, 'utf8');
  console.log(`Summary written to ${SUMMARY_LOG}`);

  // 11. Export final JSON for git
  exportJson();

  // 12. Detect changes and commit
  let hasChanges = false;
  try {
    execSync('git diff --quiet available-models.json', { stdio: 'pipe' });
  } catch {
    hasChanges = true;
  }

  if (hasChanges) {
    const finalData = await loadFromDb();
    const free = finalData.models.filter(m => m.is_free);
    const working = free.filter(m => m.status.result === 'working');
    const healthPct = Math.round((working.length / free.length) * 100);

    let shouldRollback = false;
    if (fs.existsSync(PREV_COPY)) {
      const prev = JSON.parse(fs.readFileSync(PREV_COPY, 'utf8'));
      const prevFree = prev.models.filter(m => m.is_free);
      const prevWorking = prevFree.filter(m => m.status.result === 'working');
      if (working.length < prevWorking.length) {
        shouldRollback = true;
        console.log(`Working models decreased from ${prevWorking.length} to ${working.length} – performing rollback`);
      }
    } else {
      if (healthPct < 70) {
        shouldRollback = true;
        console.log(`Health ${healthPct}% below threshold 70% – performing rollback`);
      }
    }

    if (shouldRollback) {
      if (fs.existsSync(PREV_COPY)) {
        fs.copyFileSync(PREV_COPY, 'available-models.json');
        execSync('git add available-models.json');
        execSync(`git commit -m "chore(models): automatic rollback to previous stable state (health ${healthPct}%)"`);
         execSync('git push origin master');
        console.log('Rollback committed and pushed');
      }
      process.exit(0);
    }

    execSync('git add available-models.json');
    execSync(`git commit -m "chore(models): nightly validation ${today}"`);

    // Push
    execSync('git push origin master');
    console.log('Pushed commits');
  } else {
    console.log('No changes detected; nothing to commit.');
  }

  // 13. Alert via webhook – highlight models that recovered to working status
  if (fs.existsSync(PREV_COPY)) {
    const prev = JSON.parse(fs.readFileSync(PREV_COPY, 'utf8'));
    const curr = await loadFromDb();

    const recovered = curr.models.filter(m => {
      if (m.status.result !== 'working') return false;
      const prevMatch = prev.models.find(pm => pm.id === m.id);
      return prevMatch && prevMatch.status.result !== 'working';
    });

    if (recovered.length > 0 && alertEndpoints.length > 0) {
      const payload = JSON.stringify({ severity: 'warning', type: 'recovery', models: recovered.map(m => m.id) });
      const tmpFile = path.join(require('os').tmpdir(), `gfm-alert-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, payload, 'utf8');
      for (const url of alertEndpoints) {
        try {
          execSync(`curl -s -X POST -H 'Content-Type: application/json' -d @'${tmpFile}' '${url}'`, { stdio: 'pipe' });
          console.log(`Alert sent to ${url}`);
        } catch {
          console.log(`Failed to send alert to ${url}`);
        }
      }
      fs.unlinkSync(tmpFile);
    }
  }
})().catch(e => { console.error(e.message); process.exit(1); });
