/**
 * load-rankings.js — Builds the _role_rankings shape from the rankings table (preferred)
 * or metadata fallback.
 *
 * Returns the _role_rankings object compatible with the API response shape:
 *   { model: [...], build: [...], _scores: {...}, _meta: {...}, _variants: {...} }
 */

async function loadRankings(client, isFree, metadata) {
  const roleRankingsKey = isFree ? '_role_rankings' : '_role_rankings_paid';

  // Try rankings table first (migration 037)
  try {
    const { rows: rkRows } = await client.query(
      `SELECT role, full_id, rank, score, variant, score_components
       FROM rankings WHERE is_paid = $1
       ORDER BY variant, role, rank`,
      [isFree ? false : true],
    );
    if (rkRows.length > 0) {
      const built = { description: '', _scores: {}, _meta: {}, _variants: {} };
      const roleSet = new Set();
      for (const r of rkRows) {
        roleSet.add(r.role);
        if (r.variant === 'combined') {
          if (!built[r.role]) built[r.role] = [];
          built[r.role].push(r.full_id);
          if (r.score_components) {
            if (!built._scores[r.role]) built._scores[r.role] = [];
            built._scores[r.role].push({
              id: r.full_id,
              score: r.score !== null ? Number(r.score) : undefined,
              ...r.score_components,
            });
          }
        } else {
          if (!built._variants[r.variant]) built._variants[r.variant] = {};
          if (!built._variants[r.variant][r.role]) built._variants[r.variant][r.role] = [];
          built._variants[r.variant][r.role].push(r.full_id);
        }
      }
      for (const role of roleSet) {
        if (!built[role]) built[role] = [];
      }
      // Merge _meta from metadata if available (role config like ctxWeight, tagKeywords)
      if (metadata[roleRankingsKey]?._meta) {
        built._meta = metadata[roleRankingsKey]._meta;
      }
      return built;
    }
  } catch {
    // rankings table may not exist yet — fall through to metadata
  }

  // Fallback: metadata JSONB
  return (
    metadata[roleRankingsKey] || {
      description: '',
      model: [],
      build: [],
      general: [],
      small_model: [],
      explore: [],
    }
  );
}

module.exports = loadRankings;
