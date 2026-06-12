/**
 * Derivation detector — shared logic for detecting derivation methods
 * and finding the most immediate parent model from a model name.
 *
 * Used by both sync-models.js (for new models during ingest) and
 * backfill-derivations.js (for existing models).
 */

/**
 * Normalize a model name for fuzzy comparison: lowercase, collapse all
 * non-alphanumeric characters to a single space, trim, strip known
 * marketing suffixes. This makes "GPT-5" and "GPT 5" equivalent for
 * substring/token matching without changing slug generation.
 */
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\(free\)/g, '')
    .replace(/\(free tier\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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
  if (
    /\bdpo\b/.test(n) ||
    /\borpo\b/.test(n) ||
    /\brdpo\b/.test(n) ||
    /\bsimpo\b/.test(n) ||
    /\bcpo\b/.test(n) ||
    /\bkto\b/.test(n) ||
    /\bipo\b/.test(n) ||
    /\bspo\b/.test(n)
  ) {
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
  if (
    /instruct/i.test(n) ||
    /\bchat\b/.test(n) ||
    /\bsft\b/.test(n) ||
    /\bft\b/.test(n) ||
    /fine.tun/i.test(n)
  ) {
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
  const childNormalized = normalizeName(childName);
  const childSlug = nameToSlug(childName);

  // For distillation models (e.g. "DeepSeek-R1-Distill-Qwen-1.5B"),
  // the base/student model is named after "Distill", not the teacher.
  // Use normalized name so separator variations (DeepSeek R1 Distill vs
  // DeepSeek-R1-Distill) are both detected correctly.
  const distillMatch = /\bdistil[il]\b/i.exec(childNormalized);
  const suffixName = distillMatch
    ? childNormalized.slice(distillMatch.index + distillMatch[0].length).trim()
    : null;

  const result = findBestSubstringMatch(childLower, childSlug, candidates);
  const suffixResult = suffixName
    ? findBestSubstringMatch(suffixName, nameToSlug(suffixName), candidates)
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
  const childNormalized = normalizeName(childLower);
  let bestParent = null;
  let bestLen = 0;

  for (const [slug, { name }] of candidates) {
    const candNormalized = normalizeName(name);

    // Skip self
    if (candNormalized === childNormalized) continue;

    // Skip if both normalize to same slug (case/separator variant)
    if (nameToSlug(name) === childSlug) continue;

    // Parent normalized name must be a substring of the child normalized name
    if (!childNormalized.includes(candNormalized)) continue;

    // Filter trivial matches: must contain a digit OR be >= 6 chars
    const hasDigit = /\d/.test(candNormalized);
    if (!hasDigit && candNormalized.length < 6) continue;

    // Must be at least 4 chars to avoid false matches on common words
    if (candNormalized.length < 4) continue;

    // Prefer longest match (closest ancestor shares most name tokens)
    if (candNormalized.length > bestLen) {
      bestLen = candNormalized.length;
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
  'instruct',
  'chat',
  'base',
  'sft',
  'ft',
  'dpo',
  'orpo',
  'rdpo',
  'simpo',
  'cpo',
  'kto',
  'ipo',
  'spo',
  'merge',
  'slerp',
  'distill',
  'distil',
  'lora',
  'cpt',
  'fine',
  'tune',
  'tuned',
  'finetune',
  'finetuned',
  'continued',
  'pretraining',
  'pretrain',
  'adapter',
  'model',
  'weights',
  'gguf',
  'gptq',
  'awq',
  'bnb',
  'fp16',
  'fp32',
  'bf16',
  'fp8',
  'int4',
  'int8',
  'quantized',
  'quant',
  'v0',
  'v1',
  'v2',
  'v3',
  'v4',
  'v5',
  // Variant markers — indicate a specialized variant of a base model,
  // NOT a new model identity. Without these, sibling variants like
  // qwen2.5-coder and qwen2.5 are token-matched as parent/child.
  'coder',
  'code',
  'math',
  'vision',
  'vl', // vision-language
  'guard',
  'safe',
  'safety',
  'thinking',
  'reasoning',
  'agent',
  'search',
  'research',
  'deep',
  'mini',
  'small',
  'medium',
  'large',
  'xl',
  'xxl',
  'nano',
  'tiny',
  'lite',
  'turbo',
  'fast',
  'pro',
  'max',
  'plus',
  'flash',
  'think',
]);

function tokenizeForMatching(name) {
  if (!name) return [];
  const tokens = name
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .split(/[\s\-_/,]+/)
    .filter(Boolean);
  return tokens.filter((t) => !DERIVATION_TOKENS.has(t) && t.length >= 2);
}

/**
 * Token-overlap fallback for cross-creator parent matching.
 * Handles cases like "DeepSeek-R1-Distill-Qwen-1.5B" where the parent
 * "Qwen2-1.5B" does not appear as a substring.
 */
function findImmediateParentByTokens(childName, candidates) {
  const childNormalized = normalizeName(childName);
  const childTokens = tokenizeForMatching(childNormalized);
  if (childTokens.length === 0) return null;

  const childSlug = nameToSlug(childName);
  let best = null;
  let bestScore = 0;

  for (const [slug, { name }] of candidates) {
    const candNormalized = normalizeName(name);
    if (candNormalized === childNormalized) continue;
    if (nameToSlug(name) === childSlug) continue;

    const candTokens = tokenizeForMatching(candNormalized);
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
        if (
          ct === childT ||
          (ct.length >= 3 && childT.length >= 3 && (ct.startsWith(childT) || childT.startsWith(ct)))
        ) {
          matched += isNumeric ? 2 : 1;
          break;
        }
      }
    }

    const score = totalWeight > 0 ? matched / totalWeight : 0;

    // Require strong match: >= 60% token overlap, and at least one
    // numeric token must match if the candidate has any digits.
    const hasNumeric = candTokens.some((t) => /\d/.test(t));
    const numericMatched =
      !hasNumeric ||
      candTokens
        .filter((t) => /\d/.test(t))
        .some((ct) => childTokens.some((childT) => ct === childT));

    if (score >= 0.6 && numericMatched && matched >= 2) {
      // ── Sibling guard ──
      // Variant specialization words that define co-equal fine-tunes, NOT
      // lineage. E.g. "Qwen2.5-Coder-0.5B" and "Qwen2.5-0.5B" are siblings
      // (both fine-tunes of Qwen2.5), not parent/child. If the child name
      // has a specialization word the candidate lacks, and they share the
      // same numeric tokens, they're siblings — reject.
      const SPECIALIZATION_WORDS = new Set([
        'coder',
        'code',
        'math',
        'vision',
        'vl',
        'guard',
        'safe',
        'safety',
        'reasoning',
        'thinking',
        'agent',
        'search',
        'research',
        'deep',
        'mini',
        'small',
        'medium',
        'large',
        'xl',
        'xxl',
        'nano',
        'tiny',
        'lite',
        'turbo',
        'fast',
        'pro',
        'max',
        'plus',
      ]);
      const childWords = new Set(
        childName
          .toLowerCase()
          .split(/[\s\-_/,]+/)
          .filter(Boolean),
      );
      const candWords = new Set(
        name
          .toLowerCase()
          .split(/[\s\-_/,]+/)
          .filter(Boolean),
      );
      const childSpecWords = [...childWords].filter((w) => SPECIALIZATION_WORDS.has(w));
      const uniqueSpec = childSpecWords.filter((w) => !candWords.has(w));

      // If child has a specialization word the candidate doesn't, and both
      // share all numeric tokens (same model size), they're siblings.
      if (uniqueSpec.length > 0) {
        const childNums = new Set(childTokens.filter((t) => /\d/.test(t)));
        const candNums = new Set(candTokens.filter((t) => /\d/.test(t)));
        const sameSize =
          childNums.size > 0 && candNums.size > 0 && [...childNums].every((n) => candNums.has(n));
        if (sameSize) continue; // sibling variant, not parent
      }

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
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

module.exports = { detectDerivationMethod, findImmediateParent, normalizeName, nameToSlug };
