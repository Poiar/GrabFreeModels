#!/usr/bin/env node
/**
 * fetch-crfm-ecosystem.js
 *
 * Fetches and parses the Stanford CRFM Ecosystem Graphs — 173 YAML files
 * with structured model metadata including explicit `dependencies` fields
 * that track which upstream models a given model was derived from.
 *
 * This is the most authoritative model lineage data source available,
 * maintained by Stanford's Center for Research on Foundation Models.
 *
 * Repo: https://github.com/stanford-crfm/ecosystem-graphs
 * Data: assets/*.yaml (one file per organization)
 *
 * Each YAML file contains an array of assets (models, datasets, etc.).
 * Model assets have:
 *   - name: model name
 *   - organization: creator org
 *   - dependencies: [list of upstream model/dataset names]
 *   - type: "model" or "dataset"
 *   - size, modality, description, etc.
 *
 * This script:
 *   1. Lists all YAML files from the GitHub API
 *   2. Fetches each YAML file
 *   3. Parses model entries with dependencies that reference other models
 *   4. Maps child/parent models to our super_models
 *   5. Backfills base_model relationships
 *
 * Usage: node scripts/fetch-crfm-ecosystem.js [--apply]
 *   --apply  : Persist base_model updates to PostgreSQL (default: dry-run)
 */

require('dotenv').config();
const https = require('https');
const pool = require('../server/db');
const logger = require('./utils/logger');
const { nameToSlug } = require('./utils/derivation-detector');

const APPLY = process.argv.includes('--apply');
const REPO_API = 'https://api.github.com/repos/stanford-crfm/ecosystem-graphs/contents/assets';
const RAW_BASE = 'https://raw.githubusercontent.com/stanford-crfm/ecosystem-graphs/main/assets/';
const REQUEST_DELAY_MS = 200; // GitHub API rate limiting

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(httpsGet(res.headers.location));
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

// ── Lightweight YAML line parser (avoids js-yaml dependency) ──

/**
 * Parse a CRFM YAML asset file into individual asset entries.
 * Each entry starts with "- " at column 0 (YAML list item).
 * Within each entry, fields are indented with 2 spaces.
 */
function parseYamlAssets(yamlText) {
  const entries = [];
  const lines = yamlText.split('\n');
  let current = null;
  let currentKey = null;
  let currentDeps = null;

  for (const line of lines) {
    // New list item
    if (line.startsWith('- ') && !line.startsWith('-  ')) {
      if (current) {
        if (currentDeps && currentDeps.length > 0) {
          current.dependencies = currentDeps;
        }
        entries.push(current);
      }
      current = { dependencies: [] };
      currentDeps = [];
      currentKey = null;
      // Parse inline key: value
      const rest = line.slice(2);
      const colonIdx = rest.indexOf(':');
      if (colonIdx >= 0) {
        currentKey = rest.slice(0, colonIdx).trim();
        current[currentKey] = rest.slice(colonIdx + 1).trim();
      }
      continue;
    }

    if (!current) continue;

    // Field continuation — indented content
    const trimmed = line.trim();
    if (!trimmed) {
      currentKey = null;
      continue;
    }

    // Check if this is a new key:value
    if (line.match(/^ {2}[a-z_]+\s*:/i) && !line.startsWith('    ')) {
      const colonIdx = trimmed.indexOf(':');
      currentKey = colonIdx >= 0 ? trimmed.slice(0, colonIdx).trim() : null;
      const value = colonIdx >= 0 ? trimmed.slice(colonIdx + 1).trim() : '';

      if (currentKey === 'dependencies') {
        currentDeps = [];
      } else if (value && currentKey !== 'dependencies') {
        current[currentKey] = value;
      }
      continue;
    }

    // Dependency list item: "  - SomeModelName"
    if (line.match(/^\s+-\s+.+/) && line.trim().startsWith('- ')) {
      const depName = line.trim().slice(2).trim();
      if (depName && currentKey === 'dependencies') {
        currentDeps.push(depName);
      }
      continue;
    }

    // Continuation of previous field value
    if (currentKey && currentKey !== 'dependencies' && line.match(/^ {2}\S/)) {
      if (current[currentKey]) {
        current[currentKey] += ' ' + trimmed;
      } else {
        current[currentKey] = trimmed;
      }
    }
  }

  // Don't forget the last entry
  if (current) {
    if (currentDeps && currentDeps.length > 0) {
      current.dependencies = currentDeps;
    }
    entries.push(current);
  }

  return entries;
}

/**
 * Determine if a dependency name refers to a model (not a dataset).
 * Datasets typically have generic names, are all-caps, or contain certain keywords.
 * Models are specific, often contain version numbers, organization prefixes, etc.
 */
const DATASET_PATTERNS = [
  /^(COCO|ImageNet|CIFAR|MNIST|SVHN|Pascal|ADE20K|Cityscapes|FFHQ|CelebA)/,
  /^(The )?(Pile|Stack|C4|mC4|OSCAR|CC-100|CC-?Net|RefinedWeb|Dolma|FineWeb|RedPajama)/,
  /^(Common\s*Crawl|WebText|OpenWebText|Wiki|Wikipedia|Books\d?|BookCorpus)/,
  /^(GitHub|StackExchange|Stack\s*Overflow|ArXiv|PubMed|Reddit|YouTube|Flickr)/,
  /^(Conceptual\s*Captions|Localized\s*Narratives|Visual\s*Genome|SBU\s*Captions)/,
  /^(Red\s*Caps|YFCC|LAION|WIT|WITs|DCLM)/,
  /^(UniRef|Swiss-Prot|TrEMBL|Protein|GenBank|RefSeq|UniProt)/,
  /^(JFT|OpenImages|Object365|LVIS|nuScenes|Waymo|KITTI)/,
  / dataset$/i,
  / Dataset$/,
  / corpus$/i,
  / Corpus$/,
];

function isModelDependency(name) {
  // Models usually have version indicators, brand names, or specific formats
  // Datasets are typically all-caps acronyms or have "dataset" in the name
  if (DATASET_PATTERNS.some((p) => p.test(name))) return false;

  // If it has no spaces and no uppercase letters after the first, probably a slug/key
  // If it contains a version number or is a known model name pattern, it's a model
  if (/\d/.test(name)) return true; // Has version number
  if (name.length > 20 && !name.includes(' ')) return true; // Long single-word = likely model ID
  if (
    /^(GPT|Claude|Gemini|Llama|Mistral|Falcon|BLOOM|Phi|OLMo|MPT|DALL|Stable|Whisper|Codex|Instruct|PALM|Gemma|Nemotron|DeepSeek|Qwen|Yi|Command|Jamba|DBRX|Diffusion)/i.test(
      name,
    )
  )
    return true;

  // Generic short names without version numbers are likely datasets
  if (!/\d/.test(name) && name.length < 15 && name === name.toUpperCase()) return false;

  return false;
}

// ── Model name normalization for matching ──

function normalizeForMatch(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Main ─────────────────────────────────────────────────────

(async () => {
  const client = await pool.connect();
  try {
    logger.info('[CRFM Ecosystem] Listing YAML assets...');
    const fileListJson = await httpsGet(REPO_API);
    const fileList = JSON.parse(fileListJson);
    const yamlFiles = fileList.filter((f) => f.name.endsWith('.yaml')).map((f) => f.name);

    logger.info(`  Found ${yamlFiles.length} YAML files`);

    // Load all super_models for matching
    const { rows: allSuper } = await client.query(`
      SELECT id, name, slug FROM super_models ORDER BY name
    `);
    const superBySlug = new Map(allSuper.map((r) => [r.slug, r]));
    const superByName = new Map(
      allSuper.map((r) => [normalizeForMatch(r.name), { id: r.id, slug: r.slug, name: r.name }]),
    );

    logger.info(`  Loaded ${allSuper.length} super_models for matching\n`);

    // Process each YAML file
    const allModelEntries = []; // { org, name, dependencies, size }
    let filesProcessed = 0;

    for (const filename of yamlFiles) {
      await sleep(REQUEST_DELAY_MS);

      try {
        const yamlText = await httpsGet(RAW_BASE + filename);
        const entries = parseYamlAssets(yamlText);

        // Filter for model entries with model dependencies
        for (const entry of entries) {
          if (entry.type !== 'model') continue;
          if (!entry.dependencies || entry.dependencies.length === 0) continue;

          const modelDeps = entry.dependencies.filter(isModelDependency);
          if (modelDeps.length === 0) continue;

          allModelEntries.push({
            org: entry.organization || filename.replace('.yaml', ''),
            name: entry.name,
            size: entry.size || '',
            dependencies: modelDeps,
          });
        }

        filesProcessed++;
        if (filesProcessed % 50 === 0) {
          logger.info(
            `  Processed ${filesProcessed}/${yamlFiles.length} files (${allModelEntries.length} models with deps)`,
          );
        }
      } catch {
        // Some YAML files may be unparseable — skip
      }
    }

    logger.info(
      `\n  Total: ${allModelEntries.length} models with model dependencies across ${filesProcessed} files\n`,
    );

    // ── Match to our super_models ──
    const discoveries = []; // { child_slug, child_name, parent_name, parent_slug, org }

    for (const entry of allModelEntries) {
      // Find child model in our DB
      const childNorm = normalizeForMatch(entry.name);
      let child = superByName.get(childNorm);

      if (!child) {
        // Try slug match
        const childSlug = nameToSlug(entry.name);
        child = superBySlug.get(childSlug);
      }

      if (!child) {
        // Try: strip org prefix from name, e.g. "Meta/Llama 3" → "Llama 3"
        const stripped = entry.name.replace(/^[A-Za-z]+\s*\/\s*/, '');
        if (stripped !== entry.name) {
          const strippedNorm = normalizeForMatch(stripped);
          child = superByName.get(strippedNorm);
        }
      }

      if (!child) continue; // Model not in our DB

      // For each model dependency, try to find the parent in our DB
      for (const depName of entry.dependencies) {
        const depNorm = normalizeForMatch(depName);
        let parent = superByName.get(depNorm);

        if (!parent) {
          const depSlug = nameToSlug(depName);
          parent = superBySlug.get(depSlug);
        }

        if (!parent) {
          // Try various normalizations
          const variations = [
            depName.replace(/\s+/g, '-').toLowerCase(),
            depName.replace(/[^a-z0-9]/gi, ''),
            depName.replace(/\d+(\.\d+)?[Bb]$/, '').trim(), // strip size like "8B" or "405B"
          ];
          for (const v of variations) {
            parent = superBySlug.get(v);
            if (parent) break;
            // Partial slug match
            for (const [slug, s] of superBySlug) {
              if (slug.endsWith(v) || v.endsWith(slug)) {
                parent = s;
                break;
              }
            }
            if (parent) break;
          }
        }

        if (parent && parent.slug !== child.slug) {
          discoveries.push({
            child_slug: child.slug,
            child_name: child.name,
            parent_slug: parent.slug,
            parent_name: parent.name,
            org: entry.org,
            dep_name: depName,
          });
          break; // Only take the first matching parent
        }
      }
    }

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const d of discoveries) {
      const key = `${d.child_slug}→${d.parent_slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(d);
      }
    }

    logger.info(`  Matched to DB: ${unique.length} lineage links`);
    logger.info('');

    for (const d of unique.slice(0, 30)) {
      logger.info(`  ${d.child_slug}  →  ${d.parent_slug}  (${d.org}: ${d.dep_name})`);
    }
    if (unique.length > 30) {
      logger.info(`  ... and ${unique.length - 30} more`);
    }

    if (!APPLY) {
      logger.info(`\nDry run — use --apply to update ${unique.length} super_models.`);
      return;
    }

    // ── Apply ──
    let updated = 0;
    let skipped = 0;
    await client.query('BEGIN');

    for (const d of unique) {
      // Cycle guard
      const { rows: chain } = await client.query(
        `WITH RECURSIVE chain AS (
           SELECT slug, base_model, 1 AS depth FROM super_models WHERE slug = $1
           UNION ALL
           SELECT sm.slug, sm.base_model, c.depth + 1
           FROM super_models sm JOIN chain c ON sm.slug = c.base_model
           WHERE c.depth < 20 AND sm.base_model IS NOT NULL
         ) SELECT slug FROM chain WHERE slug = $2`,
        [d.parent_slug, d.child_slug],
      );
      if (chain.length > 0) {
        skipped++;
        continue;
      }

      await client.query(
        `UPDATE super_models
         SET base_model = COALESCE(super_models.base_model, $1),
             derivation_method = COALESCE(super_models.derivation_method, 'finetune')
         WHERE slug = $2 AND base_model IS NULL`,
        [d.parent_slug, d.child_slug],
      );
      updated++;
    }

    await client.query('COMMIT');
    logger.info(`\n  Updated ${updated} super_models with base_model from CRFM.`);
    if (skipped > 0) logger.info(`  Skipped ${skipped} (would create cycle).`);
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
