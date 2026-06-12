#!/usr/bin/env node
/**
 * fetch-fastchat-registry.js
 * Fetches the LMSYS FastChat model_registry.py and extracts lineage hints
 * from model descriptions (e.g. "fine-tuned from X", "ORPO fine-tuned of Y").
 *
 * Maps discovered parent model names to our super_models and backfills
 * base_model + derivation_method for confident matches.
 *
 * Usage: node scripts/fetch-fastchat-registry.js [--apply]
 *   --apply  : Persist base_model updates to PostgreSQL (default: dry-run)
 */

require('dotenv').config();
const https = require('https');
const pool = require('../server/db');
const logger = require('./utils/logger');
const { nameToSlug } = require('./utils/derivation-detector');

const APPLY = process.argv.includes('--apply');
const REGISTRY_URL =
  'https://raw.githubusercontent.com/lm-sys/FastChat/main/fastchat/model/model_registry.py';

// ── Network helpers ──────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(httpGet(res.headers.location));
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          else resolve(data);
        });
      })
      .on('error', reject);
  });
}

// ── Parsers ──────────────────────────────────────────────────

/**
 * Parse register_model_info() calls from FastChat's model_registry.py.
 * The format spans multiple lines:
 *   register_model_info(
 *       ["model-a", "model-b"],
 *       "SimpleName",
 *       "https://link",
 *       "description text",
 *   )
 */
function parseRegistry(pySource) {
  const results = [];

  // Multiline regex — [\s\S] matches across lines, ,? handles trailing comma
  const regex =
    /register_model_info\(\s*\[([\s\S]*?)\],\s*"([^"]+)",\s*"([^"]+)",\s*"([\s\S]*?)",?\s*\)/g;
  let match;

  while ((match = regex.exec(pySource)) !== null) {
    const namesRaw = match[1];
    const simpleName = match[2];
    const link = match[3];
    const description = match[4].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    // Parse quoted model names from the array
    const nameStrs = namesRaw.match(/"([^"]+)"/g);
    const modelIds = nameStrs ? nameStrs.map((n) => n.replace(/"/g, '')) : [];

    results.push({ modelIds, simpleName, link, description });
  }

  return results;
}

/** Standard list of words to strip from parent hint extraction */
const STOP_SUFFIXES = [
  'by',
  'across',
  'and',
  'with',
  'to',
  'on',
  'developed',
  'for',
  'from',
  'using',
  'via',
  'that',
  'a',
  'the',
  'of',
];

/**
 * Extract a clean parent model name from a lineage hint phrase.
 * The hint is the raw text after "fine-tuned from" etc.
 * Try to isolate just the model name, stripping commentary.
 */
function cleanParentHint(hint) {
  // If the hint starts with a known model name pattern, extract it
  // Examples: "Mixtral-8x22B-v0.1" → keep as-is
  //           "Mistral by Hugging Face" → just "Mistral"
  //           "LLaMA with ChatGPT self-chat data and..." → "LLaMA"

  let cleaned = hint.replace(/[)]+$/g, '').trim();

  // Try splitting on stop words and taking the first meaningful part
  const words = cleaned.split(/\s+/);
  const stopIdx = words.findIndex(
    (w) => STOP_SUFFIXES.includes(w.toLowerCase()) && words.indexOf(w) > 0,
  );

  if (stopIdx > 0) {
    const prefix = words.slice(0, stopIdx).join(' ');
    // Only use the prefix if it looks like a real model name (has digits or is >= 2 words)
    if (/\d/.test(prefix) || prefix.split(/\s+/).length >= 2) {
      cleaned = prefix;
    }
  }

  return cleaned;
}

// ── Lineage pattern matching ─────────────────────────────────

const LINEAGE_PATTERNS = [
  { re: /ORPO fine-?tuned of\s+(.+?)(?:[,.]|$)/i, type: 'dpo' },
  { re: /DPO fine-?tuned of\s+(.+?)(?:[,.]|$)/i, type: 'dpo' },
  { re: /fine-?tuned from\s+(.+?)(?:[,.]|$)/i, type: 'finetune' },
  { re: /finetuned from\s+(.+?)(?:[,.]|$)/i, type: 'finetune' },
  { re: /trained from\s+(.+?)(?:[,.]|$)/i, type: 'finetune' },
  { re: /based on\s+(.+?)(?:[,.]|$)/i, type: 'finetune' },
  { re: /iteration of\s+(.+?)(?:[,.]|$)/i, type: 'finetune' },
  { re: /successor to\s+(.+?)(?:[,.]|$)/i, type: 'finetune' },
  { re: /improved version of\s+(.+?)(?:[,.]|$)/i, type: 'finetune' },
  { re: /derived from\s+(.+?)(?:[,.]|$)/i, type: 'finetune' },
];

function extractLineage(entry) {
  for (const pat of LINEAGE_PATTERNS) {
    const lm = entry.description.match(pat.re);
    if (lm) {
      const rawHint = lm[1].trim();
      const parentHint = cleanParentHint(rawHint);
      return { ...entry, parentHint, derivType: pat.type, source: `fastchat:${pat.type}` };
    }
  }
  return null;
}

// ── Mapping to super_models ──────────────────────────────────

/**
 * Try to match a parent model name (from FastChat description) to our
 * super_models. Uses cascading strategies:
 *  1. Exact slug match
 *  2. Slug suffix match (e.g. "Mixtral-8x22B" matches "mixtral-8x22b")
 *  3. Token-overlap match via derivation-detector
 *  4. Contains-match (parent name is substring of super_model name)
 */
function matchParentToDB(parentHint, candidates) {
  const hintSlug = nameToSlug(parentHint);
  const hintLower = parentHint
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  // Strategy 1: exact slug match
  for (const [slug, info] of candidates) {
    if (slug === hintSlug) return { slug, name: info.name };
  }

  // Strategy 2: suffix match (parent slug ends with hint slug or vice versa)
  for (const [slug, info] of candidates) {
    if (slug.endsWith(hintSlug) || hintSlug.endsWith(slug)) {
      return { slug, name: info.name };
    }
  }

  // Strategy 3: token overlap — hint tokens must be a subset of candidate tokens
  const hintTokens = new Set(hintSlug.split('-').filter((t) => t.length >= 2 || /\d/.test(t)));
  if (hintTokens.size >= 2) {
    let best = null;
    let bestScore = 0;
    for (const [slug, info] of candidates) {
      const candTokens = new Set(slug.split('-'));
      const overlap = [...hintTokens].filter((t) => candTokens.has(t)).length;
      const score = overlap / hintTokens.size;
      if (score >= 0.6 && score > bestScore) {
        bestScore = score;
        best = { slug, name: info.name };
      }
    }
    if (best) return best;
  }

  // Strategy 4: substring containment (only for specific model names, not generic families)
  // Parent hint must contain a digit or be >= 10 chars to qualify as a specific model ID.
  // This prevents "Mistral" → matching random mistral-* variants incorrectly.
  const hasVersion = /\d/.test(parentHint);
  const isSpecific = hasVersion || parentHint.length >= 10;
  if (isSpecific) {
    const hintWords = hintLower.split(/\s+/).filter((w) => w.length >= 4);
    if (hintWords.length >= 1) {
      for (const [slug, info] of candidates) {
        const candLower = info.name.toLowerCase();
        for (const hw of hintWords) {
          if (candLower.includes(hw) && hw.length >= 5) {
            // For generic family names (no digits), require the candidate to also have a digit
            // so we don't match "Mistral" to just any model with "mistral" in the name
            if (hasVersion || /\d/.test(info.name)) {
              return { slug, name: info.name };
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Try to match child model IDs from FastChat into our super_models.
 * FastChat uses HuggingFace model IDs like "org/model-name".
 */
function matchChildToDB(modelIds, superByHfId, superBySlug, superByName) {
  for (const mid of modelIds) {
    // Direct HF ID match
    if (superByHfId.has(mid)) {
      return { super_id: superByHfId.get(mid).id, slug: superByHfId.get(mid).slug };
    }
    // Strip org, match slug
    const slash = mid.indexOf('/');
    const stripped = slash >= 0 ? mid.slice(slash + 1) : mid;
    const slug = nameToSlug(stripped);
    if (superBySlug.has(slug)) return { super_id: superBySlug.get(slug).id, slug };
    // Try name match
    if (superByName.has(stripped.toLowerCase())) {
      return {
        super_id: superByName.get(stripped.toLowerCase()).id,
        slug: superByName.get(stripped.toLowerCase()).slug,
      };
    }
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────

(async () => {
  const client = await pool.connect();
  try {
    logger.info('[FastChat] Fetching model_registry.py...');
    const pySource = await httpGet(REGISTRY_URL);
    logger.info(`  Fetched ${pySource.length} bytes`);

    const entries = parseRegistry(pySource);
    logger.info(`  Parsed ${entries.length} model registry entries`);

    // Extract lineage hints
    const lineageEntries = entries.map(extractLineage).filter(Boolean);
    logger.info(`  Found ${lineageEntries.length} entries with lineage hints\n`);

    if (lineageEntries.length === 0) {
      logger.info('No lineage hints found — nothing to do.');
      return;
    }

    // Build super_model lookups
    const { rows: allSuper } = await client.query(`
      SELECT id, name, slug FROM super_models ORDER BY name
    `);
    logger.info(`  Loaded ${allSuper.length} super_models for matching`);

    const superBySlug = new Map(allSuper.map((r) => [r.slug, r]));
    const superByName = new Map(allSuper.map((r) => [r.name.toLowerCase(), r]));

    // Build HF ID → super_model via datapoint_models with huggingface source
    const { rows: hfRows } = await client.query(`
      SELECT dm.model_instance_key, sm.id, sm.slug
      FROM datapoint_models dm
      JOIN super_models sm ON sm.id = dm.super_model_id
      WHERE dm.datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'huggingface')
        AND NOT dm.is_removed
    `);
    const superByHfId = new Map(
      hfRows.map((r) => [r.model_instance_key, { id: r.id, slug: r.slug }]),
    );

    // Attempt to map each lineage entry
    const matches = []; // { child_id, child_slug, child_name, parent_slug, parent_name, derivType, confidence }
    const unmatched = [];

    for (const entry of lineageEntries) {
      // Find the child model in our DB
      const child = matchChildToDB(entry.modelIds, superByHfId, superBySlug, superByName);
      if (!child) {
        unmatched.push({
          modelIds: entry.modelIds.slice(0, 3),
          parentHint: entry.parentHint,
          reason: 'child not in DB',
        });
        continue;
      }

      // Find the parent model
      const parent = matchParentToDB(
        entry.parentHint,
        new Map(allSuper.map((r) => [r.slug, { name: r.name, slug: r.slug }])),
      );

      // Skip self-references
      if (parent && parent.slug === child.slug) {
        unmatched.push({
          modelIds: entry.modelIds.slice(0, 3),
          parentHint: entry.parentHint,
          reason: 'self-reference',
        });
        continue;
      }

      if (parent) {
        matches.push({
          child_id: child.super_id,
          child_slug: child.slug,
          child_name: entry.simpleName,
          parent_slug: parent.slug,
          parent_name: parent.name,
          derivType: entry.derivType,
          confidence: 'high',
          source: entry.source,
        });
      } else {
        unmatched.push({
          modelIds: entry.modelIds.slice(0, 3),
          parentHint: entry.parentHint,
          reason: 'parent not in DB',
        });
      }
    }

    // ── Display results ──
    logger.info(`  Matched: ${matches.length}`);
    logger.info(`  Unmatched: ${unmatched.length}\n`);

    for (const m of matches) {
      logger.info(`  ✓ ${m.child_slug}  →  ${m.parent_slug}  [${m.derivType}, ${m.confidence}]`);
      logger.info(`    ${m.source}: "${m.child_name}"`);
    }

    if (unmatched.length > 0) {
      logger.info('\n--- Unmatched ---');
      for (const u of unmatched.slice(0, 15)) {
        logger.info(`  ✗ [${u.modelIds.join(', ')}]  →  "${u.parentHint}"  (${u.reason})`);
      }
      if (unmatched.length > 15) {
        logger.info(`  ... and ${unmatched.length - 15} more`);
      }
    }

    if (!APPLY) {
      logger.info(`\nDry run — use --apply to update ${matches.length} super_models.`);
      return;
    }

    // ── Apply ──
    let updated = 0;
    await client.query('BEGIN');

    // Cycle guard: load current base_model map
    const { rows: currentBm } = await client.query(
      `SELECT slug, base_model FROM super_models WHERE base_model IS NOT NULL`,
    );
    const parentMap = new Map(currentBm.map((r) => [r.slug, r.base_model]));

    // Add proposed changes for cycle checking
    const tempMap = new Map(parentMap);

    for (const m of matches) {
      // Check cycle before applying
      let current = m.parent_slug;
      const visited = new Set([m.child_slug]);
      let wouldCycle = false;
      while (tempMap.has(current)) {
        if (visited.has(current)) {
          wouldCycle = true;
          break;
        }
        visited.add(current);
        current = tempMap.get(current);
      }

      if (wouldCycle) {
        logger.info(`  SKIP ${m.child_slug} → ${m.parent_slug}: would create cycle`);
        continue;
      }

      await client.query(
        `UPDATE super_models
         SET base_model = COALESCE(super_models.base_model, $1),
             derivation_method = COALESCE(super_models.derivation_method, $2)
         WHERE id = $3`,
        [m.parent_slug, m.derivType, m.child_id],
      );
      tempMap.set(m.child_slug, m.parent_slug);
      updated++;
    }

    await client.query('COMMIT');
    logger.info(`\n  Updated ${updated} super_models with base_model from FastChat.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
