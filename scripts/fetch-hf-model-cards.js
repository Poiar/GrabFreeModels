#!/usr/bin/env node
/**
 * fetch-hf-model-cards.js
 *
 * Directly fetches HuggingFace model card metadata for models in our DB that
 * lack base_model lineage. Uses the HF API single-model endpoint to retrieve
 * cardData (YAML frontmatter) which often contains explicit base_model declarations.
 *
 * This complements backfill-derivatives.js by:
 * 1. Targeting our super_models that have known HF model IDs but no lineage
 * 2. Using /api/models/{model_id} for richer per-model data than the list endpoint
 * 3. Parsing cardData.base_model and cardData.base_model_relation directly
 *
 * Usage: node scripts/fetch-hf-model-cards.js [--apply]
 *   --apply  : Persist base_model updates to PostgreSQL (default: dry-run)
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const pool = require('../server/db');
const logger = require('./utils/logger');
const { nameToSlug } = require('./utils/derivation-detector');

const APPLY = process.argv.includes('--apply');
const REQUEST_DELAY_MS = 250;
const BATCH_SIZE = 200;

// Load HF API token for authenticated model-card reads
const AUTH_FILE =
  process.env.GFM_AUTH_FILE ||
  path.join(
    process.env.XDG_DATA_HOME ||
      path.join(process.env.HOME || process.env.USERPROFILE, '.local', 'share'),
    'opencode',
    'auth.json',
  );

let hfToken = null;
try {
  const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  hfToken = auth.huggingface?.key || null;
  if (!hfToken) logger.warn('No HuggingFace API key in auth file — card fetches will return 400');
} catch (e) {
  logger.warn(`Could not load auth file (${AUTH_FILE}): ${e.message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'GrabFreeModels/1.0' };
    if (hfToken) headers.Authorization = `Bearer ${hfToken}`;

    https
      .get(url, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(httpsGet(res.headers.location));
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode === 404) return resolve(null);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Invalid JSON: ${e.message}`));
            }
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Find HF model IDs for super_models via our DB mappings.
 * Strategy cascade: datapoint_models with huggingface provider → slug match → name match.
 */
async function findHfIdsForModels(client) {
  // Get super_models without base_model, with their features that might contain HF IDs
  const { rows: models } = await client.query(`
    SELECT sm.id, sm.name, sm.slug
    FROM super_models sm
    WHERE sm.base_model IS NULL
      AND EXISTS (
        SELECT 1 FROM datapoint_models dm
        WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
      )
    ORDER BY sm.name
  `);

  // Get HF datapoint models for direct mapping
  const { rows: hfDms } = await client.query(`
    SELECT dm.model_instance_key AS hf_id, dm.super_model_id
    FROM datapoint_models dm
    WHERE dm.datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'huggingface')
      AND NOT dm.is_removed
  `);
  const hfIdBySuper = new Map();
  for (const r of hfDms) {
    if (!hfIdBySuper.has(r.super_model_id)) {
      hfIdBySuper.set(r.super_model_id, r.hf_id);
    }
  }

  // Also check external_source_models (from fetch-huggingface-hub.js)
  const { rows: esmRows } = await client.query(`
    SELECT esm.model_name AS hf_id, sm.id AS super_model_id, sm.slug
    FROM external_source_models esm
    JOIN external_source_providers esp ON esp.id = esm.external_source_provider_id
    JOIN sources s ON s.id = esm.source_id
    JOIN super_models sm ON normalize_model_slug(esm.model_name) = sm.slug
    WHERE s.slug = 'huggingface-hub'
  `);
  for (const r of esmRows) {
    if (!hfIdBySuper.has(r.super_model_id)) {
      hfIdBySuper.set(r.super_model_id, r.hf_id);
    }
  }

  // Build result list — only models we can map to an HF ID
  const targets = [];
  for (const m of models) {
    const hfId = hfIdBySuper.get(m.id);
    if (hfId) {
      targets.push({ ...m, hfId });
    }
  }

  return targets;
}

// ── Main ─────────────────────────────────────────────────────

(async () => {
  const client = await pool.connect();
  try {
    logger.info('[HF Model Cards] Finding models without lineage...');
    const targets = await findHfIdsForModels(client);
    logger.info(`  Found ${targets.length} models with HF IDs but no base_model`);

    // Limit to BATCH_SIZE per run to avoid excessive API calls
    const batch = targets.slice(0, BATCH_SIZE);
    if (targets.length > BATCH_SIZE) {
      logger.info(`  (processing first ${BATCH_SIZE})`);
    }
    logger.info('');

    // Fetch individual model data
    let fetched = 0;
    let withCardBM = 0;
    let withBaseModelTag = 0;
    const discoveries = []; // { child_id, child_slug, child_name, hfId, parentName, relation }

    for (const target of batch) {
      await sleep(REQUEST_DELAY_MS);

      try {
        // HF API needs literal slashes in the model ID — encodeURIComponent would break them
        const url = `https://huggingface.co/api/models/${target.hfId}?full=true`;
        const data = await httpsGet(url);
        fetched++;

        if (!data) continue; // 404 or missing

        const tags = data.tags || [];
        const cardData = data.cardData || {};

        let parentName = null;
        let relation = null;
        let source = null;

        // Check cardData.base_model (explicit YAML declaration)
        if (cardData.base_model && typeof cardData.base_model === 'string') {
          parentName = cardData.base_model.trim();
          relation = cardData.base_model_relation || 'finetune';
          source = 'cardData.base_model';
        }

        // Check tags (HF auto-generates these from cardData and model card)
        if (!parentName) {
          const finetuneTag = tags.find((t) => t.startsWith('base_model:finetune:'));
          const plainTag = tags.find(
            (t) => t.startsWith('base_model:') && !t.startsWith('base_model:finetune:'),
          );
          if (finetuneTag) {
            parentName = finetuneTag.replace('base_model:finetune:', '').trim();
            relation = 'finetune';
            source = 'tag(base_model:finetune)';
          } else if (plainTag) {
            parentName = plainTag.replace('base_model:', '').trim();
            relation = 'finetune';
            source = 'tag(base_model)';
          }
        }

        // Check cardData.base_model as an array or object (merge models)
        if (!parentName && cardData.base_model) {
          if (Array.isArray(cardData.base_model) && cardData.base_model.length > 0) {
            parentName = cardData.base_model[0]; // first merge source
            relation = 'merge';
            source = 'cardData.base_model[0]';
          }
        }

        if (parentName) {
          const parentSlug = nameToSlug(parentName);
          if (parentSlug !== target.slug) {
            discoveries.push({
              child_id: target.id,
              child_slug: target.slug,
              child_name: target.name,
              child_hfId: target.hfId,
              parentName,
              parentSlug,
              relation,
              source,
            });

            if (cardData.base_model) withCardBM++;
            else withBaseModelTag++;
          }
        }

        if (fetched % 50 === 0) {
          logger.info(
            `  Progress: ${fetched}/${batch.length} (${discoveries.length} with lineage)`,
          );
        }
      } catch {
        // Individual model errors shouldn't stop the batch
      }
    }

    logger.info(`\n  Fetched: ${fetched}/${batch.length}`);
    logger.info(`  With lineage from cardData: ${withCardBM}`);
    logger.info(`  With lineage from tags:    ${withBaseModelTag}`);
    logger.info(`  Total discoveries:         ${discoveries.length}`);

    // ── Map parent names to our super_models ──
    const { rows: allSuper } = await client.query(`SELECT id, name, slug FROM super_models`);
    const superBySlug = new Map(allSuper.map((r) => [r.slug, r]));
    const superByName = new Map(allSuper.map((r) => [r.name.toLowerCase(), r]));

    const matches = [];
    const unmapped = [];

    for (const d of discoveries) {
      // Try exact slug match
      let parent = superBySlug.get(d.parentSlug);
      if (!parent) {
        // Try stripping HF org prefix: "meta-llama/Llama-3.1-8B" → "llama-3.1-8b"
        const slash = d.parentName.indexOf('/');
        const stripped = slash >= 0 ? d.parentName.slice(slash + 1) : d.parentName;
        const strippedSlug = nameToSlug(stripped);
        parent = superBySlug.get(strippedSlug);
      }
      if (!parent) {
        // Try name-based matching (case-insensitive)
        parent = superByName.get(d.parentName.toLowerCase());
      }
      if (!parent) {
        // Try substring: parent slug suffix matches a super_model slug
        for (const [, s] of superBySlug) {
          if (s.slug.endsWith(d.parentSlug) || d.parentSlug.endsWith(s.slug)) {
            parent = s;
            break;
          }
        }
      }

      if (parent && parent.slug !== d.child_slug) {
        matches.push({
          ...d,
          parent_id: parent.id,
          parent_slug: parent.slug,
          parent_name: parent.name,
        });
      } else if (!parent) {
        unmapped.push(d);
      }
    }

    logger.info(`\n  Resolved to DB parents:  ${matches.length}`);
    logger.info(`  Unmapped (parent not in DB): ${unmapped.length}`);

    // Display matches
    logger.info('\n--- Lineage Discoveries ---');
    for (const m of matches.slice(0, 30)) {
      logger.info(`  ${m.child_slug}  →  ${m.parent_slug}  [${m.relation}]  via ${m.source}`);
      logger.info(`    ${m.child_hfId}  →  ${m.parentName}`);
    }
    if (matches.length > 30) {
      logger.info(`  ... and ${matches.length - 30} more`);
    }

    if (unmapped.length > 0) {
      logger.info('\n--- Unmapped Parents ---');
      for (const u of unmapped.slice(0, 10)) {
        logger.info(`  ${u.child_slug}  →  ${u.parentName} (${u.parentSlug}) — not in DB`);
      }
      if (unmapped.length > 10) {
        logger.info(`  ... and ${unmapped.length - 10} more`);
      }
    }

    if (!APPLY) {
      logger.info(`\nDry run — use --apply to update ${matches.length} super_models.`);
      return;
    }

    // ── Apply ──
    let updated = 0;
    await client.query('BEGIN');

    for (const m of matches) {
      // Simple cycle guard: skip if child == parent (shouldn't happen from filter above)
      if (m.child_slug === m.parent_slug) continue;

      await client.query(
        `UPDATE super_models
         SET base_model = COALESCE(super_models.base_model, $1),
             derivation_method = COALESCE(super_models.derivation_method, $2)
         WHERE id = $3 AND base_model IS NULL`,
        [m.parent_slug, m.relation, m.child_id],
      );
      updated++;
    }

    await client.query('COMMIT');
    logger.info(`\n  Updated ${updated} super_models with base_model from HF model cards.`);
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
