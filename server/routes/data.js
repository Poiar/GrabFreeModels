const express = require('express');
const pool = require('../db');
const loadModels = require('../../scripts/load-models');

const router = express.Router();

const CACHE_TTL = 60_000; // 60s — limits staleness while caching aggressive repeat visits
let dataCache = null; // { data, ts }
let inflightLoad = null;

const VALID_FIELDS = [
  'creators',
  'providers',
  '_test_summary',
  '_role_rankings',
  '_model_scores',
  '_provider_usage',
  '_known_issues',
  '_validation_method',
  '_failure_rates',
  '_failover_suggestions',
  '_key_health',
  'provider_health',
];

router.get('/data', async (req, res) => {
  try {
    if (req.query.fields) {
      const requested = req.query.fields.split(',').map((f) => f.trim()).filter(Boolean);
      const selected = [];
      for (const reqField of requested) {
        const match = VALID_FIELDS.find((vf) => vf.toLowerCase() === reqField.toLowerCase());
        if (!match) {
          return res.status(400).json({
            error: `Invalid field: ${reqField}`,
            valid_fields: VALID_FIELDS,
          });
        }
        selected.push(match);
      }

      const result = await loadModels(pool);
      const filtered = {};
      for (const field of selected) {
        filtered[field] = result[field];
      }
      return res.json(filtered);
    }

    const now = Date.now();
    if (dataCache && (now - dataCache.ts) < CACHE_TTL) {
      res.set('Cache-Control', 'no-cache');
      return res.json(dataCache.data);
    }

    if (!inflightLoad) {
      inflightLoad = loadModels(pool).finally(() => { inflightLoad = null; });
    }
    const result = await inflightLoad;
    dataCache = { data: result, ts: Date.now() };

    res.set('Cache-Control', 'no-cache');
    res.json(result);
  } catch (err) {
    console.error('Failed to build ModelsData:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Paid data endpoint ──
let paidDataCache = null; // { data, ts }

router.get('/data/paid', async (req, res) => {
  try {
    const now = Date.now();
    if (paidDataCache && (now - paidDataCache.ts) < CACHE_TTL) {
      res.set('Cache-Control', 'no-cache');
      return res.json(paidDataCache.data);
    }

    const result = await loadModels(pool, { isFree: false });
    paidDataCache = { data: result, ts: Date.now() };

    res.set('Cache-Control', 'no-cache');
    res.json(result);
  } catch (err) {
    console.error('Failed to build paid ModelsData:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sources — return all registered data sources
router.get('/sources', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.slug, s.name, s.source_type
      FROM sources s
      ORDER BY s.source_type, s.name
    `);
    res.json(rows);
  } catch (err) {
    console.error('Failed to load sources:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT now()');
    res.json({ status: 'ok', db: rows[0].now, time: new Date().toISOString() });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res
      .status(503)
      .json({ status: 'error', db: 'Database unavailable', time: new Date().toISOString() });
  }
});

router.get('/health/status', async (req, res) => {
  try {
    // Fetch test summary
    const { rows: summaryRows } = await pool.query(
      "SELECT value::text FROM metadata WHERE key = '_test_summary'",
    );
    const testSummary = summaryRows.length > 0 ? JSON.parse(summaryRows[0].value) : null;

    // Fetch per-provider counts
    const { rows: providerRows } = await pool.query(`
      SELECT dp.name AS provider,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE dm.status_result = 'working') AS working,
             COUNT(*) FILTER (WHERE dm.status_result = 'rate_limited') AS rate_limited,
             COUNT(*) FILTER (WHERE dm.status_result = 'broken') AS broken,
             COUNT(*) FILTER (WHERE dm.status_result = 'untested') AS untested,
             COUNT(*) FILTER (WHERE dm.status_result = 'not_found') AS not_found,
             MAX(dm.status_tested) AS last_tested
      FROM datapoint_models dm
      JOIN datapoint_providers dp ON dm.datapoint_provider_id = dp.id
      WHERE dm.is_free = true AND dm.is_removed = false
      GROUP BY dp.name
      ORDER BY dp.name
    `);

    const providers = providerRows.map((r) => {
        const total = parseInt(r.total, 10);
      const working = parseInt(r.working, 10);
      const rateLimited = parseInt(r.rate_limited, 10);
      const broken = parseInt(r.broken, 10);
      const passRate = total > 0 ? Math.round((working / total) * 100) : 0;
let status = 'unknown';
if (total !== 0) {
  if (passRate >= 80) status = 'up';
  else if (passRate >= 50) status = 'degraded';
  else status = 'down';
}

      return {
        name: r.provider,
        status,
        total,
        working,
        rate_limited: rateLimited,
        broken,
        untested: parseInt(r.untested, 10),
        not_found: parseInt(r.not_found, 10),
        pass_rate: passRate,
        last_tested: r.last_tested,
      };
    });

    const totalWorking = providers.reduce((n, p) => n + p.working, 0);
    const totalFree = providers.reduce((n, p) => n + p.total, 0);

    res.json({
      overall: {
        status: totalFree > 0 && Math.round((totalWorking / totalFree) * 100) >= 50 ? 'healthy' : 'degraded',
        total_free: totalFree,
        total_working: totalWorking,
        overall_pass_rate: totalFree > 0 ? Math.round((totalWorking / totalFree) * 100) : 0,
        last_validation: testSummary ? testSummary.date : null,
      },
      providers,
    });
  } catch (err) {
    console.error('Health status failed:', err.message);
    res.status(500).json({ error: 'Failed to build health status' });
  }
});

module.exports = router;
