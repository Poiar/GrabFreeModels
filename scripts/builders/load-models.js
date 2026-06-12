/**
 * load-models.js — Fetches datapoint_models with super_models and provider joins.
 *
 * Returns { dmRows, dmIds } for downstream consumption.
 */

async function loadModels(client, options = {}) {
  const { isFree = true } = options;

  const { rows: dmRows } = await client.query(`
    SELECT dm.*, mm.name AS super_name, mm.slug AS super_slug, mm.creator AS super_creator,
           mm.base_creator AS super_base_creator, mm.family AS super_family,
           mm.family_id AS super_family_id, mm.base_model AS super_base_model,
           mm.base_model_id AS super_base_model_id,
           mm.derivation_method AS super_derivation_method,
           mm.knowledge_cutoff AS super_knowledge_cutoff,
           mm.release_date AS super_release_date,
           mm.description AS super_description,
           dp.name AS provider_name, dp.slug AS provider_slug,
           dp.description AS provider_description, dp.npm_package, dp.base_url,
           dp.provider_type, dp.serves_third_party,
           dp.hardware, dp.is_openai_compat, dp.supports_streaming, dp.requires_account_id,
           dp.max_rpm, dp.max_tpm, dp.max_daily_requests, dp.requires_card,
           dm.failure_category
    FROM datapoint_models dm
    JOIN super_models mm ON mm.id = dm.super_model_id AND mm.is_removed = false
    JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
    WHERE dm.is_free = $1 AND dm.is_removed = false
    ORDER BY mm.name, dp.name
  `, [isFree]);

  const dmIds = dmRows.map((r) => r.id);

  // Batch-fetch provenance (source_ids per datapoint_model)
  const sourceIdsByDm = new Map();
  if (dmIds.length > 0) {
    const { rows: provRows } = await client.query(`
      SELECT datapoint_model_id, source_id
      FROM datapoint_model_sources
      WHERE datapoint_model_id = ANY($1)
    `, [dmIds]);
    for (const r of provRows) {
      if (!sourceIdsByDm.has(r.datapoint_model_id)) sourceIdsByDm.set(r.datapoint_model_id, []);
      sourceIdsByDm.get(r.datapoint_model_id).push(r.source_id);
    }
  }

  return { dmRows, dmIds, sourceIdsByDm };
}

module.exports = loadModels;
