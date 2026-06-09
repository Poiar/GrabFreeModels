#!/usr/bin/env node
/**
 * backfill-derivatives.js
 *
 * Reads HuggingFace Hub model metadata (tags, cardData) from external_source_models
 * and backfills real training lineage into super_models:
 *   - base_model (the parent model slug)
 *   - base_creator (the parent model's creator organization)
 *   - derivation_method (finetune, merge, distillation, dpo, etc.)
 *
 * Keeps existing heuristic values as fallback for models without HF data.
 * Idempotent — safe to re-run.
 *
 * Usage: node scripts/backfill-derivatives.js [--apply]
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

// Methodology tags HF uses that map to derivation_method values
const METHOD_TAGS = {
  finetune: 'finetune',
  merge: 'merge',
  distillation: 'distillation',
  dpo: 'dpo',
  continued_pretraining: 'continued_pretraining',
  'continued-pretraining': 'continued_pretraining',
  lora: 'lora_adapter',
  'peft': 'lora_adapter',
};

const BASE_MODEL_TAG_PREFIX = 'base_model:';
const FINETUNE_TAG_PREFIX = 'base_model:finetune:';

function slugify(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Strip HF org prefix from model ID: "meta-llama/Llama-3.1-8B" → "Llama-3.1-8B" */
function stripOrg(modelId) {
  const slash = modelId.indexOf('/');
  return slash >= 0 ? modelId.slice(slash + 1) : modelId;
}

/** Parse derivation method from HF tags */
function parseMethod(tags) {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    const key = tag.toLowerCase().replace(/[_-]/g, '_');
    if (METHOD_TAGS[key]) return METHOD_TAGS[key];
  }
  return null;
}

/** Parse base_model references from HF tags */
function parseBaseModelTags(tags) {
  if (!Array.isArray(tags)) return [];
  const results = [];
  for (const tag of tags) {
    let modelId = null;
    let isFinetune = false;
    if (tag.startsWith(FINETUNE_TAG_PREFIX)) {
      modelId = tag.slice(FINETUNE_TAG_PREFIX.length);
      isFinetune = true;
    } else if (tag.startsWith(BASE_MODEL_TAG_PREFIX)) {
      modelId = tag.slice(BASE_MODEL_TAG_PREFIX.length);
    }
    if (modelId && modelId.length > 0) {
      results.push({ modelId, isFinetune });
    }
  }
  return results;
}

/** Parse base_model from cardData (explicit declaration in model card metadata) */
function parseCardDataBaseModel(cardData) {
  if (!cardData || typeof cardData !== 'object') return null;
  const bm = cardData.base_model;
  if (!bm || typeof bm !== 'string') return null;
  // Can be "meta-llama/Llama-3.1-8B" or just "Llama-3.1-8B"
  return bm.trim();
}

async function main() {
  const client = await pool.connect();
  const dryRun = !process.argv.includes('--apply');

  try {
    // 1. Get the huggingface-hub source ID
    const { rows: srcRows } = await client.query(
      `SELECT id FROM sources WHERE slug = 'huggingface-hub'`
    );
    if (srcRows.length === 0) {
      console.log('No huggingface-hub source found. Run fetch-huggingface-hub.js first?');
      return;
    }
    const hfSourceId = srcRows[0].id;

    // 2. Get the huggingface datapoint provider ID
    const { rows: provRows } = await client.query(
      `SELECT id FROM datapoint_providers WHERE slug = 'huggingface'`
    );
    const hfProvId = provRows.length > 0 ? provRows[0].id : null;

    // 3. Load all HF external_source_models with their model_limits
    const { rows: hfModels } = await client.query(`
      SELECT esm.model_name, esm.model_limits, esp.mapped_slug AS org_slug
      FROM external_source_models esm
      JOIN external_source_providers esp ON esp.id = esm.external_source_provider_id
      WHERE esm.source_id = $1
    `, [hfSourceId]);
    console.log(`Loaded ${hfModels.length} HF Hub model entries.`);

    // 4. Build a map: HF model_name → parsed lineage data
    const hfLineage = new Map(); // model_name → { baseModelId, baseModelFinetuneId, method, cardDataBaseModel }
    for (const row of hfModels) {
      let limits;
      try {
        limits = JSON.parse(row.model_limits);
      } catch {
        continue;
      }
      const tags = limits.tags || [];
      const method = parseMethod(tags);
      const baseRefs = parseBaseModelTags(tags);
      const cardDataBM = parseCardDataBaseModel(limits.cardData);

      // Prefer finetune-tagged base model, then plain base_model tag, then cardData
      const finetuneRef = baseRefs.find((r) => r.isFinetune);
      const plainRef = baseRefs.find((r) => !r.isFinetune);

      hfLineage.set(row.model_name, {
        orgSlug: row.org_slug,
        method,
        baseModelId: finetuneRef?.modelId || plainRef?.modelId || cardDataBM || null,
        baseModelFinetuneId: finetuneRef?.modelId || null,
        cardDataBaseModel: cardDataBM,
      });
    }

    // 5. Build a lookup from HF model_name → super_model_id via the huggingface datapoint provider
    const hfNameToSuper = new Map(); // HF model_name → { super_id, slug, creator }
    if (hfProvId) {
      const { rows: dmRows } = await client.query(`
        SELECT dm.model_instance_key, dm.super_model_id, sm.slug, sm.creator
        FROM datapoint_models dm
        JOIN super_models sm ON sm.id = dm.super_model_id
        WHERE dm.datapoint_provider_id = $1 AND NOT dm.is_removed
      `, [hfProvId]);
      for (const r of dmRows) {
        hfNameToSuper.set(r.model_instance_key, {
          super_id: r.super_model_id,
          slug: r.slug,
          creator: r.creator,
        });
      }
    }
    console.log(`  Mapped ${hfNameToSuper.size} HF model IDs to super_models via datapoint_models.`);

    // 6. Also build a slug lookup for fallback name-based matching
    const { rows: allSuper } = await client.query(`
      SELECT sm.id, sm.slug, sm.name, sm.creator
      FROM super_models sm
      WHERE EXISTS (
        SELECT 1 FROM datapoint_models dm
        WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
      )
    `);
    const slugToSuper = new Map();
    for (const s of allSuper) {
      slugToSuper.set(s.slug, s);
    }

    // 7. For each HF entry with lineage data, try to map to a super_model
    const updates = []; // { super_id, child_name, base_slug, base_creator, derivation_method, source }
    const unmapped = [];

    for (const [hfName, lineage] of hfLineage) {
      if (!lineage.baseModelId && !lineage.method) continue;

      // Find the child super_model
      let child = hfNameToSuper.get(hfName);
      if (!child) {
        // Fallback: try normalizing the HF model name (strip org, slugify)
        const stripped = stripOrg(hfName);
        const slug = slugify(stripped);
        const superMatch = slugToSuper.get(slug);
        if (superMatch) {
          child = { super_id: superMatch.id, slug: superMatch.slug, creator: superMatch.creator };
        }
      }

      if (!child) {
        if (lineage.baseModelId) {
          unmapped.push(`${hfName} → ${lineage.baseModelId}`);
        }
        continue;
      }

      // Find the base super_model from the HF base model ID
      let baseSlug = null;
      let baseCreator = null;

      if (lineage.baseModelId) {
        // First, try direct HF name → super mapping
        const baseSuper = hfNameToSuper.get(lineage.baseModelId);
        if (baseSuper) {
          baseSlug = baseSuper.slug;
          baseCreator = baseSuper.creator;
        } else {
          // Try normalized slug lookup
          const stripped = stripOrg(lineage.baseModelId);
          const slug = slugify(stripped);
          const superMatch = slugToSuper.get(slug);
          if (superMatch) {
            baseSlug = superMatch.slug;
            baseCreator = superMatch.creator;
          } else {
            // Last resort: extract org from base model ID
            const orgSlash = lineage.baseModelId.indexOf('/');
            if (orgSlash >= 0) {
              baseCreator = lineage.baseModelId.slice(0, orgSlash);
            }
            baseSlug = slug;
          }
        }
      }

      // Determine derivation method: explicit tag > cardData inference > null
      let method = lineage.method;
      if (!method && lineage.baseModelFinetuneId) {
        method = 'finetune'; // base_model:finetune: tag implies fine-tuning
      }
      if (!method && lineage.cardDataBaseModel) {
        method = 'finetune'; // cardData.base_model usually indicates a fine-tune
      }

      if (baseSlug && baseSlug !== child.slug) {
        updates.push({
          super_id: child.super_id,
          child_name: hfName,
          base_slug: baseSlug,
          base_creator: baseCreator,
          derivation_method: method,
          source: lineage.baseModelFinetuneId ? 'tag(base_model:finetune)' :
                 lineage.baseModelId ? 'tag(base_model)' :
                 lineage.cardDataBaseModel ? 'cardData' : 'tag(methodology)',
        });
      } else if (method) {
        // Has methodology tag but no identifiable base model
        updates.push({
          super_id: child.super_id,
          child_name: hfName,
          base_slug: null,
          base_creator: null,
          derivation_method: method,
          source: 'tag(methodology)',
        });
      }
    }

    // 8. Display results
    console.log(`\nFound ${updates.length} models with HF lineage data.`);
    if (unmapped.length > 0) {
      console.log(`  ${unmapped.length} unmapped (base model not found in our DB):`);
      for (const u of unmapped.slice(0, 10)) {
        console.log(`    ${u}`);
      }
      if (unmapped.length > 10) console.log(`    ... and ${unmapped.length - 10} more`);
    }

    // Group by method
    const byMethod = {};
    for (const u of updates) {
      const m = u.derivation_method || 'unknown';
      byMethod[m] = (byMethod[m] || 0) + 1;
    }
    console.log('\nBy derivation method:');
    for (const [method, count] of Object.entries(byMethod).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${method}: ${count}`);
    }

    // Show examples
    console.log('\nExample assignments:');
    for (const u of updates.filter(u => u.base_slug).slice(0, 20)) {
      const methodStr = u.derivation_method ? ` [${u.derivation_method}]` : '';
      console.log(`  ${u.child_name} → ${u.base_slug}${methodStr}  (${u.source})`);
    }

    if (dryRun) {
      console.log(`\nDry run — use --apply to update ${updates.length} super_models.`);
      return;
    }

    // 9. Apply updates
    let updated = 0;
    let methodOnly = 0;
    await client.query('BEGIN');
    for (const u of updates) {
      if (u.base_slug) {
        await client.query(`
          UPDATE super_models
          SET base_model = $1,
              base_creator = COALESCE(base_creator, $2),
              derivation_method = COALESCE(derivation_method, $3)
          WHERE id = $4
        `, [u.base_slug, u.base_creator, u.derivation_method, u.super_id]);
        updated++;
      } else if (u.derivation_method) {
        await client.query(`
          UPDATE super_models
          SET derivation_method = COALESCE(derivation_method, $1)
          WHERE id = $2
        `, [u.derivation_method, u.super_id]);
        methodOnly++;
      }
    }
    await client.query('COMMIT');
    console.log(`\nUpdated ${updated} super_models with base_model/base_creator.`);
    console.log(`Updated ${methodOnly} super_models with derivation_method only.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
