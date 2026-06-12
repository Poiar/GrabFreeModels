#!/usr/bin/env node
/**
 * check-degradation-alerts.js
 * Compares current test results against 7-day baseline, flags significant degradation.
 *
 * Usage:
 *   node scripts/check-degradation-alerts.js           # report mode
 *   node scripts/check-degradation-alerts.js --apply   # write alerts to metadata table
 */

require('dotenv').config();
const pool = require('../server/db');
const APPLY = process.argv.includes('--apply');

async function checkDegradation() {
  const client = await pool.connect();
  try {
    // Get current test summary
    const { rows: curRows } = await client.query(
      "SELECT value FROM metadata WHERE key = '_test_summary'",
    );
    const current = curRows.length > 0 ? JSON.parse(curRows[0].value) : null;
    if (!current) {
      console.log('No current test summary found');
      return;
    }

    // Get previous test summary
    const { rows: prevRows } = await client.query(
      "SELECT value FROM metadata WHERE key = '_test_summary_previous'",
    );
    const previous = prevRows.length > 0 ? JSON.parse(prevRows[0].value) : null;

    // Get 7-day per-provider failure rates from test_observations
    let prov7d = {};
    try {
      const { rows: fr } = await client.query(`
        SELECT dp.slug, COUNT(*) as total,
               COUNT(*) FILTER (WHERE to2.status = 'fail') as failures,
               ROUND(COUNT(*) FILTER (WHERE to2.status = 'fail') * 100.0 / COUNT(*), 1) as rate
        FROM test_observations to2
        JOIN datapoint_models dm ON dm.full_id = to2.full_id
        JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
        WHERE to2.tested_at >= now() - interval '7 days'
        GROUP BY dp.slug
      `);
      for (const r of fr)
        prov7d[r.slug] = {
          total: parseInt(r.total),
          failures: parseInt(r.failures),
          rate: parseFloat(r.rate),
        };
    } catch {
      console.log('test_observations table not available for degradation check');
    }

    // Get per-provider p95 latency from test_observations (past 7d vs prior 7d)
    // Replaced model_health_snapshots with test_observations (migration 041).
    let latencyAlerts = [];
    try {
      const { rows: lm } = await client.query(`
        WITH recent AS (
          SELECT dp.slug,
                 percentile_cont(0.95) WITHIN GROUP (ORDER BY tob.latency_ms) as p95
          FROM test_observations tob
          JOIN datapoint_models dm ON dm.full_id = tob.full_id
          JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
          WHERE tob.tested_at >= now() - interval '7 days'
            AND tob.latency_ms IS NOT NULL AND tob.status = 'pass'
          GROUP BY dp.slug
        ),
        prior AS (
          SELECT dp.slug,
                 percentile_cont(0.95) WITHIN GROUP (ORDER BY tob.latency_ms) as p95
          FROM test_observations tob
          JOIN datapoint_models dm ON dm.full_id = tob.full_id
          JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
          WHERE tob.tested_at BETWEEN now() - interval '14 days' AND now() - interval '7 days'
            AND tob.latency_ms IS NOT NULL AND tob.status = 'pass'
          GROUP BY dp.slug
        )
        SELECT COALESCE(r.slug, p.slug) as slug, r.p95 as recent_p95, p.p95 as prior_p95
        FROM recent r FULL OUTER JOIN prior p ON r.slug = p.slug
        WHERE r.p95 IS NOT NULL AND p.p95 IS NOT NULL
      `);
      for (const r of lm) {
        if (r.prior_p95 > 0 && r.recent_p95 > r.prior_p95 * 1.5) {
          latencyAlerts.push({
            provider: r.slug,
            recent_p95: Math.round(r.recent_p95),
            prior_p95: Math.round(r.prior_p95),
          });
        }
      }
    } catch {
      /* test_observations table may not be available */
    }

    // Build alert report
    const alerts = [];

    // 1. Provider failure rate jump >15%
    for (const [slug, stats] of Object.entries(prov7d)) {
      if (stats.rate > 15) {
        alerts.push({
          type: 'high_failure_rate',
          provider: slug,
          severity: stats.rate > 30 ? 'critical' : 'high',
          detail: `${stats.rate}% failure rate (${stats.failures}/${stats.total}) over past 7d`,
        });
      }
    }

    // 2. Volume change: newly broken count
    if (previous?.results) {
      const prevBroken = new Set(previous.results.broken || []);
      const prevNotFound = new Set(previous.results.not_found || []);
      const curBroken = new Set(current.results.broken || []);
      const curNotFound = new Set(current.results.not_found || []);
      const newBroken = [...curBroken].filter((id) => !prevBroken.has(id)).length;
      const newNotFound = [...curNotFound].filter((id) => !prevNotFound.has(id)).length;
      if (newBroken + newNotFound > 10) {
        alerts.push({
          type: 'volume_spike',
          provider: null,
          severity: 'high',
          detail: `${newBroken} newly broken + ${newNotFound} newly not_found since last validation`,
        });
      }
    }

    // 3. Latency degradation
    for (const la of latencyAlerts) {
      alerts.push({
        type: 'latency_degradation',
        provider: la.provider,
        severity: 'high',
        detail: `P95 latency doubled: ${la.prior_p95}ms → ${la.recent_p95}ms`,
      });
    }

    console.log(`\nDegradation Alerts: ${alerts.length} found\n`);
    for (const a of alerts) {
      console.log(
        `  [${a.severity.toUpperCase()}] ${a.type}${a.provider ? ' on ' + a.provider : ''}: ${a.detail}`,
      );
    }

    if (APPLY && alerts.length > 0) {
      const alertPayload = {
        description: 'Degradation alerts from nightly check',
        checked_at: new Date().toISOString(),
        alerts,
      };
      const val = JSON.stringify(alertPayload);
      await client.query(
        `INSERT INTO metadata (key, value) VALUES ('_degradation_alerts', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [val],
      );
      console.log('\nAlerts written to metadata._degradation_alerts');
    } else if (alerts.length === 0) {
      console.log('No degradation detected.');
    }

    return alerts;
  } finally {
    client.release();
    await pool.end();
  }
}

checkDegradation().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
