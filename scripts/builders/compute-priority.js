/**
 * compute-priority.js — Computes priority scores for model entries.
 *
 * Priority = context + tools + coding + firstParty + router + hardware + freshness.
 * Uses CTX_NORM (adaptive max context from current population).
 * Falls back to persisted priority_score column if available (migration 040).
 */

/**
 * @param {Array} entries — flat array of model entries (mutated in place)
 * @param {boolean} preferPersisted — if true, use datapoint_models.priority_score when available
 */
function computePriorityScores(entries = []) {
  // Use persisted score when available (migration 040), compute only for NULLs
  const needCompute = entries.filter(
    (e) => e.priority_score === null || e.priority_score === undefined,
  );
  if (needCompute.length === 0) return;

  // CTX_NORM from ALL entries (persisted scores still need correct relative context)
  const CTX_NORM = Math.max(...entries.map((r) => r.context_length || 0).filter(Boolean), 1);

  const hwSpeedBonus = {
    lpu: 2.0,
    wafer: 1.0,
    tpu: 0.5,
    gpu: 0,
    edge: -0.5,
    local: -1.0,
    unknown: 0,
  };

  for (const entry of needCompute) {
    const ctxVal = entry.context_length ? entry.context_length / CTX_NORM : -0.5;
    const toolsBonus = entry.supports_tools === true ? 2 : 0;

    // Auto-tag based coding score
    const codingTags = (entry.best_for || []).some((t) =>
      /\b(cod|programm|agentic|reasoning|tool use|function calling|refactor)\b/i.test(t),
    )
      ? 1.5
      : 0;

    // Provider-type adjustments
    const firstPartyBoost =
      entry.provider_type === 'inference' && entry.serves_third_party === false ? 1.5 : 0;
    const routerPenalty = entry.provider_type === 'router' ? -1.0 : 0;

    // Hardware speed bonus
    const hardwareBonus = hwSpeedBonus[entry.hardware] || 0;

    // Freshness scoring
    let freshnessScore = 0;
    const releaseDate = entry.releaseDate || null;
    const lastUpdated = entry.lastUpdated || null;
    const deprecatedAt = entry.deprecated_at || null;

    if (deprecatedAt) {
      freshnessScore = -3.0;
    } else if (releaseDate) {
      const releaseMs = new Date(releaseDate).getTime();
      if (!isNaN(releaseMs)) {
        const ageDays = (Date.now() - releaseMs) / 864e5;
        if (ageDays <= 180) freshnessScore = 1.5;
        else if (ageDays <= 365) freshnessScore = 0.5;
        else freshnessScore = -0.5;
      }
    }
    // If last_updated is recent and model wasn't recently released, small boost
    if (freshnessScore <= 0 && lastUpdated && !deprecatedAt) {
      const updatedMs = new Date(lastUpdated).getTime();
      if (!isNaN(updatedMs)) {
        const updateAgeDays = (Date.now() - updatedMs) / 864e5;
        if (updateAgeDays <= 90) freshnessScore = Math.max(freshnessScore, 0.3);
      }
    }

    entry.priority_score =
      Math.round(
        (ctxVal * 1.0 +
          toolsBonus +
          codingTags +
          firstPartyBoost +
          routerPenalty +
          hardwareBonus +
          freshnessScore) *
          100,
      ) / 100;
  }
}

module.exports = { computePriorityScores };
