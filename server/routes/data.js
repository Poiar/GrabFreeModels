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
  // Fetch all providers
  const { rows: providers } = await pool.query('SELECT * FROM providers ORDER BY name');

  // Fetch all authors
  const { rows: authors } = await pool.query('SELECT * FROM authors ORDER BY name');

  // Fetch all models with their authors
  const { rows: models } = await pool.query(`
    SELECT m.*, a.name AS author_name
    FROM models m
    LEFT JOIN authors a ON a.id = m.author_id
    ORDER BY m.name
  `);

  // Fetch all provider_models
  const { rows: providerModels } = await pool.query(`
    SELECT pm.*, p.name AS provider_name, p.slug AS provider_slug
    FROM provider_models pm
    JOIN providers p ON p.id = pm.provider_id
    ORDER BY pm.full_id
  `);

  // Fetch all input_types
  const { rows: inputTypesRows } = await pool.query(
    'SELECT model_id, input_type FROM model_input_types ORDER BY model_id, input_type'
  );
  const inputTypes = groupByModel(inputTypesRows, 'input_type');

  // Fetch all output_types
  const { rows: outputTypesRows } = await pool.query(
    'SELECT model_id, output_type FROM model_output_types ORDER BY model_id, output_type'
  );
  const outputTypes = groupByModel(outputTypesRows, 'output_type');

  // Fetch all features
  const { rows: featuresRows } = await pool.query(
    'SELECT model_id, feature_type, value FROM model_features ORDER BY model_id'
  );
  const features = groupFeatures(featuresRows);

  // Build model lookup: model_id -> model row
  const modelMap = new Map();
  for (const m of models) modelMap.set(m.id, m);

  // Build the output models array — one entry per provider_model
  const outputModels = [];
  const workingIds = [];
  const rateLimitedIds = [];
  const brokenIds = [];
  const untestedIds = [];

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
      tags: features.get(mid)?.tag || [],
      best_for: features.get(mid)?.best_for || [],
      input_types: inputTypes.get(mid) || [],
      output_types: outputTypes.get(mid) || [],
      status: {
        tested: pm.status_tested || null,
        result: pm.status_result || 'untested',
        detail: pm.status_detail || null,
      },
      last_success: pm.last_success || null,
      source: pm.source || 'curated',
    };

    outputModels.push(entry);

    // Collect for test summary
    const result = pm.status_result || 'untested';
    if (result === 'working') workingIds.push(modelId);
    else if (result === 'rate_limited') rateLimitedIds.push(modelId);
    else if (result === 'broken') brokenIds.push(modelId);
    else untestedIds.push(modelId);
  }

  // Build _test_summary
  const testSummary = {
    date: new Date().toISOString().slice(0, 10),
    results: {
      working: workingIds,
      rate_limited: rateLimitedIds,
      broken: brokenIds,
      untested: untestedIds,
    },
  };

  // Fetch metadata blobs
  const { rows: metadataRows } = await pool.query('SELECT key, value::text FROM metadata ORDER BY key');
  const metadata = {};
  for (const row of metadataRows) {
    try { metadata[row.key] = JSON.parse(row.value); }
    catch { metadata[row.key] = row.value; }
  }

  // Build provider_health
  const health = {};
  for (const m of outputModels) {
    if (!m.is_free) continue;
    if (!health[m.provider]) {
      health[m.provider] = { working: 0, rate_limited: 0, broken: 0, total: 0 };
    }
    health[m.provider].total++;
    if (m.status.result === 'working') health[m.provider].working++;
    else if (m.status.result === 'rate_limited') health[m.provider].rate_limited++;
    else if (m.status.result === 'broken') health[m.provider].broken++;
  }

  return {
    models: outputModels,
    _test_summary: testSummary,
    _role_rankings: metadata._role_rankings || { description: '', model: [], build: [], general: [], small_model: [], explore: [], stable: [] },
    _provider_usage: metadata._provider_usage || { description: '' },
    _known_issues: metadata._known_issues || { description: '', issues: [] },
    _validation_method: metadata._validation_method || { description: '' },
    provider_health: health,
  };
}

function groupByModel(rows, field) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.model_id)) map.set(row.model_id, []);
    map.get(row.model_id).push(row[field]);
  }
  return map;
}

function groupFeatures(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.model_id)) map.set(row.model_id, { tag: [], best_for: [] });
    map.get(row.model_id)[row.feature_type].push(row.value);
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
