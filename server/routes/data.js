const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/data — full ModelsData structure reconstructed from DB
router.get('/data', async (req, res) => {
  try {
    const result = await buildModelsData();
    res.json(result);
  } catch (err) {
    console.error('Failed to build ModelsData:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health — simple health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

async function buildModelsData() {
  const { rows: providers } = await pool.query('SELECT * FROM providers ORDER BY name');
  const { rows: authors } = await pool.query('SELECT * FROM authors ORDER BY name');
  const { rows: metadataRows } = await pool.query('SELECT key, value::text FROM metadata ORDER BY key');

  const meta = {};
  for (const r of metadataRows) {
    try { meta[r.key] = JSON.parse(r.value); }
    catch { meta[r.key] = r.value; }
  }

  // ── Curated models ──
  const { rows: models } = await pool.query(`
    SELECT m.*, a.name AS author_name
    FROM models m LEFT JOIN authors a ON a.id = m.author_id ORDER BY m.name
  `);
  const { rows: providerModels } = await pool.query(`
    SELECT pm.*, p.name AS provider_name, p.slug AS provider_slug
    FROM provider_models pm JOIN providers p ON p.id = pm.provider_id ORDER BY pm.full_id
  `);
  const { rows: inputTypesRows } = await pool.query(
    'SELECT model_id, input_type FROM model_input_types ORDER BY model_id, input_type'
  );
  const { rows: outputTypesRows } = await pool.query(
    'SELECT model_id, output_type FROM model_output_types ORDER BY model_id, output_type'
  );
  const { rows: featuresRows } = await pool.query(
    'SELECT model_id, feature_type, value FROM model_features ORDER BY model_id'
  );

  // ── models.dev models ──
  const { rows: modelsdev } = await pool.query('SELECT * FROM modelsdev ORDER BY name');
  const { rows: mdProviderModels } = await pool.query(`
    SELECT mpm.*, p.name AS provider_name, p.slug AS provider_slug
    FROM modelsdev_provider_models mpm JOIN providers p ON p.id = mpm.provider_id ORDER BY mpm.full_id
  `);
  const { rows: mdInputTypesRows } = await pool.query(
    'SELECT modelsdev_id, input_type FROM modelsdev_input_types ORDER BY modelsdev_id, input_type'
  );
  const { rows: mdOutputTypesRows } = await pool.query(
    'SELECT modelsdev_id, output_type FROM modelsdev_output_types ORDER BY modelsdev_id, output_type'
  );
  const { rows: mdFeaturesRows } = await pool.query(
    'SELECT modelsdev_id, feature_type, value FROM modelsdev_features ORDER BY modelsdev_id'
  );

  // Build lookup maps for curated
  const modelMap = new Map();
  for (const m of models) modelMap.set(m.id, m);
  const inputMap = groupByModel(inputTypesRows, 'input_type');
  const outputMap = groupByModel(outputTypesRows, 'output_type');
  const featMap = groupFeatures(featuresRows);

  // Build lookup maps for models.dev
  const mdModelMap = new Map();
  for (const m of modelsdev) mdModelMap.set(m.id, m);
  const mdInputMap = groupByModel(mdInputTypesRows, 'input_type');
  const mdOutputMap = groupByModel(mdOutputTypesRows, 'output_type');
  const mdFeatMap = groupFeatures(mdFeaturesRows);

  const outputModels = [];
  const workingIds = [];
  const rateLimitedIds = [];
  const brokenIds = [];
  const untestedIds = [];

  // ── Emit curated models ──
  for (const pm of providerModels) {
    const m = modelMap.get(pm.model_id);
    if (!m) continue;
    const modelId = pm.full_id;
    const mid = m.id;

    const entry = {
      id: modelId,
      name: m.name,
      provider: pm.provider_name,
      author: m.author_name || null,
      context_length: m.context_length || null,
      input_price_per_million: Number(m.input_price_per_million) || 0,
      output_price_per_million: Number(m.output_price_per_million) || 0,
      is_free: m.is_free,
      supports_tools: m.supports_tools,
      supports_reasoning: m.supports_reasoning,
      output_limit: m.output_limit || null,
      temperature: m.temperature,
      open_weights: m.open_weights,
      family: m.family || null,
      knowledge_cutoff: m.knowledge_cutoff || null,
      releaseDate: formatDate(m.release_date),
      lastUpdated: formatDate(m.last_updated),
      tags: featMap.get(mid)?.tag || [],
      best_for: featMap.get(mid)?.best_for || [],
      input_types: inputMap.get(mid) || [],
      output_types: outputMap.get(mid) || [],
      status: {
        tested: pm.status_tested || null,
        result: pm.status_result || 'untested',
        detail: pm.status_detail || null,
      },
      last_success: pm.last_success || null,
      source: pm.source || 'curated',
      _removed: pm.removed || false,
    };

    outputModels.push(entry);
    const result = pm.status_result || 'untested';
    if (result === 'working') workingIds.push(modelId);
    else if (result === 'rate_limited') rateLimitedIds.push(modelId);
    else if (result === 'broken') brokenIds.push(modelId);
    else untestedIds.push(modelId);
  }

  // ── Emit models.dev models ──
  for (const mpm of mdProviderModels) {
    const m = mdModelMap.get(mpm.modelsdev_id);
    if (!m) continue;
    const modelId = mpm.full_id;
    const mid = m.id;

    const entry = {
      id: modelId,
      name: m.name,
      provider: mpm.provider_name,
      author: null,
      context_length: m.context_length || null,
      input_price_per_million: Number(m.input_price_per_million) || 0,
      output_price_per_million: Number(m.output_price_per_million) || 0,
      is_free: m.is_free,
      supports_tools: m.supports_tools,
      supports_reasoning: m.supports_reasoning,
      output_limit: m.output_limit || null,
      temperature: m.temperature,
      open_weights: m.open_weights,
      family: m.family || null,
      knowledge_cutoff: m.knowledge_cutoff || null,
      releaseDate: formatDate(m.release_date),
      lastUpdated: formatDate(m.last_updated),
      tags: mdFeatMap.get(mid)?.tag || [],
      best_for: mdFeatMap.get(mid)?.best_for || [],
      input_types: mdInputMap.get(mid) || [],
      output_types: mdOutputMap.get(mid) || [],
      status: {
        tested: mpm.status_tested || null,
        result: mpm.status_result || 'untested',
        detail: mpm.status_detail || null,
      },
      last_success: mpm.last_success || null,
      source: 'models.dev',
    };

    outputModels.push(entry);
    const result = mpm.status_result || 'untested';
    if (result === 'working') workingIds.push(modelId);
    else if (result === 'rate_limited') rateLimitedIds.push(modelId);
    else if (result === 'broken') brokenIds.push(modelId);
    else untestedIds.push(modelId);
  }

  // Build _test_summary
  const testSummary = {
    date: new Date().toISOString().slice(0, 10),
    results: { working: workingIds, rate_limited: rateLimitedIds, broken: brokenIds, untested: untestedIds },
  };

  // Build provider_health (free models only)
  const health = {};
  for (const m of outputModels) {
    if (!m.is_free) continue;
    if (!health[m.provider]) health[m.provider] = { working: 0, rate_limited: 0, broken: 0, total: 0 };
    health[m.provider].total++;
    if (m.status.result === 'working') health[m.provider].working++;
    else if (m.status.result === 'rate_limited') health[m.provider].rate_limited++;
    else if (m.status.result === 'broken') health[m.provider].broken++;
  }

  return {
    models: outputModels,
    _test_summary: testSummary,
    _role_rankings: meta._role_rankings || { description: '', model: [], build: [], general: [], small_model: [], explore: [], stable: [] },
    _provider_usage: meta._provider_usage || { description: '' },
    _known_issues: meta._known_issues || { description: '', issues: [] },
    _validation_method: meta._validation_method || { description: '' },
    provider_health: health,
  };
}

function groupByModel(rows, field) {
  const map = new Map();
  for (const row of rows) {
    const key = row.model_id || row.modelsdev_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row[field]);
  }
  return map;
}

function groupFeatures(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.model_id || row.modelsdev_id;
    if (!map.has(key)) map.set(key, { tag: [], best_for: [] });
    map.get(key)[row.feature_type].push(row.value);
  }
  return map;
}

function formatDate(d) {
  if (!d) return null;
  const s = typeof d === 'string' ? d : d.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

module.exports = router;
