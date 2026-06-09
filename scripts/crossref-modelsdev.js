#!/usr/bin/env node
/**
 * crossref-modelsdev.js
 * Cross-reference our super_model names against models.dev's canonical catalog.
 * Read-only diagnostic — no DB writes.
 *
 * Usage:
 *   node scripts/crossref-modelsdev.js [--summary] [--mismatches] [--missing] [--all] [--json <path>]
 *
 * --summary     : Counts per category (default)
 * --mismatches  : List every name mismatch with both names
 * --missing     : List models with no models.dev counterpart
 * --all         : Full report, all categories
 * --json <path> : Machine-readable JSON output
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');
const fs = require('fs');
const { PROVIDER_MAP } = require('./utils/provider-map');

const CATALOG_URL = 'https://models.dev/catalog.json';

const args = process.argv.slice(2);
const SHOW_SUMMARY = args.includes('--summary') || args.length === 0;
const SHOW_MISMATCHES = args.includes('--mismatches') || args.includes('--all');
const SHOW_MISSING = args.includes('--missing') || args.includes('--all');
const SHOW_ALL = args.includes('--all');
const JSON_OUT = (() => { const i = args.indexOf('--json'); return i >= 0 ? args[i + 1] : null; })();

// --- Helpers ---

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpsGet(res.headers.location));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(JSON.parse(data));
      });
    }).on('error', reject);
  });
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeName(name) {
  return name
    .replace(/\s*\(free\)\s*/gi, '')
    .replace(/\s*\(free tier\)\s*/gi, '')
    .replace(/^coding[-_]/i, '')
    .replace(/^xiaomi[-_]/i, '')
    .replace(/\s*:free\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripCreatorPrefix(name) {
  // Strip "Creator: " or "Creator/" prefix from models.dev names
  return name.replace(/^[A-Za-z][A-Za-z0-9.-]*[A-Za-z][A-Za-z0-9.-]*:\s*/i, '')
             .replace(/^[a-z][a-z0-9-]*\/(?=[A-Z])/, '')
             .trim();
}

function isSlugLike(name) {
  // If the name looks like a slug (no spaces, all lowercase, contains hyphens)
  // rather than a display name, it's not a useful comparison target
  return !/\s/.test(name) && /[a-z]/.test(name) && !/[A-Z]/.test(name);
}

function namesMatch(ourName, mdName) {
  // Exact
  if (ourName === mdName) return 'exact';

  // Strip creator prefix from models.dev name and re-compare
  const mdStripped = stripCreatorPrefix(mdName);

  // Exact after stripping creator prefix
  if (ourName === mdStripped) return 'exact';

  // Normalize both and compare
  const na = normalizeName(ourName);
  const nb = normalizeName(mdStripped);
  if (na === nb) return 'close';

  // Slug comparison
  if (slugify(ourName) === slugify(mdStripped)) return 'close';

  // If models.dev name is just a slug, and our name is a proper display name,
  // consider it a match (our display name is better)
  if (isSlugLike(mdName) && !isSlugLike(ourName)) return 'close';

  return 'mismatch';
}

// --- Build reverse PROVIDER_MAP ---
// PROVIDER_MAP: models.dev providerId -> our slug
// Reverse: our slug -> [models.dev providerIds]
function buildReverseProviderMap() {
  const rev = {};
  for (const [mdProv, ourSlug] of Object.entries(PROVIDER_MAP)) {
    if (!ourSlug) continue;
    if (!rev[ourSlug]) rev[ourSlug] = [];
    rev[ourSlug].push(mdProv);
  }
  return rev;
}

// --- Main ---

(async () => {
  // 1. Fetch models.dev catalog
  console.error('Fetching models.dev catalog.json...');
  let catalog;
  try {
    catalog = await httpsGet(CATALOG_URL);
  } catch (e) {
    console.error(`Failed to fetch catalog: ${e.message}`);
    process.exit(1);
  }

  const providers = catalog.providers || {};
  const totalMdModels = Object.values(providers).reduce((s, p) => s + Object.keys(p.models || {}).length, 0);
  console.error(`Got ${totalMdModels} models across ${Object.keys(providers).length} providers\n`);

  // 2. Build models.dev lookups
  // By (providerId, modelId) — the composite key for an exact model identity
  const mdByProviderModel = new Map();
  // By normalized slug (from model.name or model.id)
  const mdBySlug = new Map();
  // By normalized name
  const mdByNormName = new Map();

  for (const [provId, provData] of Object.entries(providers)) {
    for (const [modelId, modelData] of Object.entries(provData.models || {})) {
      const entry = {
        providerId: provId,
        providerName: provData.name || provId,
        modelId,
        modelName: modelData.name || modelId,
        family: modelData.family,
        free: (modelData.cost?.input ?? 1) === 0 && (modelData.cost?.output ?? 1) === 0,
      };

      // By provider+model
      mdByProviderModel.set(`${provId}/${modelId}`, entry);

      // By model name slug
      const nameSlug = slugify(entry.modelName);
      if (!mdBySlug.has(nameSlug)) mdBySlug.set(nameSlug, []);
      mdBySlug.get(nameSlug).push(entry);

      // By model ID slug (fallback)
      const idSlug = slugify(modelId);
      if (idSlug !== nameSlug) {
        if (!mdBySlug.has(idSlug)) mdBySlug.set(idSlug, []);
        mdBySlug.get(idSlug).push(entry);
      }

      // By normalized name
      const norm = normalizeName(entry.modelName);
      if (!mdByNormName.has(norm)) mdByNormName.set(norm, []);
      mdByNormName.get(norm).push(entry);
    }
  }

  // 3. Connect to DB
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: connectionString.includes('uselibpqcompat')
      ? connectionString
      : connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require'),
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  const client = await pool.connect();

  try {
    // Get all super_models with their datapoints
    const { rows: superModels } = await client.query(`
      SELECT sm.id, sm.name, sm.slug, sm.creator,
             COALESCE(json_agg(
               json_build_object(
                 'provider_slug', dp.slug,
                 'model_instance_key', dm.model_instance_key,
                 'full_id', dm.full_id
               )
             ) FILTER (WHERE dp.slug IS NOT NULL), '[]'::json) as datapoints
      FROM super_models sm
      LEFT JOIN datapoint_models dm ON dm.super_model_id = sm.id
      LEFT JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      GROUP BY sm.id, sm.name, sm.slug, sm.creator
      ORDER BY sm.name
    `);

    // Build reverse provider map
    const reverseProviderMap = buildReverseProviderMap();

    // 4. Match each super_model against models.dev
    const results = {
      exact_match: [],
      close_match: [],
      name_mismatch: [],
      no_match: [],
      unmapped_provider: [],
    };

    // Also track models.dev entries that matched (to find unmatched models.dev entries)
    const matchedMdEntries = new Set();

    for (const sm of superModels) {
      const dps = sm.datapoints || [];
      const mdDp = dps.find(d => d.provider_slug === 'modelsdev');
      const nonMdDps = dps.filter(d => d.provider_slug && d.provider_slug !== 'modelsdev');

      let bestMatch = null;
      let matchMethod = 'none';

      // Pass 1: Direct modelsdev datapoint
      if (mdDp) {
        const mdModelId = mdDp.model_instance_key;
        // Match by model ID slug against all catalog entries
        const mdSlug = slugify(mdModelId);
        const candidates = mdBySlug.get(mdSlug) || [];
        if (candidates.length === 1) {
          bestMatch = candidates[0];
          matchMethod = 'modelsdev-datapoint';
        } else if (candidates.length > 1) {
          // Pick the one whose providerId matches the modelId prefix, or first
          const prefixed = candidates.find(c => mdModelId.startsWith(c.providerId + '/'));
          bestMatch = prefixed || candidates[0];
          matchMethod = 'modelsdev-datapoint';
        }
      }

      // Pass 2: Slug match against models.dev catalog
      if (!bestMatch) {
        const candidates = mdBySlug.get(sm.slug);
        if (candidates && candidates.length === 1) {
          bestMatch = candidates[0];
          matchMethod = 'slug';
        } else if (candidates && candidates.length > 1) {
          // Prefer candidate whose provider maps to one of our providers
          for (const dp of nonMdDps) {
            const mdProvs = reverseProviderMap[dp.provider_slug] || [];
            const matched = candidates.find(c => mdProvs.includes(c.providerId));
            if (matched) { bestMatch = matched; matchMethod = 'slug+provider'; break; }
          }
          if (!bestMatch) { bestMatch = candidates[0]; matchMethod = 'slug'; }
        }
      }

      // Pass 3: Name normalization match
      if (!bestMatch) {
        const normName = normalizeName(sm.name);
        const candidates = mdByNormName.get(normName);
        if (candidates && candidates.length === 1) {
          bestMatch = candidates[0];
          matchMethod = 'name';
        } else if (candidates && candidates.length > 1) {
          for (const dp of nonMdDps) {
            const mdProvs = reverseProviderMap[dp.provider_slug] || [];
            const matched = candidates.find(c => mdProvs.includes(c.providerId));
            if (matched) { bestMatch = matched; matchMethod = 'name+provider'; break; }
          }
          if (!bestMatch) { bestMatch = candidates[0]; matchMethod = 'name'; }
        }
      }

      // Pass 4: Provider + model_instance_key match
      if (!bestMatch) {
        for (const dp of nonMdDps) {
          const mdProvs = reverseProviderMap[dp.provider_slug] || [];
          for (const mdProv of mdProvs) {
            const mik = dp.model_instance_key || '';
            // Try various forms of the model_instance_key
            const keysToTry = [mik];
            // If mik includes a /, try the part after the last /
            const lastSlash = mik.lastIndexOf('/');
            if (lastSlash >= 0) {
              keysToTry.push(mik.slice(lastSlash + 1));
            }
            for (const key of keysToTry) {
              const entry = mdByProviderModel.get(`${mdProv}/${key}`);
              if (entry) {
                bestMatch = entry;
                matchMethod = 'provider+key';
                break;
              }
              // Also try slug matching the key
              const keySlug = slugify(key);
              const provEntries = [];
              for (const [k, v] of mdByProviderModel) {
                if (k.startsWith(mdProv + '/') && slugify(k.split('/').slice(1).join('/')) === keySlug) {
                  provEntries.push(v);
                }
              }
              if (provEntries.length === 1) {
                bestMatch = provEntries[0];
                matchMethod = 'provider+key-slug';
                break;
              }
            }
            if (bestMatch) break;
          }
          if (bestMatch) break;
        }
      }

      // --- Categorize ---
      const result = {
        super_id: sm.id,
        our_name: sm.name,
        our_slug: sm.slug,
        our_creator: sm.creator,
        providers: dps.map(d => d.provider_slug).filter(Boolean),
        match_method: matchMethod,
      };

      if (!bestMatch) {
        // Check if model has any provider that maps to models.dev
        const hasMappedProvider = nonMdDps.some(dp => reverseProviderMap[dp.provider_slug]?.length > 0);
        if (!hasMappedProvider && nonMdDps.length > 0) {
          result.category = 'unmapped_provider';
          results.unmapped_provider.push(result);
        } else {
          result.category = 'no_match';
          results.no_match.push(result);
        }
      } else {
        matchedMdEntries.add(`${bestMatch.providerId}/${bestMatch.modelId}`);

        const matchQuality = namesMatch(sm.name, bestMatch.modelName);

        result.md_provider = bestMatch.providerId;
        result.md_model_id = bestMatch.modelId;
        result.md_name = bestMatch.modelName;
        result.md_free = bestMatch.free;

        if (matchQuality === 'exact') {
          result.category = 'exact_match';
          results.exact_match.push(result);
        } else if (matchQuality === 'close') {
          result.category = 'close_match';
          results.close_match.push(result);
        } else {
          result.category = 'name_mismatch';
          results.name_mismatch.push(result);
        }
      }
    }

    // Find models.dev entries with no match in our system
    const unmatchedMd = [];
    for (const [key, entry] of mdByProviderModel) {
      if (!matchedMdEntries.has(key)) {
        unmatchedMd.push(entry);
      }
    }

    // 5. Output
    const total = superModels.length;
    const matched = results.exact_match.length + results.close_match.length + results.name_mismatch.length;

    if (SHOW_SUMMARY || SHOW_ALL) {
      console.log('=== Cross-Reference Summary ===\n');
      console.log(`Super models total:            ${total}`);
      console.log(`Matched to models.dev:          ${matched} (${(matched/total*100).toFixed(1)}%)`);
      console.log(`  Exact name match:             ${results.exact_match.length}`);
      console.log(`  Close match (fmt diff only):  ${results.close_match.length}`);
      console.log(`  Name mismatch:                ${results.name_mismatch.length}`);
      console.log(`No models.dev entry found:      ${results.no_match.length}`);
      console.log(`Unmapped provider (can't check):${results.unmapped_provider.length}`);
      console.log(`\nmodels.dev catalog size:        ${totalMdModels}`);
      console.log(`models.dev entries unmatched:   ${unmatchedMd.length}`);
    }

    if (SHOW_MISMATCHES || SHOW_ALL) {
      console.log(`\n=== Name Mismatches (${results.name_mismatch.length}) ===\n`);
      for (const r of results.name_mismatch) {
        console.log(`  Our name:   ${r.our_name}`);
        console.log(`  MD name:    ${r.md_name}`);
        console.log(`  MD id:      ${r.md_provider}/${r.md_model_id}  (matched by: ${r.match_method})`);
        console.log();
      }
    }

    if (SHOW_MISSING || SHOW_ALL) {
      console.log(`\n=== No models.dev Entry (${results.no_match.length}) ===\n`);
      let shown = 0;
      for (const r of results.no_match) {
        if (shown >= (SHOW_ALL ? Infinity : 50)) {
          console.log(`  ... and ${results.no_match.length - shown} more`);
          break;
        }
        console.log(`  ${r.our_name}  (slug: ${r.our_slug}, providers: ${r.providers.join(', ')})`);
        shown++;
      }
    }

    if (JSON_OUT) {
      const jsonOutput = {
        generated: new Date().toISOString(),
        summary: {
          total_super_models: total,
          matched,
          exact_match: results.exact_match.length,
          close_match: results.close_match.length,
          name_mismatch: results.name_mismatch.length,
          no_match: results.no_match.length,
          unmapped_provider: results.unmapped_provider.length,
          md_catalog_size: totalMdModels,
          md_entries_unmatched: unmatchedMd.length,
        },
        exact_match: results.exact_match,
        close_match: results.close_match,
        name_mismatch: results.name_mismatch,
        no_match: results.no_match.slice(0, 200),
        unmapped_provider: results.unmapped_provider,
        unmatched_md_entries: unmatchedMd.slice(0, 200),
      };
      fs.writeFileSync(JSON_OUT, JSON.stringify(jsonOutput, null, 2));
      console.error(`\nJSON written to ${JSON_OUT}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
