/**
 * load-scores.js — Loads model benchmark scores and fans them out to all provider
 * listings of the same super_model (so scores appear regardless of which provider
 * served as the benchmark data source).
 *
 * Uses super_model_id FK (migration 038) for the score lookup.
 *
 * Returns { scoreMap: Record<full_id, ModelScore[]>, superIdToFullIds: Record<super_id, full_id[]> }
 */

async function loadScores(client) {
  // Build super_id → full_ids map from ALL datapoints (free + paid)
  const { rows: allDpRows } = await client.query(
    'SELECT id, full_id, super_model_id FROM datapoint_models',
  );
  const superIdToFullIds = {};
  for (const r of allDpRows) {
    if (!superIdToFullIds[r.super_model_id]) superIdToFullIds[r.super_model_id] = [];
    superIdToFullIds[r.super_model_id].push(r.full_id);
  }

  // Load scores by super_model_id (no JOIN needed since migration 038)
  const { rows: scoreRows } = await client.query(
    'SELECT ms.super_model_id, ms.source, ms.score_type, ms.score_value FROM model_scores ms',
  );
  const scoreMap = {};
  const seen = new Set();
  for (const r of scoreRows) {
    const siblings = superIdToFullIds[r.super_model_id] || [];
    const entry = {
      source: r.source,
      score_type: r.score_type,
      score_value: r.score_value !== null ? Number(r.score_value) : null,
    };
    for (const fid of siblings) {
      const dedupeKey = `${fid}|${r.source}|${r.score_type}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      if (!scoreMap[fid]) scoreMap[fid] = [];
      scoreMap[fid].push(entry);
    }
  }

  return { scoreMap, superIdToFullIds };
}

module.exports = loadScores;
