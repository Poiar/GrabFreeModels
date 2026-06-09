#!/usr/bin/env node
/**
 * compute-latency-percentiles.js
 * Queries test_observations and computes p50/p95/p99 latency per model per day.
 * Outputs a JSON summary for the dashboard.
 *
 * Usage:
 *   node scripts/compute-latency-percentiles.js               # default: 30 days
 *   node scripts/compute-latency-percentiles.js --days 7      # last 7 days
 *   node scripts/compute-latency-percentiles.js --model openrouter/meta-llama/llama-4  # single model
 *   node scripts/compute-latency-percentiles.js --json        # JSON output (machine-readable)
 */

require('dotenv').config();
const pool = require('../server/db');

const args = process.argv.slice(2);
const DAYS = (() => {
  const idx = args.indexOf('--days');
  return idx !== -1 ? parseInt(args[idx + 1], 10) : 30;
})();
const SINGLE_MODEL = (() => {
  const idx = args.indexOf('--model');
  return idx !== -1 ? args[idx + 1] : null;
})();
const JSON_OUTPUT = args.includes('--json');

async function main() {
  // Validate table exists
  try {
    await pool.query('SELECT 1 FROM test_observations LIMIT 1');
  } catch {
    console.error('test_observations table does not exist. Run migration 003 first.');
    process.exit(1);
  }

  const conditions = ['tested_at >= now() - interval \'1 day\' * $1'];
  const params = [DAYS];

  if (SINGLE_MODEL) {
    conditions.push('full_id = $' + (params.length + 1));
    params.push(SINGLE_MODEL);
  }

  const whereClause = conditions.join(' AND ');

  // Per-model daily percentile query using PostgreSQL percentile_cont
  const { rows } = await pool.query(`
    SELECT
      full_id,
      provider,
      tested_at::date AS day,
      COUNT(*) AS total_samples,
      COUNT(*) FILTER (WHERE status = 'pass') AS passed,
      COUNT(*) FILTER (WHERE status = 'fail') AS failed,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'fail') * 100.0 / NULLIF(COUNT(*), 0), 1
      ) AS failure_rate_pct,
      ROUND((percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms))::numeric, 1) AS p50_ms,
      ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::numeric, 1) AS p95_ms,
      ROUND((percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms))::numeric, 1) AS p99_ms
    FROM test_observations
    WHERE ${whereClause}
    GROUP BY full_id, provider, tested_at::date
    ORDER BY full_id, day
  `, params);

  if (rows.length === 0) {
    console.log('No observations found for the given criteria.');
    await pool.end();
    return;
  }

  // Summarize per-model across the full period
  const modelSummary = {};
  for (const r of rows) {
    if (!modelSummary[r.full_id]) {
      modelSummary[r.full_id] = {
        full_id: r.full_id,
        provider: r.provider,
        day_count: 0,
        total_samples: 0,
        total_passed: 0,
        total_failed: 0,
        daily_entries: [],
      };
    }
    const m = modelSummary[r.full_id];
    m.day_count++;
    m.total_samples += parseInt(r.total_samples, 10);
    m.total_passed += parseInt(r.passed, 10);
    m.total_failed += parseInt(r.failed, 10);
    m.daily_entries.push({
      day: r.day,
      samples: parseInt(r.total_samples, 10),
      passed: parseInt(r.passed, 10),
      failed: parseInt(r.failed, 10),
      failure_rate_pct: r.failure_rate_pct !== null ? Number(r.failure_rate_pct) : null,
      p50_ms: r.p50_ms !== null ? Number(r.p50_ms) : null,
      p95_ms: r.p95_ms !== null ? Number(r.p95_ms) : null,
      p99_ms: r.p99_ms !== null ? Number(r.p99_ms) : null,
    });
  }

  // Compute aggregate percentiles across all observations in the period
  const { rows: aggRows } = await pool.query(`
    SELECT
      full_id,
      provider,
      ROUND((percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms))::numeric, 1) AS agg_p50_ms,
      ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::numeric, 1) AS agg_p95_ms,
      ROUND((percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms))::numeric, 1) AS agg_p99_ms,
      ROUND(AVG(latency_ms)::numeric, 1) AS avg_latency_ms,
      COUNT(*) AS agg_samples,
      COUNT(*) FILTER (WHERE status = 'fail') AS agg_failed,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'fail') * 100.0 / NULLIF(COUNT(*), 0), 1
      ) AS agg_failure_rate_pct
    FROM test_observations
    WHERE tested_at >= now() - interval '1 day' * $1
      AND latency_ms IS NOT NULL
    GROUP BY full_id, provider
    ORDER BY full_id
  `, [DAYS]);

  for (const a of aggRows) {
    if (modelSummary[a.full_id]) {
      modelSummary[a.full_id].aggregate = {
        p50_ms: a.agg_p50_ms !== null ? Number(a.agg_p50_ms) : null,
        p95_ms: a.agg_p95_ms !== null ? Number(a.agg_p95_ms) : null,
        p99_ms: a.agg_p99_ms !== null ? Number(a.agg_p99_ms) : null,
        avg_latency_ms: a.avg_latency_ms !== null ? Number(a.avg_latency_ms) : null,
        samples: parseInt(a.agg_samples, 10),
        failed: parseInt(a.agg_failed, 10),
        failure_rate_pct: a.agg_failure_rate_pct !== null ? Number(a.agg_failure_rate_pct) : null,
      };
    }
  }

  const output = {
    description: `Latency percentiles over the last ${DAYS} days`,
    days: DAYS,
    generated_at: new Date().toISOString(),
    models: Object.values(modelSummary).sort((a, b) => a.full_id.localeCompare(b.full_id)),
  };

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } else {
    // Human-readable table
    console.log(`\n─── Latency Percentiles (last ${DAYS} days) ───`);
    console.log(`  ${'Model'.padEnd(44)} ${'Provider'.padEnd(14)} ${'Days'.padEnd(5)} ${'Samples'.padEnd(8)} ${'Fail%'.padEnd(7)} ${'p50'.padEnd(8)} ${'p95'.padEnd(8)} ${'p99'.padEnd(8)}`);
    console.log('  ' + '─'.repeat(110));
    for (const m of output.models) {
      const agg = m.aggregate || {};
      const failurePct = agg.failure_rate_pct !== null ? agg.failure_rate_pct + '%' : 'N/A';
      const p50 = agg.p50_ms !== null ? agg.p50_ms + 'ms' : 'N/A';
      const p95 = agg.p95_ms !== null ? agg.p95_ms + 'ms' : 'N/A';
      const p99 = agg.p99_ms !== null ? agg.p99_ms + 'ms' : 'N/A';
      console.log(
        `  ${m.full_id.padEnd(44)} ${m.provider.padEnd(14)} ${String(m.day_count).padEnd(5)} ${String(m.total_samples).padEnd(8)} ${failurePct.padEnd(7)} ${p50.padEnd(8)} ${p95.padEnd(8)} ${p99.padEnd(8)}`,
      );
    }
    console.log('  ' + '─'.repeat(110));
    console.log(`  ${output.models.length} models over ${DAYS} days`);
    console.log('──────────────────────────\n');
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
