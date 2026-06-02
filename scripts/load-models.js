#!/usr/bin/env node
/**
 * load-models.js
 * Shared module: builds the full models data object from PostgreSQL.
 * Returns the same shape as available-models.json / GET /api/data.
 *
 * Usage as module:
 *   const loadModels = require('./load-models');
 *   const data = await loadModels();          // from DATABASE_URL
 *   const data = await loadModels(pool);      // from existing pool
 *
 * Usage as CLI (exports to stdout):
 *   node scripts/load-models.js
 */

const path = require('path');

async function loadModels(existingPool) {
  let pool = existingPool;
  let ownPool = false;

  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    // eslint-disable-next-line global-require
    const { Pool } = require('pg');
    if (connectionString) {
      const isNeon = connectionString.includes('neon.tech');
      pool = new Pool({
        connectionString,
        max: isNeon ? 3 : 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ...(isNeon ? { ssl: { rejectUnauthorized: false } } : {}),
      });
    } else {
      pool = new Pool({
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      });
    }
    ownPool = true;
  }

  const client = await pool.connect();
  try {
    const { rows: metadataRows } = await client.query('SELECT key, value::text FROM metadata ORDER BY key');
    const meta = {};
    for (const r of metadataRows) {
      try { meta[r.key] = JSON.parse(r.value); } catch { meta[r.key] = r.value; }
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
      const knownFeatures = ['best_for', 'tag', 'supports_reasoning', 'output_limit', 'temperature', 'open_weights', 'family', 'knowledge_cutoff', 'release_date', 'last_updated'];

      const [iRows, oRows, fRows] = await Promise.all([
        client.query('SELECT datapoint_model_id, input_type FROM datapoint_model_input_types WHERE datapoint_model_id = ANY($1)', [dmIds]),
        client.query('SELECT datapoint_model_id, output_type FROM datapoint_model_output_types WHERE datapoint_model_id = ANY($1)', [dmIds]),
        client.query('SELECT datapoint_model_id, feature_type, value FROM datapoint_model_features WHERE datapoint_model_id = ANY($1)', [dmIds]),
      ]);

      for (const r of iRows.rows) {
        if (!inputMap.has(r.datapoint_model_id)) inputMap.set(r.datapoint_model_id, []);
        inputMap.get(r.datapoint_model_id).push(r.input_type);
      }
      for (const r of oRows.rows) {
        if (!outputMap.has(r.datapoint_model_id)) outputMap.set(r.datapoint_model_id, []);
        outputMap.get(r.datapoint_model_id).push(r.output_type);
      }
      for (const r of fRows.rows) {
        if (!featMap.has(r.datapoint_model_id)) {
          const o = Object.fromEntries(knownFeatures.map(f => [f, []]));
          o.tag = []; o.best_for = [];
          featMap.set(r.datapoint_model_id, o);
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
        /\b(cod|programm|agentic|reasoning|tool use|function calling|refactor)\b/i.test(t),
      ) ? 1.5 : 0;
      entry.priority_score = Math.round((ctx * 1.0 + toolsBonus + codingTags) * 100) / 100;

      outputModels.push(entry);
      const result = dm.status_result || 'untested';
      if (result === 'working') workingIds.push(dm.full_id);
      else if (result === 'rate_limited') rateLimitedIds.push(dm.full_id);
      else if (result === 'broken') brokenIds.push(dm.full_id);
      else untestedIds.push(dm.full_id);
    }

    return {
      models: outputModels,
      _test_summary: {
        date: new Date().toISOString().slice(0, 10),
        results: {
          working: workingIds,
          rate_limited: rateLimitedIds,
          broken: brokenIds,
          untested: untestedIds,
        },
      },
      _role_rankings: meta._role_rankings || { description: '', model: [], build: [], general: [], small_model: [], explore: [], stable: [] },
      _provider_usage: meta._provider_usage || { description: '' },
      _known_issues: meta._known_issues || { description: '', issues: [] },
      _validation_method: meta._validation_method || { description: '' },
    };
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

module.exports = loadModels;

if (require.main === module) {
  loadModels()
    .then(data => { process.stdout.write(JSON.stringify(data, null, 2) + '\n'); })
    .catch(err => { console.error(err.message); process.exit(1); });
}
