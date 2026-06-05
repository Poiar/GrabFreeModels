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
 * Usage: node scripts/nightly-maintenance.js [--step <name>] [--continue]
 *   --step     : Run starting from a named step, skipping earlier ones
 *   --continue : When combined with --step, continue past the target step
 */

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const REPO_ROOT = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(REPO_ROOT, 'snapshots');
const SUMMARY_LOG = path.join(REPO_ROOT, 'nightly-summary.log');
const EXPORT_SCRIPT = path.join(__dirname, 'export-from-pg.js');
const LOAD_SCRIPT = path.join(__dirname, 'load-models.js');

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

if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const PREV_COPY = path.join(SNAPSHOT_DIR, `available-models-${today}.json`);

// Steps whose failure aborts the pipeline (data integrity depends on them)
// eslint-disable-next-line no-unused-vars
const CRITICAL_STEPS = new Set(['validate', 're-rank', 'commit-push']);

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
} catch {
  /* ignore parse errors */
}
if (!webhookUrl) webhookUrl = process.env.WEBHOOK_URL;
if (webhookUrl) alertEndpoints.push(webhookUrl);

/** Export current DB state to JSON file (for git snapshot) */
function exportJson() {
  execSync(`node ${EXPORT_SCRIPT}`, { stdio: 'inherit' });
}

/** Load full models data from DB using the shared pool */
function loadFromDb() {
  delete require.cache[require.resolve(LOAD_SCRIPT)];
  const load = require(LOAD_SCRIPT);
  return load(pool);
}

// --- CLI: --step <name> [--continue] ---
const STEP_NAMES = [
  'snapshot-prev-state',
  'validate',
  'prune-stale-rankings',
  'backfill-context',
  'snapshot-pre-rank-state',
  're-rank',
  'detect-ranking-drift',
  'ranking-sanity-check',
  'regenerate-test-summary',
  'generate-summary-log',
  'export-final-json',
  'commit-push',
  'webhook-alerts',
];

const cliArgs = process.argv.slice(2);
let targetStep = null;
let continueAfter = false;
for (let i = 0; i < cliArgs.length; i++) {
  if (cliArgs[i] === '--step' && cliArgs[i + 1]) {
    targetStep = cliArgs[++i];
    if (!STEP_NAMES.includes(targetStep)) {
      console.error(`Unknown step: ${targetStep}`);
      console.error(`Available steps: ${STEP_NAMES.join(', ')}`);
      process.exit(1);
    }
  }
  if (cliArgs[i] === '--continue') continueAfter = true;
}

if (targetStep) {
  console.log(
    `\nSingle-step mode: starting at "${targetStep}"${continueAfter ? ' (will continue)' : ' (exits after step)'}\n`,
  );
}

/** Check if a step should be executed given --step targeting */
function shouldRunStep(name) {
  if (!targetStep) return true; // normal full-pipeline mode
  const targetIdx = STEP_NAMES.indexOf(targetStep);
  const thisIdx = STEP_NAMES.indexOf(name);
  if (thisIdx < targetIdx) return false; // skip steps before target
  if (!continueAfter && thisIdx > targetIdx) return false; // skip steps after target unless --continue
  return true;
}

/** Track per-step results for the summary table */
const stepResults = [];

function recordStep(name, status, error, duration) {
  stepResults.push({ name, status, error: error || null, duration });
}

/**
 * Wrap a pipeline step with timing, error handling, and criticality check.
 * Returns the step's return value. Throws on critical failures.
 */
let stepTargetHit = false;

async function runStep(name, fn, { critical = false } = {}) {
  // --step targeting: skip steps before target
  if (!shouldRunStep(name)) {
    recordStep(name, 'skip', null, '0.0');
    console.log(`  [SKIP] ${name} (--step targets "${targetStep}")`);
    return;
  }
  if (targetStep && !continueAfter && stepTargetHit) {
    // Past the target step and --continue not set; skip remaining
    recordStep(name, 'skip', null, '0.0');
    console.log(`  [SKIP] ${name} (--step mode, exiting after "${targetStep}")`);
    return;
  }

  const start = Date.now();
  try {
    const result = await fn();
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    recordStep(name, 'pass', null, duration);
    console.log(`  [OK] ${name} (${duration}s)`);
    if (targetStep && !continueAfter) stepTargetHit = true;
    return result;
  } catch (e) {
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    const msg = e.message || String(e);
    recordStep(name, 'fail', msg, duration);
    console.error(`  [FAIL] ${name} (${duration}s): ${msg}`);
    if (targetStep && !continueAfter) stepTargetHit = true; // still mark that we reached the target
    if (critical) {
      throw e;
    }
  }
}

/** Print formatted step results table */

function printStepTable(totalDuration) {
  const totalSec = (totalDuration / 1000).toFixed(1);
  console.log('\n─── Pipeline Results ───');
  console.log(`  ${'Step'.padEnd(36)} ${'Status'.padEnd(7)} ${'Duration'.padEnd(9)} Error`);
  console.log('  ' + '─'.repeat(80));
  for (const s of stepResults) {
    const marker = s.status === 'pass' ? 'OK' : s.status === 'skip' ? 'SKIP' : 'FAIL';
    const err = s.error ? ` (${s.error})` : '';
    console.log(`  ${s.name.padEnd(36)} ${marker.padEnd(7)} ${`${s.duration}s`.padEnd(9)}${err}`);
  }
  console.log('  ' + '─'.repeat(80));
  console.log(
    `  Total: ${totalSec}s  |  Passed: ${stepResults.filter((s) => s.status === 'pass').length}/${stepResults.length}`,
  );
  console.log('────────────────────────\n');
}

let pipelineStart = Date.now();

(async () => {
  try {
    pipelineStart = Date.now();

    // 0. Save previous state for rollback and recovery detection
    await runStep('snapshot-prev-state', async () => {
      exportJson();
      if (fs.existsSync('available-models.json')) {
        fs.copyFileSync('available-models.json', PREV_COPY);
      }
    });

    // 1. Run validation (updates statuses in PG, exports JSON)
    console.log('Running validation...');
    await runStep(
      'validate',
      async () => {
        execSync('node scripts/validate-free-models.js --apply', { stdio: 'inherit' });
      },
      { critical: true },
    );

    // 2. Prune stale non-working models from rankings metadata (7-day burn-in)
    console.log('Pruning stale non-working models from rankings (7-day burn-in)...');
    await runStep('prune-stale-rankings', async () => {
      const BURN_IN_MS = 7 * 24 * 60 * 60 * 1000;
      const nowMs = Date.now();

      {
        const { rows: metaRows } = await pool.query(
          "SELECT value::text FROM metadata WHERE key = '_role_rankings'",
        );
        if (metaRows.length === 0) {
          console.log('  No rankings found, skipping prune.');
          return;
        }
        const rankings = JSON.parse(metaRows[0].value);

        const { rows: modelRows } = await pool.query(`
          SELECT dm.full_id, dm.status_result, dm.status_tested
          FROM datapoint_models dm
          WHERE dm.is_free = true AND dm.status_result != 'working'
        `);

        const staleIds = new Set(
          modelRows
            .filter((m) => {
              if (!m.status_tested) return false;
              return nowMs - new Date(m.status_tested).getTime() > BURN_IN_MS;
            })
            .map((m) => m.full_id),
        );

        let rankPruned = 0;
        for (const role of Object.keys(rankings)) {
          if (role === 'description') continue;
          const arr = rankings[role];
          if (!Array.isArray(arr)) continue;
          const before = arr.length;
          rankings[role] = arr.filter((id) => !staleIds.has(id));
          rankPruned += before - rankings[role].length;
        }

        if (rankPruned > 0) {
          await pool.query(
            "UPDATE metadata SET value = $1, updated_at = now() WHERE key = '_role_rankings'",
            [JSON.stringify(rankings)],
          );
          console.log(`  Removed ${rankPruned} stale non-working entries from rankings`);
        } else {
          console.log('  No stale entries to prune.');
        }
      }
    });

    // 3. Backfill context_length
    console.log('\nBackfilling context_length...');
    await runStep('backfill-context', async () => {
      execSync('node scripts/backfill-context.js --apply', { stdio: 'inherit' });
    });

    // 4. Snapshot pre-ranking state for drift detection
    const preRankTop3 = await runStep('snapshot-pre-rank-state', async () => {
      const preRankData = await loadFromDb();
      const top3 = {};
      for (const role of Object.keys(preRankData._role_rankings)) {
        if (role === 'description') continue;
        const arr = preRankData._role_rankings[role];
        top3[role] = Array.isArray(arr) ? arr.slice(0, 3) : [];
      }
      return top3;
    });

    // 5. Re-rank models
    console.log('Re-ranking models...');
    await runStep(
      're-rank',
      async () => {
        execSync('node scripts/rank-models.js --apply', { stdio: 'inherit' });
      },
      { critical: true },
    );

    // 6. Detect ranking drift
    await runStep('detect-ranking-drift', async () => {
      if (!preRankTop3) return;
      const postRankData = await loadFromDb();
      for (const role of Object.keys(preRankTop3)) {
        const postTop3 = (postRankData._role_rankings[role] || []).slice(0, 3);
        const preIds = new Set(preRankTop3[role]);
        const postIds = new Set(postTop3);
        const changed = ![...preIds].every((id) => postIds.has(id));
        if (changed) {
          console.log(
            `  Ranking drift detected for ${role}: [${preRankTop3[role].join(', ')}] → [${postTop3.join(', ')}]`,
          );
        }
      }
    });

    // 7. Run ranking sanity check (reads from DB)
    console.log('Running ranking sanity check...');
    await runStep('ranking-sanity-check', async () => {
      execSync('node scripts/check-rankings.js', { stdio: 'inherit' });
    });

    // 8. Regenerate _test_summary and persist to PG
    console.log('Regenerating _test_summary...');
    await runStep('regenerate-test-summary', async () => {
      const summaryData = await loadFromDb();
      const freeModels = summaryData.models.filter((m) => m.is_free);
      const byResult = (r) =>
        freeModels
          .filter((m) => m.status.result === r)
          .map((m) => m.id)
          .sort();
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

      await pool.query(
        "INSERT INTO metadata (key, value) VALUES ('_test_summary', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
        [JSON.stringify(newSummary)],
      );
      console.log(
        `  _test_summary updated: ${newSummary.results.working.length} working, ${newSummary.results.rate_limited.length} rate_limited, ${newSummary.results.broken.length} broken`,
      );
    });

    // 10. Generate summary log
    await runStep('generate-summary-log', async () => {
      const summaryOutput = execSync('node scripts/model-summary.js', { encoding: 'utf8' });
      fs.writeFileSync(SUMMARY_LOG, summaryOutput, 'utf8');
      console.log(`Summary written to ${SUMMARY_LOG}`);
    });

    // 11. Export final JSON for git
    await runStep('export-final-json', async () => {
      exportJson();
    });

    // 12. Detect changes and commit
    await runStep(
      'commit-push',
      async () => {
        let hasChanges = false;
        try {
          execSync('git diff --quiet available-models.json', { stdio: 'pipe' });
        } catch {
          hasChanges = true;
        }

        if (!hasChanges) {
          console.log('No changes detected; nothing to commit.');
          return;
        }

        const finalData = await loadFromDb();
        const free = finalData.models.filter((m) => m.is_free);
        const working = free.filter((m) => m.status.result === 'working');
        const healthPct = Math.round((working.length / free.length) * 100);

        let shouldRollback = false;
        if (fs.existsSync(PREV_COPY)) {
          const prev = JSON.parse(fs.readFileSync(PREV_COPY, 'utf8'));
          const prevFree = prev.models.filter((m) => m.is_free);
          const prevWorking = prevFree.filter((m) => m.status.result === 'working');
          if (working.length < prevWorking.length) {
            shouldRollback = true;
            console.log(
              `Working models decreased from ${prevWorking.length} to ${working.length} – performing rollback`,
            );
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
            execSync(
              `git commit -m "chore(models): automatic rollback to previous stable state (health ${healthPct}%)"`,
            );
            execSync('git push origin master');
            console.log('Rollback committed and pushed');
          }
          return;
        }

        execSync('git add available-models.json');
        execSync(`git commit -m "chore(models): nightly validation ${today}"`);
        execSync('git push origin master');
        console.log('Pushed commits');
      },
      { critical: true },
    );

    // 13. Alert via webhook – highlight models that recovered to working status
    await runStep('webhook-alerts', async () => {
      if (!fs.existsSync(PREV_COPY)) return;
      const prev = JSON.parse(fs.readFileSync(PREV_COPY, 'utf8'));
      const curr = await loadFromDb();

      const recovered = curr.models.filter((m) => {
        if (m.status.result !== 'working') return false;
        const prevMatch = prev.models.find((pm) => pm.id === m.id);
        return prevMatch && prevMatch.status.result !== 'working';
      });

      if (recovered.length === 0 || alertEndpoints.length === 0) return;

      const payload = JSON.stringify({
        severity: 'warning',
        type: 'recovery',
        models: recovered.map((m) => m.id),
      });
      const tmpFile = path.join(require('os').tmpdir(), `gfm-alert-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, payload, 'utf8');

      for (const url of alertEndpoints) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            execSync(
              `curl -s -X POST -H 'Content-Type: application/json' -d @'${tmpFile}' '${url}'`,
              { stdio: 'pipe' },
            );
            console.log(`Alert sent to ${url}`);
            break;
          } catch (e) {
            if (attempt === 1) {
              console.log(`Alert to ${url} failed, retrying in 5s...`);
              await new Promise((r) => setTimeout(r, 5000));
            } else {
              console.error(`Failed to send alert to ${url} after 2 attempts: ${e.message}`);
            }
          }
        }
      }
      fs.unlinkSync(tmpFile);
    });

    printStepTable(Date.now() - pipelineStart);
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(`Pipeline aborted: ${e.message}`);
  printStepTable(Date.now() - pipelineStart);
  process.exit(1);
});
