const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_FILE = path.join(__dirname, '..', 'available-models.json');

async function exportData(pool) {
  let ownPool = false;
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER || 'gfm',
      password: process.env.PGPASSWORD || 'gfm',
      database: process.env.PGDATABASE || 'grabfreemodels',
    });
    ownPool = true;
  }

  const client = await pool.connect();
  try {
    const { rows: providers } = await client.query('SELECT * FROM providers ORDER BY name');
    const { rows: authors } = await client.query('SELECT * FROM authors ORDER BY name');
    const { rows: models } = await client.query(`
      SELECT m.*, a.name AS author_name
      FROM models m LEFT JOIN authors a ON a.id = m.author_id ORDER BY m.name
    `);
    const { rows: providerModels } = await client.query(`
      SELECT pm.*, p.name AS provider_name, p.slug AS provider_slug
      FROM provider_models pm JOIN providers p ON p.id = pm.provider_id ORDER BY pm.full_id
    `);
    const { rows: inputTypesRows } = await client.query(
      'SELECT model_id, input_type FROM model_input_types ORDER BY model_id, input_type'
    );
    const { rows: outputTypesRows } = await client.query(
      'SELECT model_id, output_type FROM model_output_types ORDER BY model_id, output_type'
    );
    const { rows: featuresRows } = await client.query(
      'SELECT model_id, feature_type, value FROM model_features ORDER BY model_id'
    );
    const { rows: metadataRows } = await client.query('SELECT key, value::text FROM metadata ORDER BY key');

    const modelMap = new Map();
    for (const m of models) modelMap.set(m.id, m);

    const inputMap = new Map();
    for (const r of inputTypesRows) {
      if (!inputMap.has(r.model_id)) inputMap.set(r.model_id, []);
      inputMap.get(r.model_id).push(r.input_type);
    }
    const outputMap = new Map();
    for (const r of outputTypesRows) {
      if (!outputMap.has(r.model_id)) outputMap.set(r.model_id, []);
      outputMap.get(r.model_id).push(r.output_type);
    }
    const featMap = new Map();
    for (const r of featuresRows) {
      if (!featMap.has(r.model_id)) featMap.set(r.model_id, { tag: [], best_for: [] });
      featMap.get(r.model_id)[r.feature_type].push(r.value);
    }

    const meta = {};
    for (const r of metadataRows) {
      try { meta[r.key] = JSON.parse(r.value); }
      catch { meta[r.key] = r.value; }
    }

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
        releaseDate: m.release_date ? (typeof m.release_date === 'string' ? m.release_date.slice(0, 10) : m.release_date.toISOString().slice(0, 10)) : null,
        lastUpdated: m.last_updated ? (typeof m.last_updated === 'string' ? m.last_updated.slice(0, 10) : m.last_updated.toISOString().slice(0, 10)) : null,
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
      };
      outputModels.push(entry);
      const result = pm.status_result || 'untested';
      if (result === 'working') workingIds.push(modelId);
      else if (result === 'rate_limited') rateLimitedIds.push(modelId);
      else if (result === 'broken') brokenIds.push(modelId);
      else untestedIds.push(modelId);
    }

    const health = {};
    for (const m of outputModels) {
      if (!m.is_free) continue;
      if (!health[m.provider]) health[m.provider] = { working: 0, rate_limited: 0, broken: 0, total: 0 };
      health[m.provider].total++;
      if (m.status.result === 'working') health[m.provider].working++;
      else if (m.status.result === 'rate_limited') health[m.provider].rate_limited++;
      else if (m.status.result === 'broken') health[m.provider].broken++;
    }

    const result = {
      models: outputModels,
      _test_summary: {
        date: new Date().toISOString().slice(0, 10),
        results: { working: workingIds, rate_limited: rateLimitedIds, broken: brokenIds, untested: untestedIds },
      },
      _role_rankings: meta._role_rankings || { description: '', model: [], build: [], general: [], small_model: [], explore: [], stable: [] },
      _provider_usage: meta._provider_usage || { description: '' },
      _known_issues: meta._known_issues || { description: '', issues: [] },
      _validation_method: meta._validation_method || { description: '' },
      provider_health: health,
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(result, null, 2) + '\n');
    console.log(`Exported ${outputModels.length} models to ${DATA_FILE}`);
  } catch (err) {
    console.error('Export failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

if (require.main === module) {
  exportData().catch(() => process.exit(1));
}

module.exports = exportData;
