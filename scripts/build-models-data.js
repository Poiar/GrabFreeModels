#!/usr/bin/env node
/**
 * build-models-data.js — shared core for building models data from PostgreSQL.
 *
 * Takes a connected pg client, returns the full ModelsData object
 * (same shape as GET /api/data).
 *
 * Usage:
 *   const buildModelsData = require('./build-models-data');
 *   const data = await buildModelsData(client);
 */

async function buildModelsData(client) {
  const { rows: metadataRows } = await client.query('SELECT key, value::text FROM metadata ORDER BY key');
  const meta = {};
  for (const r of metadataRows) {
    try { meta[r.key] = JSON.parse(r.value); }
    catch { meta[r.key] = r.value; }
  }

  const { rows: dmRows } = await client.query(`
    SELECT dm.*, mm.name AS super_name, mm.slug AS super_slug, mm.author AS super_author,
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
  const knownFeatures = ['best_for', 'tag', 'supports_reasoning', 'output_limit', 'temperature', 'open_weights', 'family', 'knowledge_cutoff', 'release_date', 'last_updated'];

  if (dmIds.length > 0) {
    const [inputResult, outputResult, featResult] = await Promise.all([
      client.query('SELECT datapoint_model_id, input_type FROM datapoint_model_input_types WHERE datapoint_model_id = ANY($1)', [dmIds]),
      client.query('SELECT datapoint_model_id, output_type FROM datapoint_model_output_types WHERE datapoint_model_id = ANY($1)', [dmIds]),
      client.query('SELECT datapoint_model_id, feature_type, value FROM datapoint_model_features WHERE datapoint_model_id = ANY($1)', [dmIds]),
    ]);

    for (const r of inputResult.rows) {
      if (!inputMap.has(r.datapoint_model_id)) inputMap.set(r.datapoint_model_id, []);
      inputMap.get(r.datapoint_model_id).push(r.input_type);
    }
    for (const r of outputResult.rows) {
      if (!outputMap.has(r.datapoint_model_id)) outputMap.set(r.datapoint_model_id, []);
      outputMap.get(r.datapoint_model_id).push(r.output_type);
    }
    for (const r of featResult.rows) {
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
    const feat = featMap.get(dm.id);
    const entry = {
      id: dm.full_id,
      super_id: dm.super_model_id,
      super_name: dm.super_name,
      name: dm.super_name,
      provider: dm.provider_name,
      author: dm.super_author || null,
      context_length: dm.context_length ?? null,
      input_price_per_million: Number(dm.input_price_per_million) || 0,
      output_price_per_million: Number(dm.output_price_per_million) || 0,
      is_free: dm.is_free,
      supports_tools: dm.supports_tools,
      supports_reasoning: feat?.supports_reasoning?.[0] === undefined ? null : feat.supports_reasoning[0] === 'true',
      output_limit: feat?.output_limit?.[0] ? parseInt(feat.output_limit[0], 10) : null,
      temperature: feat?.temperature?.[0] === undefined ? null : feat.temperature[0] === 'true',
      open_weights: feat?.open_weights?.[0] === undefined ? null : feat.open_weights[0] === 'true',
      family: feat?.family?.[0] || null,
      knowledge_cutoff: feat?.knowledge_cutoff?.[0] || null,
      releaseDate: feat?.release_date?.[0] || null,
      lastUpdated: feat?.last_updated?.[0] || null,
      tags: feat?.tag || [],
      best_for: feat?.best_for || [],
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

    const ctx_val = entry.context_length ? entry.context_length / CTX_NORM : -0.5;
    const toolsBonus = entry.supports_tools === true ? 2 : 0;
    const codingTags = (entry.best_for || []).some(t =>
      /\b(cod|programm|agentic|reasoning|tool use|function calling|refactor)\b/i.test(t)
    ) ? 1.5 : 0;
    entry.priority_score = Math.round((ctx_val * 1.0 + toolsBonus + codingTags) * 100) / 100;

    outputModels.push(entry);
    const result = dm.status_result || 'untested';
    if (result === 'working') workingIds.push(dm.full_id);
    else if (result === 'rate_limited') rateLimitedIds.push(dm.full_id);
    else if (result === 'broken') brokenIds.push(dm.full_id);
    else untestedIds.push(dm.full_id);
  }

  // Model scores
  const { rows: scoreRows } = await client.query(
    'SELECT dm.full_id, ms.source, ms.score_type, ms.score_value FROM model_scores ms JOIN datapoint_models dm ON dm.id = ms.datapoint_model_id'
  );
  const scoreMap = {};
  for (const r of scoreRows) {
    if (!scoreMap[r.full_id]) scoreMap[r.full_id] = [];
    scoreMap[r.full_id].push({
      source: r.source,
      score_type: r.score_type,
      score_value: r.score_value !== null ? Number(r.score_value) : null,
    });
  }

  // Provider health
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
    _test_summary: {
      date: new Date().toISOString().slice(0, 10),
      results: { working: workingIds, rate_limited: rateLimitedIds, broken: brokenIds, untested: untestedIds },
    },
    _role_rankings: meta._role_rankings || { description: '', model: [], build: [], general: [], small_model: [], explore: [], stable: [] },
    _model_scores: {
      description: 'External benchmark scores by source',
      sources: ['artificial_analysis'],
      scores: scoreMap,
    },
    _provider_usage: meta._provider_usage || { description: '' },
    _known_issues: meta._known_issues || { description: '', issues: [] },
    _validation_method: meta._validation_method || { description: '' },
    provider_health: health,
  };
}

module.exports = buildModelsData;
