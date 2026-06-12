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
  'organizations',
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
      const requested = req.query.fields
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
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
    if (dataCache && now - dataCache.ts < CACHE_TTL) {
      res.set('Cache-Control', 'no-cache');
      return res.json(paginateResult(dataCache.data, req.query));
    }

    if (!inflightLoad) {
      inflightLoad = loadModels(pool).finally(() => {
        inflightLoad = null;
      });
    }
    const result = await inflightLoad;
    dataCache = { data: result, ts: Date.now() };

    res.set('Cache-Control', 'no-cache');
    res.json(paginateResult(result, req.query));
  } catch (err) {
    console.error('Failed to build ModelsData:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Pagination helper ──
// Slices the models and creators arrays from a ModelsData result.
// Appends a _pagination metadata block with offset, limit, total.
function paginateResult(data, query) {
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const limit =
    query.limit !== undefined ? Math.min(500, Math.max(1, parseInt(query.limit, 10) || 50)) : null;

  if (limit === null) return data;

  const total = data.models.length;
  const paginated = { ...data };
  paginated.models = data.models.slice(offset, offset + limit);
  paginated.creators = data.creators
    .map((creator) => ({
      ...creator,
      models: creator.models.filter((model) => {
        // Keep creators whose models are in the paginated slice
        return paginated.models.some((m) => m.super_id === model.super_id);
      }),
    }))
    .filter((creator) => creator.models.length > 0);
  paginated._pagination = { offset, limit, total };
  return paginated;
}

// ── Paid data endpoint ──
let paidDataCache = null; // { data, ts }

router.get('/data/paid', async (req, res) => {
  try {
    const now = Date.now();
    if (paidDataCache && now - paidDataCache.ts < CACHE_TTL) {
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
        status:
          totalFree > 0 && Math.round((totalWorking / totalFree) * 100) >= 50
            ? 'healthy'
            : 'degraded',
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

// ── Slim rankings helper ──
// Extracts only rankings + scores + a compact model index from the full ModelsData.
// Reduces payload from ~7MB to ~200-300KB for network transfer.
function slimRankings(full) {
  const r = full._role_rankings || {};
  const modelIndex = {};

  for (const creator of full.creators || []) {
    for (const model of creator.models) {
      const providerSlugs = model.providers
        .filter((p) => !p._removed)
        .map((p) => p.provider_slug)
        .sort();
      for (const dp of model.providers) {
        modelIndex[dp.full_id] = {
          name: model.name,
          slug: model.slug,
          creator: creator.name,
          providerSlug: dp.provider_slug,
          providerName: dp.provider,
          providerSlugs,
          super_id: model.super_id,
        };
      }
    }
  }

  return {
    _role_rankings: r,
    _model_scores: full._model_scores || null,
    _model_index: modelIndex,
  };
}

// ── Rankings-only endpoint (free) ──
let rankingsCache = null;
let inflightRankingsLoad = null;

router.get('/rankings', async (req, res) => {
  try {
    const now = Date.now();
    if (rankingsCache && now - rankingsCache.ts < CACHE_TTL) {
      res.set('Cache-Control', 'no-cache');
      return res.json(rankingsCache.data);
    }

    if (!inflightRankingsLoad) {
      inflightRankingsLoad = (async () => {
        const full = await loadModels(pool);
        return slimRankings(full);
      })().finally(() => {
        inflightRankingsLoad = null;
      });
    }
    const result = await inflightRankingsLoad;
    rankingsCache = { data: result, ts: Date.now() };

    res.set('Cache-Control', 'no-cache');
    res.json(result);
  } catch (err) {
    console.error('Failed to build rankings data:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Rankings-only endpoint (paid) ──
let paidRankingsCache = null;

router.get('/rankings/paid', async (req, res) => {
  try {
    const now = Date.now();
    if (paidRankingsCache && now - paidRankingsCache.ts < CACHE_TTL) {
      res.set('Cache-Control', 'no-cache');
      return res.json(paidRankingsCache.data);
    }

    const full = await loadModels(pool, { isFree: false });
    const result = slimRankings(full);
    paidRankingsCache = { data: result, ts: Date.now() };

    res.set('Cache-Control', 'no-cache');
    res.json(result);
  } catch (err) {
    console.error('Failed to build paid rankings data:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Cache invalidation ──
// Called by the nightly pipeline after DB writes to ensure the API
// serves fresh data without waiting for the 60s TTL to expire.
function invalidateCache() {
  dataCache = null;
  paidDataCache = null;
  rankingsCache = null;
  paidRankingsCache = null;
}

router.post('/cache/invalidate', (req, res) => {
  invalidateCache();
  res.json({ message: 'Cache invalidated', at: new Date().toISOString() });
});

module.exports = router;
module.exports.invalidateCache = invalidateCache;
