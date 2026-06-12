#!/usr/bin/env node
/**
 * historical-trends.js
 * Queries test_observations for daily statistics over N days.
 * Outputs ASCII console charts or JSON for machine consumption.
 *
 * Usage:
 *   node scripts/historical-trends.js                # default: 90 days, console chart
 *   node scripts/historical-trends.js --days 30      # last 30 days
 *   node scripts/historical-trends.js --json         # JSON output
 *   node scripts/historical-trends.js --provider openrouter  # single provider
 *   node scripts/historical-trends.js --days 30 --json --provider groq  # combined
 */

require('dotenv').config();
const pool = require('../server/db');

const args = process.argv.slice(2);
const DAYS = (() => {
  const idx = args.indexOf('--days');
  return idx !== -1 ? parseInt(args[idx + 1], 10) : 90;
})();
const SINGLE_PROVIDER = (() => {
  const idx = args.indexOf('--provider');
  return idx !== -1 ? args[idx + 1] : null;
})();
const JSON_OUTPUT = args.includes('--json');

async function main() {
  // Validate table exists
  try {
    await pool.query('SELECT 1 FROM test_observations LIMIT 1');
  } catch {
    if (JSON_OUTPUT) {
      process.stdout.write(
        JSON.stringify({
          error: 'test_observations table does not exist. Run migration 003 first.',
          days: DAYS,
          generated_at: new Date().toISOString(),
        }) + '\n',
      );
    } else {
      console.error('test_observations table does not exist. Run migration 003 first.');
    }
    await pool.end();
    return;
  }

  const conditions = ["tested_at >= now() - interval '1 day' * $1"];
  const params = [DAYS];

  if (SINGLE_PROVIDER) {
    conditions.push('provider = $' + (params.length + 1));
    params.push(SINGLE_PROVIDER);
  }

  const whereClause = conditions.join(' AND ');

  // Daily: working model count, pass rate, and latency percentiles
  const { rows: dailyRows } = await pool.query(
    `
    SELECT
      tested_at::date AS day,
      COUNT(*) AS total_samples,
      COUNT(*) FILTER (WHERE status = 'pass') AS passed,
      COUNT(*) FILTER (WHERE status = 'fail') AS failed,
      COUNT(DISTINCT full_id) AS unique_models,
      COUNT(DISTINCT full_id) FILTER (WHERE status = 'pass') AS working_models,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'pass') * 100.0 / NULLIF(COUNT(*), 0), 1
      ) AS pass_rate_pct,
      ROUND((percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms))::numeric, 1) AS p50_ms,
      ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::numeric, 1) AS p95_ms
    FROM test_observations
    WHERE ${whereClause}
    GROUP BY tested_at::date
    ORDER BY day
  `,
    params,
  );

  // Daily per-provider health
  const { rows: providerDailyRows } = await pool.query(
    `
    SELECT
      tested_at::date AS day,
      provider,
      COUNT(*) AS total_samples,
      COUNT(*) FILTER (WHERE status = 'pass') AS passed,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'pass') * 100.0 / NULLIF(COUNT(*), 0), 1
      ) AS pass_rate_pct,
      COUNT(DISTINCT full_id) AS unique_models,
      COUNT(DISTINCT full_id) FILTER (WHERE status = 'pass') AS working_models
    FROM test_observations
    WHERE ${whereClause}
    GROUP BY tested_at::date, provider
    ORDER BY day, provider
  `,
    params,
  );

  if (dailyRows.length === 0 && providerDailyRows.length === 0) {
    if (JSON_OUTPUT) {
      process.stdout.write(
        JSON.stringify({
          description: `Historical trends over the last ${DAYS} days`,
          days: DAYS,
          generated_at: new Date().toISOString(),
          provider: SINGLE_PROVIDER,
          daily: [],
          provider_daily: [],
          note: 'No observations found for the given criteria.',
        }) + '\n',
      );
    } else {
      console.log(`\nNo observations found for the last ${DAYS} days.`);
    }
    await pool.end();
    return;
  }

  // Build provider daily map: day -> { provider -> stats }
  const providerByDay = {};
  for (const r of providerDailyRows) {
    if (!providerByDay[r.day]) providerByDay[r.day] = {};
    providerByDay[r.day][r.provider] = {
      total_samples: parseInt(r.total_samples, 10),
      passed: parseInt(r.passed, 10),
      pass_rate_pct: r.pass_rate_pct !== null ? Number(r.pass_rate_pct) : null,
      unique_models: parseInt(r.unique_models, 10),
      working_models: parseInt(r.working_models, 10),
    };
  }

  const daily = dailyRows.map((r) => {
    const dayStr = r.day.toISOString
      ? r.day.toISOString().slice(0, 10)
      : String(r.day).slice(0, 10);
    return {
      day: dayStr,
      total_samples: parseInt(r.total_samples, 10),
      passed: parseInt(r.passed, 10),
      failed: parseInt(r.failed, 10),
      pass_rate_pct: r.pass_rate_pct !== null ? Number(r.pass_rate_pct) : null,
      unique_models: parseInt(r.unique_models, 10),
      working_models: parseInt(r.working_models, 10),
      p50_ms: r.p50_ms !== null ? Number(r.p50_ms) : null,
      p95_ms: r.p95_ms !== null ? Number(r.p95_ms) : null,
      providers: providerByDay[dayStr] || {},
    };
  });

  // Aggregate overall stats
  const { rows: aggRows } = await pool.query(
    `
    SELECT
      COUNT(DISTINCT full_id) AS total_unique_models,
      COUNT(DISTINCT full_id) FILTER (WHERE status = 'pass') AS total_working_unique,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'pass') * 100.0 / NULLIF(COUNT(*), 0), 1
      ) AS overall_pass_rate_pct,
      ROUND(AVG(latency_ms)::numeric, 1) AS avg_latency_ms,
      COUNT(DISTINCT provider) AS provider_count
    FROM test_observations
    WHERE ${whereClause}
  `,
    params,
  );

  const output = {
    description: `Historical trends over the last ${DAYS} days`,
    days: DAYS,
    generated_at: new Date().toISOString(),
    provider: SINGLE_PROVIDER,
    daily,
    aggregate: {
      total_unique_models: parseInt(aggRows[0]?.total_unique_models || 0, 10),
      total_working_unique: parseInt(aggRows[0]?.total_working_unique || 0, 10),
      overall_pass_rate_pct:
        aggRows[0]?.overall_pass_rate_pct !== null
          ? Number(aggRows[0].overall_pass_rate_pct)
          : null,
      avg_latency_ms:
        aggRows[0]?.avg_latency_ms !== null ? Number(aggRows[0].avg_latency_ms) : null,
      provider_count: parseInt(aggRows[0]?.provider_count || 0, 10),
    },
  };

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } else {
    printCharts(output);
  }

  await pool.end();
}

// ── ASCII chart rendering ──

const BAR_CHARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function bar(value, max, width) {
  if (max === 0) return ''.padEnd(width, ' ');
  const fullBars = (value / max) * width;
  const result = [];
  for (let i = 0; i < width; i++) {
    const coverage = Math.min(Math.max(fullBars - i, 0), 1);
    const idx = Math.round(coverage * (BAR_CHARS.length - 1));
    result.push(BAR_CHARS[idx]);
  }
  return result.join('');
}

function printCharts(output) {
  const { daily, aggregate } = output;
  const days = daily.length;
  if (days === 0) {
    console.log('\nNo data available for the given period.');
    return;
  }

  const CHART_WIDTH = Math.min(days, 60);
  const skipEvery = Math.max(1, Math.floor(days / CHART_WIDTH));
  // Sample evenly across the period
  const sampled = [];
  for (let i = 0; i < days; i += skipEvery) {
    sampled.push(daily[i]);
  }
  // Always include the last day
  if (sampled[sampled.length - 1] !== daily[daily.length - 1]) {
    sampled.push(daily[daily.length - 1]);
  }

  const maxWorking = Math.max(...sampled.map((d) => d.working_models), 1);
  const maxP50 = Math.max(...sampled.map((d) => d.p50_ms || 0), 1);
  const maxP95 = Math.max(...sampled.map((d) => d.p95_ms || 0), 1);
  const maxRate = 100;

  const header = SINGLE_PROVIDER ? ` provider: ${SINGLE_PROVIDER}` : ' all providers';
  console.log(`\n─── Historical Trends (last ${output.days} days,${header}) ───`);
  console.log(
    `Aggregate: ${aggregate.total_working_unique}/${aggregate.total_unique_models} models working, ` +
      `${aggregate.overall_pass_rate_pct}% pass rate, ${aggregate.avg_latency_ms}ms avg latency`,
  );

  // Working models bar chart
  console.log(`\nWorking Models (per day, max=${maxWorking}):`);
  for (const d of sampled) {
    const label = d.day.slice(5); // MM-DD
    const chart = bar(d.working_models, maxWorking, CHART_WIDTH);
    console.log(`  ${label} ${chart} ${d.working_models}`);
  }

  // p50 latency sparkline
  console.log(`\nP50 Latency (per day, max=${maxP50}ms):`);
  for (const d of sampled) {
    const label = d.day.slice(5);
    const chart = bar(d.p50_ms || 0, maxP50, CHART_WIDTH);
    const val = d.p50_ms !== null ? d.p50_ms + 'ms' : 'N/A';
    console.log(`  ${label} ${chart} ${val}`);
  }

  // p95 latency sparkline
  console.log(`\nP95 Latency (per day, max=${maxP95}ms):`);
  for (const d of sampled) {
    const label = d.day.slice(5);
    const chart = bar(d.p95_ms || 0, maxP95, CHART_WIDTH);
    const val = d.p95_ms !== null ? d.p95_ms + 'ms' : 'N/A';
    console.log(`  ${label} ${chart} ${val}`);
  }

  // Pass rate sparkline
  console.log(`\nPass Rate (per day):`);
  for (const d of sampled) {
    const label = d.day.slice(5);
    const chart = bar(d.pass_rate_pct || 0, maxRate, CHART_WIDTH);
    const val = d.pass_rate_pct !== null ? d.pass_rate_pct + '%' : 'N/A';
    console.log(`  ${label} ${chart} ${val}`);
  }

  // Provider health table (per-provider pass rates)
  // Collect unique providers across all days
  const allProviders = new Set();
  for (const d of daily) {
    for (const prov of Object.keys(d.providers)) {
      allProviders.add(prov);
    }
  }
  const sortedProviders = [...allProviders].sort();

  if (sortedProviders.length > 0 && !SINGLE_PROVIDER) {
    console.log('\nProvider Health (working/total per day):');
    const provHeader = `  ${'Day'.padEnd(8)} ` + sortedProviders.map((p) => p.padEnd(14)).join('');
    console.log(provHeader);
    for (const d of daily) {
      const dayStr = d.day.slice(5); // MM-DD
      const parts = [dayStr.padEnd(8)];
      for (const prov of sortedProviders) {
        const p = d.providers[prov];
        if (p) {
          parts.push(`${p.working_models}/${p.unique_models}`.padEnd(14));
        } else {
          parts.push(''.padEnd(14));
        }
      }
      console.log('  ' + parts.join(' '));
    }
  }

  // Legend
  console.log(`\n  Chart: ${BAR_CHARS[0]} = 0%  ${BAR_CHARS[BAR_CHARS.length - 1]} = 100%`);
  console.log(`  ${days} days shown, sampling ${sampled.length} points\n`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
