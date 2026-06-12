/**
 * safe-chain-walker.js — Shared utility for safely walking base_model chains.
 *
 * All scripts that traverse base_model parent chains MUST use these functions
 * to prevent infinite loops from circular references.
 *
 * Usage:
 *   const { walkChain, detectCycles, validateNoSelfRefs } = require('./safe-chain-walker');
 */

const MAX_CHAIN_DEPTH = 50; // Safety limit — real chains don't exceed 8-10

/**
 * Walk a base_model chain upward from `startSlug`, returning the ordered path.
 * Stops at cycles, missing parents, or MAX_CHAIN_DEPTH. Never infinite-loops.
 *
 * @param {string} startSlug — the slug to start walking from
 * @param {Map<string, string|null>} parentMap — slug → base_model (its parent slug, or null)
 * @param {Map<string, string>} [nameMap] — Optional: slug → display name for path labels
 * @returns {{ path: string[], cycleDetected: boolean, truncated: boolean }}
 */
function walkChain(startSlug, parentMap, nameMap) {
  const path = [];
  const visited = new Set();
  let slug = startSlug;
  let depth = 0;
  let cycleDetected = false;
  let truncated = false;

  while (slug && depth < MAX_CHAIN_DEPTH) {
    depth++;
    if (visited.has(slug)) {
      cycleDetected = true;
      break;
    }
    visited.add(slug);
    // Push name if available, else slug
    path.push(nameMap?.get(slug) ?? slug);
    slug = parentMap.get(slug) ?? null;
  }

  if (depth >= MAX_CHAIN_DEPTH) truncated = true;

  return { path, cycleDetected, truncated };
}

/**
 * Check whether assigning `parentSlug` as the base_model of `childSlug`
 * would create a cycle. Returns true if safe, false if it would cycle.
 *
 * @param {string} childSlug
 * @param {string} parentSlug
 * @param {Map<string, string|null>} parentMap — current slug → base_model map (BEFORE the proposed change)
 * @returns {boolean} true if the assignment is safe
 */
function wouldCreateCycle(childSlug, parentSlug, parentMap) {
  // Self-reference is always invalid
  if (childSlug === parentSlug) return true;

  // Walk from parentSlug upward — if we ever hit childSlug, it's a cycle
  const visited = new Set([childSlug]);
  let cur = parentSlug;
  let depth = 0;
  while (cur && depth < MAX_CHAIN_DEPTH) {
    depth++;
    if (visited.has(cur)) return true; // cycle detected
    visited.add(cur);
    cur = parentMap.get(cur) ?? null;
  }
  return false; // safe
}

/**
 * Detect ALL cycles in a base_model graph. Returns the list of slugs
 * that participate in cycles so they can be nulled.
 *
 * @param {Map<string, string|null>} parentMap — slug → base_model
 * @returns {string[]} slugs whose base_model creates a cycle
 */
// Safety checks use a higher depth limit than display functions
// so they catch all cycles regardless of depth.
const CYCLE_DETECT_DEPTH = 200;

function detectCycles(parentMap) {
  const cycleSlugs = [];
  for (const [slug, parent] of parentMap) {
    if (!parent) continue;
    // Self-reference
    if (slug === parent) {
      cycleSlugs.push(slug);
      continue;
    }
    // Walk upward
    const visited = new Set([slug]);
    let cur = parent;
    let depth = 0;
    while (cur && depth < CYCLE_DETECT_DEPTH) {
      depth++;
      if (visited.has(cur)) {
        cycleSlugs.push(slug);
        break;
      }
      visited.add(cur);
      cur = parentMap.get(cur) ?? null;
    }
  }
  return cycleSlugs;
}

/**
 * Validate that no model's base_model equals its own slug.
 * Returns slugs that self-reference.
 *
 * @param {Map<string, string|null>} parentMap
 * @returns {string[]}
 */
function validateNoSelfRefs(parentMap) {
  const selfRefs = [];
  for (const [slug, parent] of parentMap) {
    if (parent === slug) selfRefs.push(slug);
  }
  return selfRefs;
}

module.exports = {
  MAX_CHAIN_DEPTH,
  CYCLE_DETECT_DEPTH,
  walkChain,
  wouldCreateCycle,
  detectCycles,
  validateNoSelfRefs,
};
