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
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pool = require('../server/db');

const REPO_ROOT = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(REPO_ROOT, 'snapshots');
const SUMMARY_LOG = path.join(REPO_ROOT, 'nightly-summary.log');
const EXPORT_SCRIPT = path.join(__dirname, 'export-from-pg.js');
const LOAD_SCRIPT = path.join(__dirname, 'load-models.js');

if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

// ── Async spawn helper (replaces blocking execSync) ──
// Uses shell:true so quoted args and variable interpolation work correctly.
function run(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [], {
      shell: true,
      stdio: 'inherit',
      cwd: REPO_ROOT,
      env: process.env,
      windowsHide: true,
      ...opts,
    });
    let stdout = '';
    if (child.stdout) child.stdout.on('data', d => stdout += d);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

const today = new Date().toISOString().slice(0, 10);
const PREV_COPY = path.join(SNAPSHOT_DIR, `available-models-${today}.json`);

// Steps whose failure aborts the pipeline (data integrity depends on them)
// eslint-disable-next-line no-unused-vars
const CRITICAL_STEPS = new Set(['validate', 're-rank', 'commit-push']);

// Change to repo directory
process.chdir(REPO_ROOT);

// Ensure git identity is set
(async () => {
  try {
    await run('git config user.email');
  } catch {
    await run('git config user.email "nightly@grabfreemodels"');
    await run('git config user.name "Nightly Maintenance"');
  }
})();

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
async function exportJson() {
  await run(`node ${EXPORT_SCRIPT}`);
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
  'check-creator-consistency',
  'check-health-degradation',
  'inherit-families',
  'backfill-family-by-name',
  'backfill-derivatives',
  'check-base-model-cycles',
  'backfill-quantization',
  'prune-stale-rankings',
  'backfill-context',
  'snapshot-pre-rank-state',
  're-rank',
  'detect-ranking-drift',
  'ranking-sanity-check',
  'check-router-only-models',
  'build-routing-graph',
  'build-provider-timeline',
  'sync-paid-models',
  'rank-paid-models',
  'check-paid-rankings',
  'import-financials',
  'regenerate-test-summary',
  'generate-summary-log',
  'export-final-json',
  'commit-push',
  'invalidate-api-cache',
  'webhook-alerts',
  'nightly-summary',
];

const cliArgs = process.argv.slice(2);
let targetStep = null;
let continueAfter = false;
let dryRun = false;
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
  if (cliArgs[i] === '--dry-run') dryRun = true;
}
if (dryRun) {
  console.log('\n⚠ DRY-RUN MODE — no DB writes, no commits\n');
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
  pipelineStart = Date.now();

    // 0. Save previous state for rollback and recovery detection
    await runStep('snapshot-prev-state', async () => {
      exportJson();
      if (fs.existsSync('available-models.json')) {
        fs.copyFileSync('available-models.json', PREV_COPY);
      }
    });

    // 1. Run validation (updates statuses in PG, exports JSON, records test observations)
    console.log('Running validation...');
    await runStep(
      'validate',
      async () => {
        await run('node scripts/validate-free-models.js --apply');
      },
      { critical: true },
    );

    // 1b. Verify test observations were recorded
    await runStep('record-observations', async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { rows } = await pool.query(
          "SELECT COUNT(*) AS count, COUNT(DISTINCT full_id) AS models FROM test_observations WHERE tested_at::date >= $1",
          [today],
        );
        const count = parseInt(rows[0].count, 10);
        const models = parseInt(rows[0].models, 10);
        console.log(`  ${count} observations across ${models} models for ${today}`);
        if (count === 0) {
          console.log('  WARNING: No test observations recorded — table may be empty');
        }
      } catch (e) {
        // If the table doesn't exist yet (migration not run), log warning but don't fail
        console.log(`  Unable to query test_observations: ${e.message}`);
      }
    });

    // 1c. Check for creator name splits (e.g., same display name under two creator IDs)
    await runStep('check-creator-consistency', async () => {
      try {
        await run('node scripts/check-creator-consistency.js --json');
      } catch (e) {
        // Don't fail the pipeline — consistency issues are surfaced as warnings
        console.log(`  Creator consistency check found issues: ${e.message}`);
      }
    });

    // 1d. Check for degradation (latency spikes, failure rate jumps)
    await runStep('check-degradation', async () => {
      try {
        await run('node scripts/check-degradation.js');
      } catch (e) {
        // Don't fail the pipeline — degradation checks are diagnostic
        console.log(`  Degradation check exited with error: ${e.message}`);
      }
    });

    // 1d. Check model health degradation — models with 5+ consecutive working tests now broken
    await runStep('check-health-degradation', async () => {
      try {
        const { rows } = await pool.query(`
          WITH inference_models AS (
            SELECT dm.full_id
            FROM datapoint_models dm
            JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
            WHERE dm.is_free = true AND dm.is_removed = false
              AND (dp.is_health_trackable = true OR dp.is_health_trackable IS NULL)
          )
          SELECT tob.full_id, tob.status, tob.tested_at
          FROM test_observations tob
          JOIN inference_models im ON im.full_id = tob.full_id
          WHERE tob.status = 'fail' OR tob.status = 'pass'
          ORDER BY tob.full_id, tob.tested_at DESC
        `);

        // Group by full_id and check health degradation
        const healthMap = new Map();
        for (const r of rows) {
          if (!healthMap.has(r.full_id)) healthMap.set(r.full_id, []);
          healthMap.get(r.full_id).push(r);
        }

        const degraded = [];
        for (const [fullId, snapshots] of healthMap) {
          if (snapshots.length < 6) continue; // need at least 6 to have 5 working + 1 broken

          const mostRecent = snapshots[0];
          if (mostRecent.status === 'pass') continue; // still working, no issue

          // Count consecutive working before the most recent non-working
          let streak = 0;
          for (let i = 1; i < snapshots.length; i++) {
            if (snapshots[i].status === 'pass') streak++;
            else break;
          }

          if (streak >= 5) {
            degraded.push({
              full_id: fullId,
              status: mostRecent.status,
              tested_at: new Date(mostRecent.tested_at).toISOString().slice(0, 10),
              streak,
            });
          }
        }

        if (degraded.length === 0) {
          console.log('  \x1b[32mNo health degradation detected.\x1b[0m');
        } else {
          console.log(`  \x1b[33m${degraded.length} model(s) with health degradation:\x1b[0m`);
          for (const d of degraded) {
            const color = d.status === 'broken' ? '\x1b[31m' : '\x1b[33m';
            console.log(`    ${color}${d.full_id}\x1b[0m — ${d.status} on ${d.tested_at} (was working for ${d.streak} consecutive tests)`);
          }
        }
      } catch (e) {
        console.log(`  Unable to query test_observations: ${e.message}`);
      }
    });

    // 2. Inherit family assignments from base model parents
    console.log('Inheriting family assignments from base model parents...');
    await runStep('inherit-families', async () => {
      await run('node scripts/inherit-families.js --apply');
    });

    // 3. Backfill family assignments from model names
    console.log('Backfilling family assignments from model names...');
    await runStep('backfill-family-by-name', async () => {
      await run('node scripts/backfill-family-by-name.js --apply');
    });

    // 3b. Backfill training lineage (derivation_method, base_model) from HF Hub metadata
    console.log('Backfilling training lineage from HF Hub metadata...');
    await runStep('backfill-derivatives', async () => {
      await run('node scripts/backfill-derivatives.js --apply');
    });

    // 3b2. Guard: detect and fix circular base_model chains before any chain-walking
    await runStep('check-base-model-cycles', async () => {
      await run('node scripts/check-base-model-cycles.js --apply');
    });

    // 3c. Backfill quantization from HF Hub tags + model names
    console.log('Backfilling quantization from HF Hub tags...');
    await runStep('backfill-quantization', async () => {
      await run('node scripts/backfill-quantization.js --apply');
    });

    // 4. Prune stale non-working models from rankings metadata (7-day burn-in)
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

    // 5. Backfill context_length
    console.log('\nBackfilling context_length...');
    await runStep('backfill-context', async () => {
      await run('node scripts/backfill-context.js --apply');
    });

    // 6. Snapshot pre-ranking state for drift detection
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

    // 7. Re-rank models
    console.log('Re-ranking models...');
    await runStep(
      're-rank',
      async () => {
        await run('node scripts/rank.js --apply');
      },
      { critical: true },
    );

    // 8. Detect ranking drift
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

    // 9. Run ranking sanity check (reads from DB)
    console.log('Running ranking sanity check...');
    await runStep('ranking-sanity-check', async () => {
      await run('node scripts/check-rankings.js');
    });

    // 9b. Detect models only available through routers (no inference provider)
    console.log('\nChecking for router-only models...');
    await runStep('check-router-only-models', async () => {
      const { rows: routerOnly } = await pool.query(`
        WITH model_providers AS (
          SELECT sm.slug, sm.name,
                 array_agg(DISTINCT dp.provider_type::text) AS provider_types,
                 count(DISTINCT dm.datapoint_provider_id) AS provider_count
          FROM super_models sm
          JOIN datapoint_models dm ON dm.super_model_id = sm.id
          JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
          WHERE dm.is_removed = false AND dm.is_free = true
          GROUP BY sm.slug, sm.name
        )
        SELECT slug, name, provider_count, provider_types
        FROM model_providers
        WHERE NOT ('inference' = ANY(provider_types))
          AND NOT ('local' = ANY(provider_types))
          AND ('router' = ANY(provider_types))
        ORDER BY slug
      `);
      const payload = {
        count: routerOnly.length,
        models: routerOnly.map((r) => ({ slug: r.slug, name: r.name, provider_count: r.provider_count })),
        checked_at: new Date().toISOString(),
      };
      await pool.query(
        `INSERT INTO metadata (key, value) VALUES ('_router_only_models', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(payload)],
      );
      console.log(`  Router-only models: ${routerOnly.length} (stored in metadata._router_only_models)`);
      if (routerOnly.length > 0) {
        console.log(`  Top 5:`);
        for (const m of routerOnly.slice(0, 5)) {
          console.log(`    ${m.slug} — via ${m.provider_count} provider(s)`);
        }
      }
      return payload;
    });

    // 9c. Build provider routing graph (which inference providers each router routes to)
    console.log('\nBuilding provider routing graph...');
    await runStep('build-routing-graph', async () => {
      const { rows: graphRows } = await pool.query(`
        SELECT
          dp1.slug AS router_slug,
          dp2.slug AS backend_slug,
          dp2.name AS backend_name,
          dp2.provider_type AS backend_type,
          count(DISTINCT sm.id) AS shared_models
        FROM super_models sm
        JOIN datapoint_models dm1 ON dm1.super_model_id = sm.id
        JOIN datapoint_providers dp1 ON dp1.id = dm1.datapoint_provider_id
        JOIN datapoint_models dm2 ON dm2.super_model_id = sm.id
        JOIN datapoint_providers dp2 ON dp2.id = dm2.datapoint_provider_id
        WHERE dm1.is_removed = false AND dm2.is_removed = false
          AND dm1.is_free = true AND dm2.is_free = true
          AND dp1.provider_type = 'router'
          AND dp2.provider_type IN ('inference', 'local')
          AND dp1.slug != dp2.slug
        GROUP BY dp1.slug, dp2.slug, dp2.name, dp2.provider_type
        ORDER BY dp1.slug, shared_models DESC
      `);
      const routing = {};
      for (const r of graphRows) {
        if (!routing[r.router_slug]) routing[r.router_slug] = [];
        routing[r.router_slug].push({
          backend: r.backend_slug,
          name: r.backend_name,
          type: r.backend_type,
          shared_models: Number(r.shared_models),
        });
      }
      const payload = {
        routers: routing,
        built_at: new Date().toISOString(),
      };
      await pool.query(
        `INSERT INTO metadata (key, value) VALUES ('_provider_routing_graph', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(payload)],
      );
      const routerCount = Object.keys(routing).length;
      console.log(`  Routing graph: ${routerCount} routers mapped (stored in metadata._provider_routing_graph)`);
      for (const [router, backends] of Object.entries(routing)) {
        console.log(`    ${router} → ${backends.length} backend(s), ${backends.reduce((s,b) => s + b.shared_models, 0)} shared models`);
      }
      return payload;
    });

    // 9d. Build provider ecosystem timeline (growth over time)
    console.log('\nBuilding provider ecosystem timeline...');
    await runStep('build-provider-timeline', async () => {
      const { rows: timelineRows } = await pool.query(`
        SELECT created_at::date AS date, slug, name, provider_type
        FROM datapoint_providers
        ORDER BY created_at
      `);
      const byDate = {};
      for (const r of timelineRows) {
        const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push({ slug: r.slug, name: r.name, type: r.provider_type });
      }
      // Build cumulative counts
      const entries = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
      let cumulative = 0;
      const timeline = entries.map(([date, providers]) => {
        const addedCount = Array.isArray(providers) ? providers.length : 0;
        cumulative += addedCount;
        return { date, added: providers, cumulative };
      });
      const payload = {
        timeline,
        total: cumulative,
        built_at: new Date().toISOString(),
      };
      await pool.query(
        `INSERT INTO metadata (key, value) VALUES ('_provider_timeline', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(payload)],
      );
      console.log(`  Timeline: ${entries.length} dates, ${cumulative} total providers (stored in metadata._provider_timeline)`);
      return payload;
    });

    // 10. Sync paid models from OpenRouter
    console.log('\nSyncing paid models...');
    await runStep('sync-paid-models', async () => {
      await run('node scripts/sync-paid-models.js --apply');
    });

    // 11. Rank paid models
    console.log('Ranking paid models...');
    await runStep('rank-paid-models', async () => {
      await run('node scripts/rank.js --paid --apply');
    });

    // 12. Check paid rankings
    console.log('Checking paid rankings...');
    await runStep('check-paid-rankings', async () => {
      delete require.cache[require.resolve(LOAD_SCRIPT)];
      const load = require(LOAD_SCRIPT);
      const paidData = await load(pool, { isFree: false });
      const r = paidData._role_rankings || {};
      let total = 0;
      for (const [role, ids] of Object.entries(r)) {
        if (Array.isArray(ids)) {
          console.log(`  Paid ${role}: ${ids.length} models`);
          total += ids.length;
        }
      }
      console.log(`  Total paid ranking entries: ${total}`);
    });

    // 13. Import AI company financials from isaiprofitable.com
    console.log('\nImporting AI company financials...');
    await runStep('import-financials', async () => {
      await run('node scripts/import-is-ai-profitable.js --apply');
    });

    // 14. Regenerate _test_summary and persist to PG
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

    // 15. Generate summary log
    await runStep('generate-summary-log', async () => {
      try {
        const summaryOutput = await run('node scripts/model-summary.js');
        fs.writeFileSync(SUMMARY_LOG, summaryOutput, 'utf8');
        console.log(`Summary written to ${SUMMARY_LOG}`);
      } catch (e) {
        console.error('Failed to generate summary log:', e.message);
        // Non-critical — don't fail the pipeline
      }
    });

    // 16. Export final JSON for git
    await runStep('export-final-json', async () => {
      exportJson();
    });

    // 17. Detect changes and commit
    await runStep(
      'commit-push',
      async () => {
        let hasChanges = false;
        try {
          await run('git diff --quiet available-models.json');
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
          // WARNING: This rollback only restores available-models.json (the git-committed
          // JSON export). It does NOT restore the PostgreSQL database. Since the next
          // export immediately overwrites the restored JSON with the current DB state,
          // the rollback provides no actual protection against bad DB data. A proper
          // rollback would need to restore DB state from a pg_dump snapshot.
          console.log('  NOTE: Rollback only restores JSON export file, NOT the PostgreSQL database.');
          console.log('  The next export will overwrite the restored JSON with current DB state.');
          if (fs.existsSync(PREV_COPY)) {
            fs.copyFileSync(PREV_COPY, 'available-models.json');
            await run('git add available-models.json');
            await run(`git commit -m "chore(models): automatic rollback to previous stable state (health ${healthPct}%)"`);
            await run('git push origin master');
            console.log('Rollback committed and pushed');
          }
          await pool.end();
          process.exit(0);
        }

        await run('git add available-models.json');
        await run(`git commit -m "chore(models): nightly validation ${today}"`);
        await run('git push origin master');
        console.log('Pushed commits');
      },
      { critical: true },
    );

    // 18. Alert via webhook – highlight models that recovered to working status
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
            await run(
              `curl -s -X POST -H 'Content-Type: application/json' -d @'${tmpFile}' '${url}'`,
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

    // 19. Invalidate API cache so the server serves fresh data immediately
    await runStep('invalidate-api-cache', async () => {
      const apiPort = process.env.API_PORT || 3001;
      const adminToken = process.env.ADMIN_TOKEN;
      if (!adminToken) {
        console.log('ADMIN_TOKEN not set — cache invalidation skipped');
        return;
      }
      try {
        await run(
          `curl -s -X POST http://localhost:${apiPort}/api/cache/invalidate -H 'X-Admin-Token: ${adminToken}'`,
        );
        console.log('API cache invalidated');
      } catch (e) {
        console.error('Cache invalidation failed (non-critical):', e.message);
      }
    });

    // 20. Nightly summary delivery to Slack/Discord
    await runStep('nightly-summary', async () => {
      await run('node scripts/nightly-summary.js');
    });

    printStepTable(Date.now() - pipelineStart);
})().catch((e) => {
  console.error(`Pipeline aborted: ${e.message}`);
  printStepTable(Date.now() - pipelineStart);
  process.exit(1);
});
