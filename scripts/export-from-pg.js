require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_FILE = path.join(__dirname, '..', 'available-models.json');

async function exportData(pool) {
  let ownPool = false;
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    pool = connectionString
      ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
      : new Pool({
          host: process.env.PGHOST || 'localhost',
          port: parseInt(process.env.PGPORT || '5432'),
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE,
        });
    ownPool = true;
  }

  const client = await pool.connect();
  try {
    const { rows: metadataRows } = await client.query('SELECT key, value::text FROM metadata ORDER BY key');
    const meta = {};
    for (const r of metadataRows) {
      try { meta[r.key] = JSON.parse(r.value); }
      catch { meta[r.key] = r.value; }
    }

    const { rows: dmRows } = await client.query(`
      SELECT dm.*, mm.name AS super_name, mm.slug AS super_slug,
             dp.name AS provider_name, dp.slug AS provider_slug
      FROM datapoint_models dm
      JOIN super_models mm ON mm.id = dm.super_model_id
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      ORDER BY mm.name, dp.name
    `);

    const dmIds = dmRows.map(r => r.id);
    const inputMap = new Map();
    const outputMap = new Map();
    const featMap = new Map();

    if (dmIds.length > 0) {
      const { rows: inputRows } = await client.query(
        'SELECT datapoint_model_id, input_type FROM datapoint_model_input_types WHERE datapoint_model_id = ANY($1)',
        [dmIds]
      );
      for (const r of inputRows) {
        if (!inputMap.has(r.datapoint_model_id)) inputMap.set(r.datapoint_model_id, []);
        inputMap.get(r.datapoint_model_id).push(r.input_type);
      }
      const { rows: outputRows } = await client.query(
        'SELECT datapoint_model_id, output_type FROM datapoint_model_output_types WHERE datapoint_model_id = ANY($1)',
        [dmIds]
      );
      for (const r of outputRows) {
        if (!outputMap.has(r.datapoint_model_id)) outputMap.set(r.datapoint_model_id, []);
        outputMap.get(r.datapoint_model_id).push(r.output_type);
      }
      const { rows: featRows } = await client.query(
        'SELECT datapoint_model_id, feature_type, value FROM datapoint_model_features WHERE datapoint_model_id = ANY($1)',
        [dmIds]
      );
      const knownFeatures = ['best_for', 'tag', 'supports_reasoning', 'output_limit', 'temperature', 'open_weights', 'family', 'knowledge_cutoff', 'release_date', 'last_updated'];
      for (const r of featRows) {
        if (!featMap.has(r.datapoint_model_id)) {
          const obj = { tag: [], best_for: [] };
          for (const f of knownFeatures) obj[f] = [];
          featMap.set(r.datapoint_model_id, obj);
        }
        const bucket = knownFeatures.includes(r.feature_type) ? r.feature_type : 'tag';
        featMap.get(r.datapoint_model_id)[bucket].push(r.value);
      }
    }

    const CTX_NORM = 1048756;
    const outputModels = [];
    const workingIds = [];
    const rateLimitedIds = [];
    const brokenIds = [];
    const untestedIds = [];

    for (const dm of dmRows) {
      const entry = {
        id: dm.full_id,
        super_id: dm.super_model_id,
        super_name: dm.super_name,
        name: dm.super_name,
        provider: dm.provider_name,
        author: null,
        context_length: dm.context_length || null,
        input_price_per_million: Number(dm.input_price_per_million) || 0,
        output_price_per_million: Number(dm.output_price_per_million) || 0,
        is_free: dm.is_free,
        supports_tools: dm.supports_tools,
        supports_reasoning: featMap.get(dm.id)?.supports_reasoning?.[0] === 'true' || null,
        output_limit: featMap.get(dm.id)?.output_limit?.[0] ? parseInt(featMap.get(dm.id).output_limit[0], 10) : null,
        temperature: featMap.get(dm.id)?.temperature?.[0] === 'true' ? true : null,
        open_weights: featMap.get(dm.id)?.open_weights?.[0] === 'true' ? true : null,
        family: featMap.get(dm.id)?.family?.[0] || null,
        knowledge_cutoff: featMap.get(dm.id)?.knowledge_cutoff?.[0] || null,
        releaseDate: featMap.get(dm.id)?.release_date?.[0] || null,
        lastUpdated: featMap.get(dm.id)?.last_updated?.[0] || null,
        tags: featMap.get(dm.id)?.tag || [],
        best_for: featMap.get(dm.id)?.best_for || [],
        input_types: inputMap.get(dm.id) || [],
        output_types: outputMap.get(dm.id) || [],
        status: {
          tested: dm.status_tested || null,
          result: dm.status_result || 'untested',
          detail: dm.status_detail || null,
        },
        last_success: dm.last_success || null,
        source: dm.provider_slug,
        _removed: dm.is_removed || false,
        _removedDate: null,
        notes: null,
      };

      const ctx = entry.context_length ? entry.context_length / CTX_NORM : -0.5;
      const toolsBonus = entry.supports_tools === true ? 2 : 0;
      const codingTags = (entry.best_for || []).some(t =>
        /\b(cod|programm|agentic|reasoning|tool use|function calling|refactor)\b/i.test(t)
      ) ? 1.5 : 0;
      entry.priority_score = Math.round((ctx * 1.0 + toolsBonus + codingTags) * 100) / 100;

      outputModels.push(entry);
      const result = dm.status_result || 'untested';
      if (result === 'working') workingIds.push(dm.full_id);
      else if (result === 'rate_limited') rateLimitedIds.push(dm.full_id);
      else if (result === 'broken') brokenIds.push(dm.full_id);
      else untestedIds.push(dm.full_id);
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
