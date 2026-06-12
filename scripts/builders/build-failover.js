/**
 * build-failover.js — Builds failover suggestions for broken models.
 *
 * For every broken model, finds working alternatives on other providers
 * for the same super_model. Returns { forward, reverse } maps.
 */

/**
 * @param {Array} outputModels — flat array of per-provider model entries
 * @returns {{ forward: Record<string, string[]>, reverse: Record<string, string[]> }}
 */
function buildFailover(outputModels) {
  const workingBySuperId = new Map();
  const brokenBySuperId = new Map();

  for (const m of outputModels) {
    if (m._removed) continue;
    if (m.status.result === 'working') {
      if (!workingBySuperId.has(m.super_id)) workingBySuperId.set(m.super_id, []);
      workingBySuperId.get(m.super_id).push(m.id);
    } else if (m.status.result === 'broken') {
      if (!brokenBySuperId.has(m.super_id)) brokenBySuperId.set(m.super_id, []);
      brokenBySuperId.get(m.super_id).push(m.id);
    }
  }

  const forward = {};
  const reverse = {};

  for (const [superId, broken] of brokenBySuperId) {
    const working = workingBySuperId.get(superId) || [];
    if (working.length === 0) continue;
    for (const brokenId of broken) {
      forward[brokenId] = working;
    }
    for (const wId of working) {
      reverse[wId] = (reverse[wId] || []).concat(broken);
    }
  }

  return { forward, reverse };
}

module.exports = buildFailover;
