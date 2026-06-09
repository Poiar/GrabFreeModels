#!/usr/bin/env node
/**
 * check-degradation.js
 * Compares latest validation run against a 7-day rolling baseline.
 * Flags models where:
 *   - p95 latency > 2 sigma above baseline mean
 *   - Failure rate jumps > 20 percentage points
 *
 * Usage:
 *   node scripts/check-degradation.js                  # human-readable output
 *   node scripts/check-degradation.js --json           # JSON output
 *   node scripts/check-degradation.js --baseline-days 14  # custom baseline window
 */

require('dotenv').config();
const pool = require('../server/db');

const args = process.argv.slice(2);
const JSON_OUTPUT = args.includes('--json');
const BASELINE_DAYS = (() => {
  const idx = args.indexOf('--baseline-days');
  return idx !== -1 ? parseInt(args[idx + 1], 10) : 7;
})();
const LATENCY_SIGMA_THRESHOLD = 2.0;  // number of sigma above baseline mean
const FAILURE_RATE_DELTA_THRESHOLD = 20;  // percentage point increase

async function main() {
  // Check table exists
  try {
    await pool.query('SELECT 1 FROM test_observations LIMIT 1');
  } catch {
    console.log(JSON_OUTPUT
      ? JSON.stringify({ error: 'test_observations table does not exist' })
      : 'test_observations table does not exist. Run migration 003 first.');
    process.exit(0);
  }

  // 1. Find the latest run date(s) — the most recent day with observations
  const { rows: latestDateRows } = await pool.query(`
    SELECT tested_at::date AS run_date
    FROM test_observations
    GROUP BY tested_at::date
    ORDER BY run_date DESC
    LIMIT 1
  `);

  if (latestDateRows.length === 0) {
    console.log(JSON_OUTPUT ? JSON.stringify({ alerts: [] }) : 'No observations found.');
    await pool.end();
    return;
  }

  const latestDate = latestDateRows[0].run_date;
  const latestDateStr = latestDate.toISOString().slice(0, 10);

  // 2. Get latest-run per-model stats (p95 latency, failure rate)
  const { rows: latestRows } = await pool.query(`
    SELECT
      full_id,
      provider,
      COUNT(*) AS samples,
      COUNT(*) FILTER (WHERE status = 'fail') AS failed,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'fail') * 100.0 / NULLIF(COUNT(*), 0), 1
      ) AS failure_rate_pct,
      ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::numeric, 1) AS p95_ms
    FROM test_observations
    WHERE tested_at::date = $1
    GROUP BY full_id, provider
  `, [latestDateStr]);

  if (latestRows.length === 0) {
    console.log(JSON_OUTPUT ? JSON.stringify({ alerts: [] }) : `No observations for ${latestDateStr}.`);
    await pool.end();
    return;
  }

  // 3. Get baseline (7 days before latest, excluding latest date)
  const baselineStart = new Date(latestDate);
  baselineStart.setDate(baselineStart.getDate() - BASELINE_DAYS);
  const baselineStartStr = baselineStart.toISOString().slice(0, 10);

  const { rows: baselineRows } = await pool.query(`
    SELECT
      full_id,
      ROUND(AVG(latency_ms)::numeric, 1) AS mean_latency_ms,
      ROUND(stddev(latency_ms)::numeric, 1) AS stddev_latency_ms,
      ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::numeric, 1) AS baseline_p95_ms,
      COUNT(*) AS baseline_samples,
      COUNT(*) FILTER (WHERE status = 'fail') AS baseline_failed,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'fail') * 100.0 / NULLIF(COUNT(*), 0), 1
      ) AS baseline_failure_rate_pct
    FROM test_observations
    WHERE tested_at::date >= $1
      AND tested_at::date < $2
    GROUP BY full_id
  `, [baselineStartStr, latestDateStr]);

  // Index baseline by full_id
  const baselineMap = {};
  for (const r of baselineRows) {
    baselineMap[r.full_id] = r;
  }

  // 4. Compare each model from latest run against its baseline
  const alerts = [];

  for (const latest of latestRows) {
    const modelId = latest.full_id;
    const baseline = baselineMap[modelId];
    const modelAlerts = [];

    if (!baseline || parseInt(baseline.baseline_samples, 10) < 3) {
      // Not enough baseline data — skip (or mark as insufficient)
      continue;
    }

    // Check latency degradation
    if (latest.p95_ms !== null && baseline.mean_latency_ms !== null && baseline.stddev_latency_ms !== null) {
      const meanLatency = Number(baseline.mean_latency_ms);
      const stddevLatency = Number(baseline.stddev_latency_ms);
      const latestP95 = Number(latest.p95_ms);

      if (stddevLatency > 0) {
        const sigmaAbove = (latestP95 - meanLatency) / stddevLatency;
        if (sigmaAbove > LATENCY_SIGMA_THRESHOLD) {
          modelAlerts.push({
            type: 'latency_degradation',
            message: `p95 latency ${latestP95}ms is ${sigmaAbove.toFixed(1)}sigma above baseline mean ${meanLatency}ms (threshold: ${LATENCY_SIGMA_THRESHOLD}sigma)`,
            latest_p95_ms: latestP95,
            baseline_mean_ms: meanLatency,
            baseline_stddev_ms: stddevLatency,
            sigma_above: Math.round(sigmaAbove * 10) / 10,
          });
        }
      } else if (latestP95 > meanLatency * 1.5) {
        // Zero stddev but large jump — still flag it
        modelAlerts.push({
          type: 'latency_degradation',
          message: `p95 latency ${latestP95}ms is >50% above baseline mean ${meanLatency}ms (zero stddev in baseline)`,
          latest_p95_ms: latestP95,
          baseline_mean_ms: meanLatency,
          baseline_stddev_ms: 0,
          sigma_above: null,
        });
      }
    }

    // Check failure rate degradation
    const latestFailureRate = latest.failure_rate_pct !== null ? Number(latest.failure_rate_pct) : 0;
    const baselineFailureRate = Number(baseline.baseline_failure_rate_pct);
    const failureDelta = latestFailureRate - baselineFailureRate;

    if (failureDelta > FAILURE_RATE_DELTA_THRESHOLD) {
      modelAlerts.push({
        type: 'failure_rate_increase',
        message: `Failure rate jumped ${failureDelta.toFixed(1)}pp to ${latestFailureRate}% (baseline: ${baselineFailureRate}%)`,
        latest_failure_rate_pct: latestFailureRate,
        baseline_failure_rate_pct: baselineFailureRate,
        delta_pp: failureDelta,
      });
    }

    if (modelAlerts.length > 0) {
      alerts.push({
        full_id: modelId,
        provider: latest.provider,
        run_date: latestDateStr,
        baseline_days: BASELINE_DAYS,
        alerts: modelAlerts,
      });
    }
  }

  // 5. Also check for models that were in baseline but completely absent from latest run
  const latestModelIds = new Set(latestRows.map(r => r.full_id));
  for (const baseline of baselineRows) {
    if (!latestModelIds.has(baseline.full_id) && parseInt(baseline.baseline_samples, 10) >= 3) {
      alerts.push({
        full_id: baseline.full_id,
        provider: baseline.full_id.split('/')[0] || 'unknown',
        run_date: latestDateStr,
        baseline_days: BASELINE_DAYS,
        alerts: [{
          type: 'model_not_tested',
          message: `Model was not tested in latest run (was present in baseline with ${baseline.baseline_samples} samples)`,
        }],
      });
    }
  }

  const output = {
    description: `Degradation check: latest run ${latestDateStr} vs ${BASELINE_DAYS}-day baseline`,
    run_date: latestDateStr,
    baseline_days: BASELINE_DAYS,
    baseline_period: `${baselineStartStr} to ${new Date(latestDate.getTime() - 86400000).toISOString().slice(0, 10)}`,
    models_checked: latestRows.length,
    models_with_baseline: baselineRows.length,
    alerts_count: alerts.length,
    generated_at: new Date().toISOString(),
    alerts,
  };

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } else {
    console.log(`\n─── Degradation Check: ${latestDateStr} vs ${BASELINE_DAYS}-day baseline ───`);
    console.log(`  Checked ${latestRows.length} models (${baselineRows.length} with baseline data)`);

    if (alerts.length === 0) {
      console.log('  No degradation detected.');
    } else {
      console.log(`  ${alerts.length} model(s) with alerts:\n`);
      for (const a of alerts) {
        console.log(`  [${a.provider}] ${a.full_id}`);
        for (const alert of a.alerts) {
          const icon = alert.type === 'latency_degradation' ? 'LATENCY' : alert.type === 'failure_rate_increase' ? 'FAILURE' : 'MISSING';
          console.log(`    ${icon}: ${alert.message}`);
        }
        console.log('');
      }
    }

    if (output.alerts_count > 0) {
      console.log('  Degradation detected — review the models above.');
    } else {
      console.log('  All clear.\n');
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
