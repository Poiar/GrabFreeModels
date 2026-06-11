/**
 * tag-inference.js — Shared tag inference from model name/description.
 *
 * Duplicated in sync-paid-models.js and rank-paid-models.js — now a single
 * source of truth. Used as a fallback when curated tags are unavailable.
 */

/**
 * Infer role/feature tags from a model name and/or description.
 * Returns a deduplicated array of tag strings.
 *
 * @param {string|null} name — model name
 * @param {string|null} description — model description
 * @returns {string[]}
 */
function inferTags(name, description) {
  const tags = [];

  // Name-based patterns
  if (name) {
    const n = name.toLowerCase();
    if (/\bcoder\b|\bcodex\b|\bdevstral\b|\bbuild\b/i.test(n)) tags.push('coding');
    if (/\bmulti.agent\b|\bagentic\b/i.test(n)) tags.push('agentic');
    if (/\bfunction.call|\btool.use|\btool\b/i.test(n)) tags.push('tool use');
    if (/\breasoning\b|\bdeep.research\b|\bdeep.think\b/i.test(n)) tags.push('reasoning');
    if (/\bthinking\b|\bthink\b/i.test(n)) tags.push('thinking');
    if (/\b(?:pro|plus|max|premier|large)\b/i.test(n)) tags.push('current default');
    if (/\bvision\b|\bvl\b|\bimage\b|\baudio\b|\bvideo\b|\bmultimodal\b/i.test(n)) tags.push('multimodal');
    if (/\bflash\b|\bfast\b|\bturbo\b|\bquick\b/i.test(n)) tags.push('fast');
    if (/\bnano\b|\bmicro\b|\btiny\b/i.test(n)) tags.push('ultra-lightweight');
    if (/\bmini\b|\bsmall\b|\blite\b/i.test(n)) tags.push('lightweight');
    if (/\bpreview\b|\bexp\b|\bexperimental\b|\balpha\b/i.test(n)) tags.push('new');
  }

  // Description-based patterns
  if (description) {
    const d = description.toLowerCase();
    if (/\bcoding\b|\bcoder\b|\bprogramming\b|\bsoftware.engineering\b/i.test(d)) tags.push('coding');
    if (/\bagentic\b|\bmulti.agent\b|\bautonomous.*agent\b|\bagent.*workflow\b/i.test(d)) tags.push('agentic');
    if (/\btool.using\b|\bfunction.calling\b|\bsupports.*tools\b|\bthousands.*tool\b/i.test(d)) tags.push('tool use');
    if (/\breasoning\b/i.test(d) && !/\bnon.reasoning\b|\bnot.reasoning\b/i.test(d)) tags.push('reasoning');
    if (/\bthinking\b|\bchain.of.thought\b/i.test(d)) tags.push('thinking');
    if (/\bmultimodal\b|\bvision.language\b|\bimage.*understanding\b/i.test(d)) tags.push('multimodal');
    if (/\bflagship\b|\bmost capable\b|\bpremier\b|\bhighest.quality\b|\bbest overall\b/i.test(d)) tags.push('current default');
    if (/\bgeneral purpose\b|\bgeneral.*tasks\b|\bversatile\b|\ball.?around\b/i.test(d)) tags.push('general purpose');
    if (/\blightweight\b|\bcompact\b|\befficient inference\b|\bsmall.*parameter\b/i.test(d)) tags.push('lightweight');
    if (/\bfast\b|\bhigh.speed\b|\blow.latency\b|\bquick\b|\brapid\b/i.test(d)) tags.push('fast');
    if (/\bcost.effective\b|\baffordable\b|\bbudget|\bvalue.*money\b/i.test(d)) tags.push('cost-efficient');
    if (/\bcreative\b|\bwriting\b|\bstorytelling\b|\bcontent.*creation\b/i.test(d)) tags.push('general chat');
    if (/\bresearch\b|\bscience\b|\bscientific\b|\bacademia\b/i.test(d)) tags.push('complex tasks');
    if (/\btranslation\b|\bmultilingual\b|\blanguage.*support\b/i.test(d)) tags.push('multilingual');
    if (/\bpreview\b|\bexp\b|\bexperimental\b|\balpha\b/i.test(d)) tags.push('new');
  }

  return [...new Set(tags)];
}

module.exports = { inferTags };
