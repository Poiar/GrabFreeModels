#!/usr/bin/env node
/**
 * fix-names-from-modelsdev.js
 * Generate UPDATE statements to align super_models.name with models.dev display names.
 * Dry-run by default — outputs SQL that you can review before applying.
 *
 * Usage:
 *   node scripts/fix-names-from-modelsdev.js [--apply]
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');
const { PROVIDER_MAP } = require('./utils/provider-map');

const CATALOG_URL = 'https://models.dev/catalog.json';
const APPLY = process.argv.includes('--apply');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(httpsGet(res.headers.location));
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
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/-{2,}/g, '-');
}

function normalizeName(name) {
  return name
    .replace(/\s*\(free\)\s*/gi, '').replace(/\s*\(free tier\)\s*/gi, '')
    .replace(/^coding[-_]/i, '').replace(/^xiaomi[-_]/i, '')
    .replace(/\s*:free\s*/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function stripCreatorPrefix(name) {
  return name.replace(/^[A-Za-z][A-Za-z0-9.-]*[A-Za-z][A-Za-z0-9.-]*:\s*/i, '')
             .replace(/^[a-z][a-z0-9-]*\/(?=[A-Z])/, '').trim();
}

function isSlugLike(name) {
  return !/\s/.test(name) && /[a-z]/.test(name) && !/[A-Z]/.test(name);
}

function looksLikeDisplayName(name) {
  // A proper display name has spaces, mixed case, doesn't look like a slug
  if (!/\s/.test(name)) return false;           // no spaces = slug
  if (/^[a-z0-9-]+$/.test(name)) return false;  // all lowercase slug
  // Reject names that are obviously bad
  if (/^[a-z][a-z0-9-]*\/[a-z]/.test(name)) return false;  // lower/upper mismatch = org prefix
  return true;
}

function cleanMdName(mdName) {
  let name = stripCreatorPrefix(mdName);
  // Strip trailing "(free)", "(latest)" etc. — we track those elsewhere
  name = name.replace(/\s*\(free\)\s*$/i, '').replace(/\s*\(latest\)\s*$/i, '').trim();
  // Strip " Free" suffix
  name = name.replace(/\s+Free$/i, '').trim();
  return name;
}

(async () => {
  // 1. Fetch catalog
  console.error('Fetching models.dev catalog.json...');
  const catalog = await httpsGet(CATALOG_URL);
  const providers = catalog.providers || {};

  // Build models.dev lookup: slug → { providerId, modelId, name }
  const mdBySlug = new Map();
  for (const [provId, provData] of Object.entries(providers)) {
    for (const [modelId, modelData] of Object.entries(provData.models || {})) {
      const entry = { providerId: provId, modelId, name: modelData.name || modelId };
      const slug = slugify(entry.name);
      if (!mdBySlug.has(slug)) mdBySlug.set(slug, []);
      mdBySlug.get(slug).push(entry);
      // Also index by model ID slug
      const idSlug = slugify(modelId);
      if (idSlug !== slug) {
        if (!mdBySlug.has(idSlug)) mdBySlug.set(idSlug, []);
        mdBySlug.get(idSlug).push(entry);
      }
    }
  }

  // 2. Build reverse provider map
  const reverseProviderMap = {};
  for (const [mdProv, ourSlug] of Object.entries(PROVIDER_MAP)) {
    if (!ourSlug) continue;
    if (!reverseProviderMap[ourSlug]) reverseProviderMap[ourSlug] = [];
    reverseProviderMap[ourSlug].push(mdProv);
  }

  // 3. Connect DB
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { console.error('DATABASE_URL not set'); process.exit(1); }
  const pool = new Pool({
    connectionString: connectionString.includes('uselibpqcompat')
      ? connectionString : connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require'),
    ssl: { rejectUnauthorized: false }, max: 3,
  });
  const client = await pool.connect();

  try {
    const { rows: superModels } = await client.query(`
      SELECT sm.id, sm.name, sm.slug,
             COALESCE(json_agg(json_build_object(
               'provider_slug', dp.slug, 'model_instance_key', dm.model_instance_key
             )) FILTER (WHERE dp.slug IS NOT NULL), '[]'::json) as datapoints
      FROM super_models sm
      LEFT JOIN datapoint_models dm ON dm.super_model_id = sm.id
      LEFT JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      GROUP BY sm.id, sm.name, sm.slug
      ORDER BY sm.name
    `);

    const fixes = [];

    for (const sm of superModels) {
      const dps = sm.datapoints || [];
      const mdDp = dps.find(d => d.provider_slug === 'modelsdev');
      const nonMdDps = dps.filter(d => d.provider_slug && d.provider_slug !== 'modelsdev');

      // Find models.dev entry
      let mdEntry = null;

      // Try modelsdev datapoint
      if (mdDp) {
        const candidates = mdBySlug.get(slugify(mdDp.model_instance_key)) || [];
        if (candidates.length === 1) mdEntry = candidates[0];
        else if (candidates.length > 1) {
          mdEntry = candidates.find(c => mdDp.model_instance_key.startsWith(c.providerId + '/')) || candidates[0];
        }
      }

      // Try slug match
      if (!mdEntry) {
        const candidates = mdBySlug.get(sm.slug);
        if (candidates && candidates.length === 1) mdEntry = candidates[0];
        else if (candidates && candidates.length > 1) {
          for (const dp of nonMdDps) {
            const mdProvs = reverseProviderMap[dp.provider_slug] || [];
            const m = candidates.find(c => mdProvs.includes(c.providerId));
            if (m) { mdEntry = m; break; }
          }
          if (!mdEntry) mdEntry = candidates[0];
        }
      }

      if (!mdEntry) continue;

      // Compare names
      const ourName = sm.name;
      const mdRawName = mdEntry.name;

      // Skip if exact match
      if (ourName === mdRawName) continue;

      // Clean the models.dev name
      const mdClean = cleanMdName(mdRawName);

      // Skip if same after cleaning
      if (ourName === mdClean) continue;
      if (normalizeName(ourName) === normalizeName(mdClean)) continue;

      // --- Gate: only fix when it's a clear improvement ---

      const mdIsDisplay = looksLikeDisplayName(mdClean);

      // 1. Our name has a "Creator: " prefix → always fix (our naming error)
      const ourHasCreatorPrefix = /^[A-Z][a-zA-Z0-9.-]+:\s/.test(ourName);
      if (ourHasCreatorPrefix) {
        const ourStripped = ourName.replace(/^[A-Z][a-zA-Z0-9.-]+:\s/, '');
        // If stripped gives a proper display name, use it
        if (looksLikeDisplayName(ourStripped)) {
          fixes.push({ id: sm.id, slug: sm.slug, old_name: ourName, new_name: ourStripped,
            md_raw: mdRawName, md_provider: mdEntry.providerId, md_model_id: mdEntry.modelId,
            reason: 'strip_creator_prefix' });
          continue;
        }
        // If stripped is still slug-like, fall through to slug→display logic below
        // But use the stripped name as the effective "ourName" for that comparison
      }

      // Determine the effective name to compare (may be stripped of creator prefix)
      const effectiveName = ourHasCreatorPrefix
        ? ourName.replace(/^[A-Z][a-zA-Z0-9.-]+:\s/, '')
        : ourName;
      const effectiveIsSlug = isSlugLike(effectiveName);

      // 2. Our effective name is a slug, models.dev has a display name → adopt
      if (effectiveIsSlug && mdIsDisplay) {
        // Don't adopt names with colons (creator prefixes we don't want)
        if (/:/.test(mdClean)) continue;
        // Don't adopt names that start with a slash-prefix pattern
        if (/^[A-Z][a-zA-Z0-9-]+\//.test(mdClean)) continue;
        // Don't expand short model codes into vendor-prefixed names
        // (e.g. "o1" stays "o1", not "OpenAI o1" — AA convention)
        if (/^o\d/.test(effectiveName) && mdClean.toLowerCase().endsWith(effectiveName.toLowerCase())) continue;

        fixes.push({ id: sm.id, slug: sm.slug, old_name: ourName, new_name: mdClean,
          md_raw: mdRawName, md_provider: mdEntry.providerId, md_model_id: mdEntry.modelId,
          reason: ourHasCreatorPrefix ? 'strip_creator_prefix+slug→display' : 'slug→display' });
        continue;
      }

      // 3. Both are display names — only fix if our name has clear problems mdClean fixes
      // Skip: vendor prefix additions (our AA convention strips them)
      const ourFirstWord = effectiveName.split(' ')[0].toLowerCase();
      const mdFirstWord = mdClean.split(' ')[0].toLowerCase();
      if (ourFirstWord !== mdFirstWord && mdClean.length > effectiveName.length + 2) {
        continue;
      }

      // 4. Our name has a version date in parens, models.dev doesn't → consider adopting
      const ourHasDateSuffix = /\s*\(\d{2}-\d{4}\)$/.test(effectiveName);
      if (ourHasDateSuffix && !/:/.test(mdClean)) {
        fixes.push({ id: sm.id, slug: sm.slug, old_name: ourName, new_name: mdClean,
          md_raw: mdRawName, md_provider: mdEntry.providerId, md_model_id: mdEntry.modelId,
          reason: 'drop_date_suffix' });
        continue;
      }
    }

    // Output
    console.log(`-- ${fixes.length} super_models.name updates from models.dev\n`);

    if (APPLY) {
      let updated = 0;
      for (const f of fixes) {
        try {
          await client.query('UPDATE super_models SET name = $1 WHERE id = $2', [f.new_name, f.id]);
          updated++;
        } catch (e) {
          console.error(`  ERROR updating ${f.slug}: ${e.message}`);
        }
      }
      console.log(`Applied ${updated} updates.`);
    } else {
      for (const f of fixes) {
        console.log(`-- [${f.reason}] ${f.md_provider}/${f.md_model_id}  (raw: "${f.md_raw}")`);
        console.log(`UPDATE super_models SET name = '${f.new_name.replace(/'/g, "''")}' WHERE id = ${f.id};  -- was: "${f.old_name}"`);
        console.log();
      }
      console.log(`\n-- Dry-run. Use --apply to execute ${fixes.length} updates.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
