#!/usr/bin/env node
/**
 * import-modelsdev-backfill.js
 * Match remaining masters to models.dev by normalizing remote_ids and names.
 * Uses multiple normalization strategies for fuzzy matching.
 *
 * Usage: node scripts/import-modelsdev-backfill.js [--apply]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const MODELSDEV_FILE = path.join(__dirname, '..', 'modelsdev-free-models.json');
const raw = JSON.parse(fs.readFileSync(MODELSDEV_FILE, 'utf8'));
const mdModels = raw.models;

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 })
  : new Pool({ host: process.env.PGHOST || 'localhost', port: parseInt(process.env.PGPORT || '5432', 10), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, max: 3 });

function strip(rid) {
  let r = rid.toLowerCase();
  // Strip all provider prefixes
  while (r.includes('/')) r = r.split('/').pop();
  // Strip :free / -free
  r = r.replace(/:free$/, '').replace(/-free$/, '');
  // Strip trailing underscores/dots format like solar-10_7b -> solar-10-7b
  r = r.replace(/_/g, '-');
  return r;
}

function noHyphens(s) { return s.replace(/-/g, ''); }
function noDots(s) { return s.replace(/\./g, '-'); }

(async () => {
  const client = await pool.connect();
  try {
    const { rows: pr } = await client.query("SELECT id FROM datapoint_providers WHERE slug = 'modelsdev'");
    if (!pr.length) { console.error('Run import-modelsdev.js first'); process.exit(1); }
    const provId = pr[0].id;

    const { rows: existingDps } = await client.query(
      "SELECT remote_id FROM datapoint_models WHERE datapoint_provider_id = $1", [provId]
    );
    const insertedIds = new Set(existingDps.map(r => r.remote_id.toLowerCase()));

    // Build multi-key index from models.dev
    const mdIndex = new Map(); // key -> { modelId, modelName, ... }
    for (const m of mdModels) {
      const variants = new Set();
      const s1 = strip(m.modelId);
      variants.add(s1);
      variants.add(noHyphens(s1));
      variants.add(noDots(s1));
      variants.add(noHyphens(noDots(s1)));
      // Also strip common suffixes
      const s2 = s1.replace(/-(instruct|chat|v\d+|it|\d+b)$/, '');
      variants.add(s2);
      variants.add(noHyphens(s2));
      for (const v of variants) {
        if (!mdIndex.has(v)) mdIndex.set(v, m);
      }
    }

    // Get unmatched masters with their best datapoint for matching
    const { rows: unmatched } = await client.query(`
      SELECT DISTINCT ON (mm.id)
        mm.id AS super_id, mm.name AS super_name,
        dm.remote_id, dp.slug AS provider_slug
      FROM super_models mm
      JOIN datapoint_models dm ON dm.super_model_id = mm.id
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE NOT EXISTS (
        SELECT 1 FROM datapoint_models dm2
        JOIN datapoint_providers dp2 ON dp2.id = dm2.datapoint_provider_id
        WHERE dm2.super_model_id = mm.id AND dp2.slug = 'modelsdev'
      )
      ORDER BY mm.id, dm.id
    `);

    console.log(`Unmatched masters: ${unmatched.length}\n`);

    let found = 0, notFound = 0, inserted = 0;

    for (const row of unmatched) {
      const rid = strip(row.remote_id);
      const ridNoHyphens = noHyphens(rid);

      // Try matching with all normalization variants
      let md = mdIndex.get(rid)
        || mdIndex.get(ridNoHyphens)
        || mdIndex.get(noDots(rid))
        || mdIndex.get(noHyphens(noDots(rid)))
        || mdIndex.get(rid.replace(/-(instruct|chat|v\d+|it|\d+b)$/, ''))
        || mdIndex.get(noHyphens(rid.replace(/-(instruct|chat|v\d+|it|\d+b)$/, '')));

      // Try matching by master name vs models.dev modelName
      if (!md) {
        const cleanName = row.super_name.replace(/\s*\(free\)\s*/gi, '').trim().toLowerCase();
        for (const m of mdModels) {
          const mdClean = m.modelName.replace(/\s*\(free\)\s*/gi, '').trim().toLowerCase();
          if (mdClean === cleanName || noHyphens(mdClean) === noHyphens(cleanName)) {
            md = m;
            break;
          }
        }
      }

      if (!md) {
        notFound++;
        if (notFound <= 30) console.log(`  SKIP: ${row.super_name} (${row.provider_slug}/${row.remote_id})`);
        continue;
      }

      found++;
      const mdRemoteId = md.modelId;
      if (insertedIds.has(mdRemoteId.toLowerCase())) continue;

      if (APPLY) {
        try {
          const ctxLen = md.contextLimit && md.contextLimit > 0 ? md.contextLimit : null;
          const { rows: dpIns } = await client.query(
            `INSERT INTO datapoint_models
               (super_model_id, datapoint_provider_id, remote_id, full_id,
                context_length, input_price_per_million, output_price_per_million,
                is_free, supports_tools, status_result, status_detail)
             VALUES ($1,$2,$3,$4,$5,0::numeric,0::numeric,true,$6,'untested','From models.dev')
             ON CONFLICT (datapoint_provider_id, remote_id) DO NOTHING
             RETURNING id`,
            [row.super_id, provId, mdRemoteId, `modelsdev/${mdRemoteId}`, ctxLen, md.toolCall ? true : null]
          );
          if (dpIns.length > 0) {
            insertedIds.add(mdRemoteId.toLowerCase());
            const dpId = dpIns[0].id;
            const feats = [];
            if (md.family) feats.push(['family', md.family]);
            if (md.releaseDate) feats.push(['release_date', md.releaseDate]);
            if (md.reasoning) feats.push(['supports_reasoning', 'true']);
            for (const [ft, fv] of feats) {
              await client.query('INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [dpId, ft, fv]);
            }
            inserted++;
          }
        } catch (err) {
          console.error(`  Error ${row.super_name}: ${err.message}`);
        }
      }
    }

    console.log(`\nFound: ${found}, Not found: ${notFound}`);
    if (APPLY) {
      console.log(`Inserted: ${inserted}`);
      const { rows: cnt } = await client.query(
        "SELECT COUNT(DISTINCT dm.super_model_id) FROM datapoint_models dm JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id WHERE dp.slug = 'modelsdev'"
      );
      console.log(`Masters with modelsdev: ${cnt[0].count}`);
    } else {
      console.log('\nDry-run. Use --apply to write.');
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
