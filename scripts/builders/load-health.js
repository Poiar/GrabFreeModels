/**
 * load-health.js — Derives model health and failure rate data from test_observations.
 *
 * Returns { modelHealth, failureRates }:
 *   - modelHealth: Record<full_id, { snapshots, stability, last_working, streak }>
 *   - failureRates: { description, models: Record<full_id, PerModelRates> }
 */

async function loadHealth(client, isFree) {
  // ── Model health from test_observations (per-run aggregation) ──
  let modelHealth = {};

  try {
    const { rows: runRows } = await client.query(
      `
      WITH inference_models AS (
        SELECT dm.full_id
        FROM datapoint_models dm
        JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
        WHERE dm.is_free = $1 AND dm.is_removed = false
          AND (dp.is_health_trackable = true OR dp.is_health_trackable IS NULL)
      ),
      per_run AS (
        SELECT
          tob.full_id,
          tob.tested_at::date AS tested_date,
          COUNT(*) AS total_requests,
          COUNT(*) FILTER (WHERE tob.status = 'pass') AS passed_requests,
          ROUND(AVG(tob.latency_ms) FILTER (WHERE tob.latency_ms IS NOT NULL), 2) AS avg_latency_ms,
          string_agg(DISTINCT tob.error_type, ', ' ORDER BY tob.error_type)
            FILTER (WHERE tob.error_type IS NOT NULL) AS errors,
          bool_and(tob.status = 'pass') AS all_passed
        FROM test_observations tob
        JOIN inference_models im ON im.full_id = tob.full_id
        WHERE tob.tested_at >= now() - interval '30 days'
        GROUP BY tob.full_id, tob.tested_at::date
        ORDER BY tob.full_id, tested_date DESC
      )
      SELECT * FROM per_run
    `,
      [isFree],
    );

    // Group by full_id
    const healthMap = new Map();
    for (const r of runRows) {
      if (!healthMap.has(r.full_id)) healthMap.set(r.full_id, []);
      healthMap.get(r.full_id).push(r);
    }

    for (const [fullId, runs] of healthMap) {
      const limited = runs.slice(0, 20);
      const total = limited.length;
      const working = limited.filter((r) => r.all_passed).length;
      const stability = total > 0 ? Math.round((working / total) * 100) : 0;

      const lastWorking = limited.find((r) => r.all_passed);
      const lastWorkingDate = lastWorking
        ? new Date(lastWorking.tested_date).toISOString().slice(0, 10)
        : null;

      let streak = 0;
      for (const r of limited) {
        if (r.all_passed) streak++;
        else break;
      }

      modelHealth[fullId] = {
        snapshots: limited.map((r) => ({
          date: new Date(r.tested_date).toISOString().slice(0, 10),
          status: r.all_passed ? 'working' : 'broken',
          detail: r.errors || '',
          latency_ms: r.avg_latency_ms !== null ? Number(r.avg_latency_ms) : null,
        })),
        stability,
        last_working: lastWorkingDate,
        streak,
      };
    }
  } catch {
    modelHealth = { _note: 'test_observations table not available' };
  }

  // ── Per-model failure rates from test_observations (7d and 30d) ──
  let failureRates = { description: 'Per-model failure rates from test_observations', models: {} };

  try {
    const { rows: frRows } = await client.query(`
      SELECT
        full_id,
        ROUND(COUNT(*) FILTER (WHERE status = 'fail') * 100.0 / NULLIF(COUNT(*), 0), 1) AS failure_rate_7d,
        COUNT(*) AS samples_7d,
        COUNT(*) FILTER (WHERE status = 'fail') AS failures_7d
      FROM test_observations
      WHERE tested_at >= now() - interval '7 days'
      GROUP BY full_id
    `);
    const { rows: frRows30d } = await client.query(`
      SELECT
        full_id,
        ROUND(COUNT(*) FILTER (WHERE status = 'fail') * 100.0 / NULLIF(COUNT(*), 0), 1) AS failure_rate_30d,
        COUNT(*) AS samples_30d,
        COUNT(*) FILTER (WHERE status = 'fail') AS failures_30d
      FROM test_observations
      WHERE tested_at >= now() - interval '30 days'
      GROUP BY full_id
    `);

    const frMap7d = {};
    for (const r of frRows) frMap7d[r.full_id] = r;
    const frMap30d = {};
    for (const r of frRows30d) frMap30d[r.full_id] = r;

    failureRates.models = {};
    // Note: outputModels is not available here; caller populates the models key
  } catch {
    failureRates.note = 'test_observations table not available';
  }

  return { modelHealth, failureRates };
}

module.exports = loadHealth;
