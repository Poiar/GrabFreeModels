#!/usr/bin/env node
/**
 * merge-duplicate-supers.js
 * Merge duplicate super_models using models.dev catalog as the authority for
 * which slug-named super should map to which display-named super.
 *
 * Usage:
 *   node scripts/merge-duplicate-supers.js [--apply]
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');
const { PROVIDER_MAP } = require('./utils/provider-map');

const CATALOG_URL = 'https://models.dev/catalog.json';
const APPLY = process.argv.includes('--apply');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
          return resolve(httpsGet(res.headers.location));
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
          else resolve(JSON.parse(data));
        });
      })
      .on('error', reject);
  });
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-{2,}/g, '-');
}

function stripCreatorPrefix(name) {
  return name
    .replace(/^[A-Za-z][A-Za-z0-9.-]*[A-Za-z][A-Za-z0-9.-]*:\s*/i, '')
    .replace(/^[a-z][a-z0-9-]*\/(?=[A-Z])/, '')
    .trim();
}

function cleanMdName(mdName) {
  let name = stripCreatorPrefix(mdName);
  name = name
    .replace(/\s*\(free\)\s*$/i, '')
    .replace(/\s*\(latest\)\s*$/i, '')
    .replace(/\s+Free$/i, '')
    .trim();
  return name;
}

(async () => {
  console.error('Fetching models.dev catalog.json...');
  const catalog = await httpsGet(CATALOG_URL);
  const providers = catalog.providers || {};

  // Build models.dev lookup by slug
  const mdBySlug = new Map();
  for (const [provId, provData] of Object.entries(providers)) {
    for (const [modelId, modelData] of Object.entries(provData.models || {})) {
      const entry = { providerId: provId, modelId, name: modelData.name || modelId };
      const slug = slugify(entry.name);
      if (!mdBySlug.has(slug)) mdBySlug.set(slug, []);
      mdBySlug.get(slug).push(entry);
      const idSlug = slugify(modelId);
      if (idSlug !== slug) {
        if (!mdBySlug.has(idSlug)) mdBySlug.set(idSlug, []);
        mdBySlug.get(idSlug).push(entry);
      }
    }
  }

  // Reverse provider map
  const reverseProviderMap = {};
  for (const [mdProv, ourSlug] of Object.entries(PROVIDER_MAP)) {
    if (!ourSlug) continue;
    if (!reverseProviderMap[ourSlug]) reverseProviderMap[ourSlug] = [];
    reverseProviderMap[ourSlug].push(mdProv);
  }

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
    // Get all slug-named supers with their datapoints
    const { rows: slugSupers } = await client.query(`
      SELECT sm.id, sm.name, sm.slug,
             COALESCE(json_agg(json_build_object(
               'provider_slug', dp.slug, 'model_instance_key', dm.model_instance_key
             )) FILTER (WHERE dp.slug IS NOT NULL), '[]'::json) as datapoints
      FROM super_models sm
      LEFT JOIN datapoint_models dm ON dm.super_model_id = sm.id
      LEFT JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE sm.name !~ '[A-Z]' AND sm.name ~ '-'
      GROUP BY sm.id, sm.name, sm.slug
    `);

    // For each slug-named super, find what its display name SHOULD be
    // Then check if another super already has that display name
    const merges = [];

    for (const sm of slugSupers) {
      const dps = sm.datapoints || [];
      const mdDp = dps.find((d) => d.provider_slug === 'modelsdev');
      const nonMdDps = dps.filter((d) => d.provider_slug && d.provider_slug !== 'modelsdev');

      let mdEntry = null;

      // Find models.dev entry
      if (mdDp) {
        const candidates = mdBySlug.get(slugify(mdDp.model_instance_key)) || [];
        if (candidates.length === 1) mdEntry = candidates[0];
        else if (candidates.length > 1) {
          mdEntry =
            candidates.find((c) => mdDp.model_instance_key.startsWith(c.providerId + '/')) ||
            candidates[0];
        }
      }
      if (!mdEntry) {
        const candidates = mdBySlug.get(sm.slug);
        if (candidates && candidates.length === 1) mdEntry = candidates[0];
        else if (candidates && candidates.length > 1) {
          for (const dp of nonMdDps) {
            const mdProvs = reverseProviderMap[dp.provider_slug] || [];
            const m = candidates.find((c) => mdProvs.includes(c.providerId));
            if (m) {
              mdEntry = m;
              break;
            }
          }
          if (!mdEntry) mdEntry = candidates[0];
        }
      }
      if (!mdEntry) continue;

      // Get the display name from models.dev
      const mdDisplayName = cleanMdName(mdEntry.name);
      if (mdDisplayName === sm.name) continue; // Same — no rename needed

      // Check if another super already has this display name
      const {
        rows: [existing],
      } = await client.query(
        'SELECT id, name, slug FROM super_models WHERE name = $1 AND id != $2',
        [mdDisplayName, sm.id],
      );
      if (!existing) continue; // No collision — rename would succeed

      // Found a duplicate pair: source=sm, target=existing
      // Verify they're the same model by checking they match the same models.dev entry
      const alreadyIn = merges.find((m) => m.source_id === sm.id || m.source_id === existing.id);
      if (alreadyIn) {
        // If existing is already a target and sm is different, add sm as another source
        if (alreadyIn.target_id === existing.id && sm.id !== alreadyIn.source_id) {
          // Already covered — source merging into same target
        }
        continue;
      }

      merges.push({
        source_id: sm.id,
        source_name: sm.name,
        source_slug: sm.slug,
        target_id: existing.id,
        target_name: existing.name,
        target_slug: existing.slug,
        reason: `models.dev: ${mdEntry.providerId}/${mdEntry.modelId} → "${mdDisplayName}"`,
      });
    }

    // Also handle Creator: Name format supers whose stripped name collides
    const { rows: creatorPrefixSupers } = await client.query(`
      SELECT sm.id, sm.name, sm.slug
      FROM super_models sm
      WHERE sm.name ~ '^[A-Z][a-zA-Z0-9.-]+: '
    `);
    for (const cps of creatorPrefixSupers) {
      const stripped = cps.name.replace(/^[A-Z][a-zA-Z0-9.-]+: /, '');
      const {
        rows: [existing],
      } = await client.query(
        'SELECT id, name, slug FROM super_models WHERE name = $1 AND id != $2',
        [stripped, cps.id],
      );
      if (!existing) continue;
      const alreadyIn = merges.find(
        (m) =>
          m.source_id === cps.id ||
          m.target_id === cps.id ||
          m.source_id === existing.id ||
          m.target_id === existing.id,
      );
      if (alreadyIn) continue;
      merges.push({
        source_id: cps.id,
        source_name: cps.name,
        source_slug: cps.slug,
        target_id: existing.id,
        target_name: existing.name,
        target_slug: existing.slug,
        reason: 'strip creator prefix: ' + stripped,
      });
    }

    if (merges.length === 0) {
      // Also try simpler slug-match for any remaining
      const { rows: slugPairs } = await client.query(`
        SELECT DISTINCT ON (LEAST(s1.id, s2.id), GREATEST(s1.id, s2.id))
          LEAST(s1.id, s2.id) as id_a, GREATEST(s1.id, s2.id) as id_b,
          s1.name as name_a, s2.name as name_b,
          s1.slug as slug_a, s2.slug as slug_b,
          regexp_replace(lower(s1.name), '[^a-z0-9]+', '-', 'g') as match_key
        FROM super_models s1
        JOIN super_models s2 ON
          s2.id != s1.id
          AND regexp_replace(lower(s1.name), '[^a-z0-9]+', '-', 'g') =
              regexp_replace(lower(s2.name), '[^a-z0-9]+', '-', 'g')
        WHERE (s1.name !~ '[A-Z]' AND s1.name ~ '-' AND s2.name ~ '[A-Z]' AND s2.name ~ ' ')
           OR (s2.name !~ '[A-Z]' AND s2.name ~ '-' AND s1.name ~ '[A-Z]' AND s1.name ~ ' ')
      `);
      for (const sp of slugPairs) {
        const alreadyIn = merges.find(
          (m) =>
            m.source_id === sp.id_a ||
            m.source_id === sp.id_b ||
            m.target_id === sp.id_a ||
            m.target_id === sp.id_b,
        );
        if (alreadyIn) continue;
        // Display name = target
        const target = sp.name_a.match(/[A-Z]/) && sp.name_a.includes(' ') ? 'a' : 'b';
        merges.push({
          source_id: target === 'a' ? sp.id_b : sp.id_a,
          source_name: target === 'a' ? sp.name_b : sp.name_a,
          source_slug: target === 'a' ? sp.slug_b : sp.slug_a,
          target_id: target === 'a' ? sp.id_a : sp.id_b,
          target_name: target === 'a' ? sp.name_a : sp.name_b,
          target_slug: target === 'a' ? sp.slug_a : sp.slug_b,
          reason: 'slug match: ' + sp.match_key,
        });
      }
    }

    console.log(`Total merges to perform: ${merges.length}\n`);

    if (!APPLY) {
      console.log('Dry-run. Would merge:');
      for (const m of merges) {
        console.log(
          `  "${m.source_name}" (id=${m.source_id}) → "${m.target_name}" (id=${m.target_id})`,
        );
        console.log(`    reason: ${m.reason}`);
      }
      console.log(`\nUse --apply to execute ${merges.length} merges.`);
      return;
    }

    let merged = 0,
      skipped = 0,
      errors = 0;
    for (const m of merges) {
      try {
        await client.query('BEGIN');

        // Move non-conflicting datapoints from source to target
        await client.query(
          `
          UPDATE datapoint_models dm
          SET super_model_id = $2
          WHERE super_model_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM datapoint_models dm2
              WHERE dm2.super_model_id = $2
                AND dm2.datapoint_provider_id = dm.datapoint_provider_id
                AND dm2.model_instance_key = dm.model_instance_key
            )
        `,
          [m.source_id, m.target_id],
        );

        // Delete remaining source datapoints (duplicates on target)
        await client.query('DELETE FROM datapoint_models WHERE super_model_id = $1', [m.source_id]);

        // Delete the source super_model
        await client.query('DELETE FROM super_models WHERE id = $1', [m.source_id]);

        await client.query('COMMIT');
        merged++;
      } catch (e) {
        await client.query('ROLLBACK');
        if (String(e.message).includes('violates foreign key')) {
          skipped++;
        } else {
          errors++;
          console.log(`  ERROR ${m.source_name}: ${e.message.slice(0, 120)}`);
        }
      }
    }

    console.log(`Merged: ${merged}, Skipped: ${skipped}, Errors: ${errors}`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
