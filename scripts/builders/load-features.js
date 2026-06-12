/**
 * load-features.js — Loads features, I/O types, and feature type metadata for a set of model IDs.
 *
 * Returns { inputMap, outputMap, featMap, featureValueTypes }.
 * Prefers unified io_types table (migration 033), falls back to legacy separate tables.
 * Reads feature_types lookup table for type metadata (migration 031).
 */

async function loadFeatures(client, pool, dmIds) {
  const inputMap = new Map();
  const outputMap = new Map();
  const featMap = new Map();
  const featureValueTypes = new Map();

  if (dmIds.length === 0) return { inputMap, outputMap, featMap, featureValueTypes };

  const useClient = pool || client;

  // ── Load known feature types from lookup table ──
  try {
    const { rows: ftRows } = await useClient.query(
      'SELECT slug, value_type FROM feature_types ORDER BY slug',
    );
    for (const r of ftRows) {
      featureValueTypes.set(r.slug, r.value_type);
    }
  } catch {
    /* feature_types table may not exist yet */
  }

  // ── I/O types: prefer unified table, fall back to legacy ──
  try {
    const { rows } = await useClient.query(
      'SELECT datapoint_model_id, direction, io_type FROM datapoint_model_io_types WHERE datapoint_model_id = ANY($1)',
      [dmIds],
    );
    for (const r of rows) {
      if (r.direction === 'input') {
        if (!inputMap.has(r.datapoint_model_id)) inputMap.set(r.datapoint_model_id, []);
        inputMap.get(r.datapoint_model_id).push(r.io_type);
      } else {
        if (!outputMap.has(r.datapoint_model_id)) outputMap.set(r.datapoint_model_id, []);
        outputMap.get(r.datapoint_model_id).push(r.io_type);
      }
    }
  } catch {
    // Fall back to legacy separate tables
    try {
      const { rows } = await useClient.query(
        'SELECT datapoint_model_id, input_type AS type_val FROM datapoint_model_input_types WHERE datapoint_model_id = ANY($1)',
        [dmIds],
      );
      for (const r of rows) {
        if (!inputMap.has(r.datapoint_model_id)) inputMap.set(r.datapoint_model_id, []);
        inputMap.get(r.datapoint_model_id).push(r.type_val);
      }
    } catch {
      /* table may not exist */
    }

    try {
      const { rows } = await useClient.query(
        'SELECT datapoint_model_id, output_type AS type_val FROM datapoint_model_output_types WHERE datapoint_model_id = ANY($1)',
        [dmIds],
      );
      for (const r of rows) {
        if (!outputMap.has(r.datapoint_model_id)) outputMap.set(r.datapoint_model_id, []);
        outputMap.get(r.datapoint_model_id).push(r.type_val);
      }
    } catch {
      /* table may not exist */
    }
  }

  // ── Load features ──
  try {
    const { rows } = await useClient.query(
      'SELECT datapoint_model_id, feature_type AS type_val, value AS feat_val FROM datapoint_model_features WHERE datapoint_model_id = ANY($1)',
      [dmIds],
    );
    const knownTypeSet = featureValueTypes.size > 0 ? new Set(featureValueTypes.keys()) : new Set();

    for (const r of rows) {
      if (!featMap.has(r.datapoint_model_id)) {
        const obj = { tag: [], best_for: [] };
        for (const ft of knownTypeSet) obj[ft] = [];
        featMap.set(r.datapoint_model_id, obj);
      }
      const bucket = knownTypeSet.has(r.type_val) ? r.type_val : 'tag';
      featMap.get(r.datapoint_model_id)[bucket].push(r.feat_val);
    }
  } catch {
    /* table may not exist */
  }

  return { inputMap, outputMap, featMap, featureValueTypes };
}

module.exports = loadFeatures;
