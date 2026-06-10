/**
 * Derivation detector — shared logic for detecting derivation methods
 * and finding the most immediate parent model from a model name.
 *
 * Used by both sync-models.js (for new models during ingest) and
 * backfill-derivations.js (for existing models).
 */

/**
 * Detect derivation method from a model name.
 * Returns null for foundation/original models.
 */
function detectDerivationMethod(name) {
  if (!name) return null;
  const n = name.toLowerCase();

  // Order matters: most specific first. A model named
  // "Mistral-7B-Instruct-DPO" should be DPO, not finetune.

  // 1. Merge methods
  if (/\bmerge\b/.test(n) || /\bslerp\b/.test(n) || /ties.merge/i.test(n)) {
    return 'merge';
  }

  // 2. Distillation
  if (/\bdistill\b/.test(n) || /\bdistil\b/.test(n)) {
    return 'distillation';
  }

  // 3. DPO / preference optimization variants
  if (/\bdpo\b/.test(n) || /\borpo\b/.test(n) || /\brdpo\b/.test(n) ||
      /\bsimpo\b/.test(n) || /\bcpo\b/.test(n) || /\bkto\b/.test(n) ||
      /\bipo\b/.test(n) || /\bspo\b/.test(n)) {
    return 'dpo';
  }

  // 4. Continued pretraining
  if (/\bcpt\b/.test(n) || /\bcontinued.pretrain/i.test(n)) {
    return 'continued_pretraining';
  }

  // 5. LoRA adapter
  if (/\blora\b/.test(n) && !/\bflora\b/i.test(n)) {
    return 'lora_adapter';
  }

  // 6. Fine-tune (most common, check last)
  if (/instruct/i.test(n) || /\bchat\b/.test(n) || /\bsft\b/.test(n) ||
      /\bft\b/.test(n) || /fine.tun/i.test(n)) {
    return 'finetune';
  }

  return null;
}

/**
 * Find the most immediate parent model for a derivative.
 * Returns { parentSlug, parentName } or null.
 *
 * "Most immediate parent" means the model whose name is the longest
 * substring match within the derivative's name — the closest ancestor
 * in the derivation chain.
 *
 * @param {string} childName - The derivative model name
 * @param {Map<string, {name: string, slug: string}>} candidates - Map of slug → {name, slug} for all possible parents
 */
function findImmediateParent(childName, candidates) {
  if (!childName || candidates.size === 0) return null;

  const childLower = childName.toLowerCase();
  const childSlug = nameToSlug(childName);

  // For distillation models (e.g. "DeepSeek-R1-Distill-Qwen-1.5B"),
  // the base/student model is named after "Distill", not the teacher.
  // Run the matcher on both the full name and the post-distill suffix;
  // a match in the suffix takes priority over a full-name match that
  // includes a derivation keyword (the teacher model name).
  const distillMatch = /\bdistil[il]\b/i.exec(childName);
  const suffixName = distillMatch
    ? childName.slice(distillMatch.index + distillMatch[0].length).trim()
    : null;

  const result = findBestSubstringMatch(childLower, childSlug, candidates);
  const suffixResult = suffixName
    ? findBestSubstringMatch(suffixName.toLowerCase(), nameToSlug(suffixName), candidates)
    : null;

  // For distillation models, the substring match on the full name usually
  // finds the teacher (e.g. "DeepSeek-R1"), not the student base. Prefer
  // the suffix match. If the suffix found nothing, skip the teacher and
  // let token-overlap find the actual parent.
  let bestParent = null;
  if (suffixResult) {
    bestParent = suffixResult;
  } else if (!distillMatch) {
    bestParent = result;
  }
  // distillMatch && !suffixResult → skip result, go to token fallback

  // Fallback: token-overlap matching for cross-creator cases
  if (!bestParent) {
    bestParent = findImmediateParentByTokens(childName, candidates);
  }

  return bestParent;
}

function findBestSubstringMatch(childLower, childSlug, candidates) {
  let bestParent = null;
  let bestLen = 0;

  for (const [slug, { name }] of candidates) {
    const candLower = name.toLowerCase();

    // Skip self
    if (candLower === childLower) continue;

    // Skip if both normalize to same slug (case variant)
    if (nameToSlug(name) === childSlug) continue;

    // Parent name must be a substring of the child name
    if (!childLower.includes(candLower)) continue;

    // Filter trivial matches: must contain a digit OR be >= 6 chars
    const hasDigit = /\d/.test(candLower);
    if (!hasDigit && candLower.length < 6) continue;

    // Must be at least 4 chars to avoid false matches on common words
    if (candLower.length < 4) continue;

    // Prefer longest match (closest ancestor shares most name tokens)
    if (candLower.length > bestLen) {
      bestLen = candLower.length;
      bestParent = { parentSlug: slug, parentName: name };
    }
  }

  return bestParent;
}

/**
 * Tokenize a model name into significant tokens for matching.
 * Strips common derivation words and separators.
 */
const DERIVATION_TOKENS = new Set([
  'instruct', 'chat', 'base', 'sft', 'ft', 'dpo', 'orpo', 'rdpo', 'simpo',
  'cpo', 'kto', 'ipo', 'spo', 'merge', 'slerp', 'distill', 'distil', 'lora',
  'cpt', 'fine', 'tune', 'tuned', 'finetune', 'finetuned', 'continued',
  'pretraining', 'pretrain', 'adapter', 'model', 'weights', 'gguf', 'gptq',
  'awq', 'bnb', 'fp16', 'fp32', 'bf16', 'fp8', 'int4', 'int8', 'quantized',
  'quant', 'v0', 'v1', 'v2', 'v3', 'v4', 'v5',
]);

function tokenizeForMatching(name) {
  if (!name) return [];
  const tokens = name.toLowerCase()
    .replace(/[()]/g, ' ')
    .split(/[\s\-_/,]+/)
    .filter(Boolean);
  return tokens.filter(t => !DERIVATION_TOKENS.has(t) && t.length >= 2);
}

/**
 * Token-overlap fallback for cross-creator parent matching.
 * Handles cases like "DeepSeek-R1-Distill-Qwen-1.5B" where the parent
 * "Qwen2-1.5B" does not appear as a substring.
 */
function findImmediateParentByTokens(childName, candidates) {
  const childTokens = tokenizeForMatching(childName);
  if (childTokens.length === 0) return null;

  const childSlug = nameToSlug(childName);
  let best = null;
  let bestScore = 0;

  for (const [slug, { name }] of candidates) {
    const candLower = name.toLowerCase();
    if (candLower === childName.toLowerCase()) continue;
    if (nameToSlug(name) === childSlug) continue;

    const candTokens = tokenizeForMatching(name);
    if (candTokens.length === 0) continue;

    // Count candidate tokens matched in child tokens.
    // A match is: exact equality, or one prefixes the other
    // (e.g., "qwen2" prefixes "qwen"), or a numeric token matches
    // exactly (e.g., "1.5b" matches "1.5b").
    let matched = 0;
    let totalWeight = 0;
    for (const ct of candTokens) {
      const isNumeric = /\d/.test(ct);
      totalWeight += isNumeric ? 2 : 1; // numeric tokens are strong signals
      for (const childT of childTokens) {
        if (ct === childT ||
            (ct.length >= 3 && childT.length >= 3 &&
             (ct.startsWith(childT) || childT.startsWith(ct)))) {
          matched += isNumeric ? 2 : 1;
          break;
        }
      }
    }

    const score = totalWeight > 0 ? matched / totalWeight : 0;

    // Require strong match: >= 60% token overlap, and at least one
    // numeric token must match if the candidate has any digits.
    const hasNumeric = candTokens.some(t => /\d/.test(t));
    const numericMatched = !hasNumeric || candTokens.filter(t => /\d/.test(t)).some(ct =>
      childTokens.some(childT => ct === childT)
    );

    if (score >= 0.6 && numericMatched && matched >= 2) {
      // Prefer candidates with more tokens (more specific match)
      const specificity = candTokens.length + matched;
      if (specificity > bestScore) {
        bestScore = specificity;
        best = { parentSlug: slug, parentName: name };
      }
    }
  }

  return best;
}

function nameToSlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { detectDerivationMethod, findImmediateParent, nameToSlug };
