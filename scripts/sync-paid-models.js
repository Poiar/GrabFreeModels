#!/usr/bin/env node
/**
 * sync-paid-models.js
 * Fetches paid models from OpenRouter and syncs against Neon PostgreSQL (v2 schema).
 *
 * OpenRouter has ~300 paid models with structured pricing. This script fetches
 * the full catalog, filters to models with non-zero pricing, and upserts them
 * into the same DB tables as free models (is_free = false).
 *
 * Usage: node scripts/sync-paid-models.js [--apply]
 *   --apply  : Write changes to PostgreSQL (default: dry-run / report only)
 */

require('dotenv').config();
const https = require('https');
const http = require('http');
const dbPool = require('../server/db');

const APPLY = process.argv.includes('--apply');

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    mod
      .get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

function normalizeModelSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchPaidModels() {
  console.log('Fetching OpenRouter catalog...');
  const { data: resp } = await httpGet('https://openrouter.ai/api/v1/models');
  const allModels = resp.data || [];

  // Filter to paid models: has pricing AND not free
  const paid = allModels.filter((m) => {
    if (m.id.endsWith(':free')) return false;
    const p = m.pricing || {};
    const input = parseFloat(p.prompt ?? p.input ?? 0);
    const output = parseFloat(p.completion ?? p.output ?? 0);
    return input > 0 || output > 0;
  });

  console.log(`Found ${paid.length} paid models out of ${allModels.length} total`);

  const mapped = [];
  const skippedNoPricing = [];
  const skippedNoContext = [];

  for (const m of paid) {
    const p = m.pricing || {};
    const input = parseFloat(p.prompt ?? p.input ?? 0);
    const output = parseFloat(p.completion ?? p.output ?? 0);

    if (input === 0 && output === 0) {
      skippedNoPricing.push(m.id);
      continue;
    }

    // OpenRouter provides context_length; skip models without it
    const ctx = m.context_length ?? null;
    if (!ctx) {
      skippedNoContext.push(m.id);
    }

    // Strip OpenRouter's "Creator: Name" vendor prefix
    let cleanName = m.name || m.id;
    const colonSpace = cleanName.indexOf(': ');
    if (colonSpace > 0 && colonSpace < cleanName.length - 2) {
      cleanName = cleanName.slice(colonSpace + 2).trim();
    }

    mapped.push({
      id: `openrouter/${m.id}`,
      name: cleanName,
      context_length: ctx,
      input_price_per_million: input,
      output_price_per_million: output,
      supports_tools: m.supports_tools ?? null,
      supports_reasoning: m.supports_reasoning ?? null,
      description: m.description || null,
    });
  }

  if (skippedNoPricing.length) {
    console.log(`\nSkipped ${skippedNoPricing.length} models with $0 pricing (filtered):`);
    for (const id of skippedNoPricing) console.log(`  ${id}`);
  }
  if (skippedNoContext.length) {
    console.log(`\nSkipped ${skippedNoContext.length} models without context_length:`);
    for (const id of skippedNoContext) console.log(`  ${id}`);
  }

  console.log(`\nMapped ${mapped.length} paid models for sync`);
  return mapped;
}

function inferTags(name, description) {
  const tags = [];

  // Name-based patterns
  if (name) {
    const n = name.toLowerCase();
    if (/\bcoder\b|\bcodex\b|\bdevstral\b|\bbuild\b/i.test(n)) tags.push('coding');
    if (/\bmulti.agent\b|\bagentic\b/i.test(n)) tags.push('agentic');
    if (/\bfunction.call|\btool.use|\btool\b/i.test(n)) tags.push('tool use');
    if (/\breasoning\b|\bdeep.research\b|\bdeep.think\b/i.test(n)) tags.push('reasoning');
    if (/\bthinking\b|\bthink\b/i.test(n)) tags.push('thinking');
    if (/\b(?:pro|plus|max|premier|large)\b/i.test(n)) tags.push('current default');
    if (/\bvision\b|\bvl\b|\bimage\b|\baudio\b|\bvideo\b|\bmultimodal\b/i.test(n)) tags.push('multimodal');
    if (/\bflash\b|\bfast\b|\bturbo\b|\bquick\b/i.test(n)) tags.push('fast');
    if (/\bnano\b|\bmicro\b|\btiny\b/i.test(n)) tags.push('ultra-lightweight');
    if (/\bmini\b|\bsmall\b|\blite\b/i.test(n)) tags.push('lightweight');
    if (/\bpreview\b|\bexp\b|\bexperimental\b|\balpha\b/i.test(n)) tags.push('new');
  }

  // Description-based patterns
  if (description) {
    const d = description.toLowerCase();
    if (/\bcoding\b|\bcoder\b|\bprogramming\b|\bsoftware.engineering\b/i.test(d)) tags.push('coding');
    if (/\bagentic\b|\bmulti.agent\b|\bautonomous.*agent\b|\bagent.*workflow\b/i.test(d)) tags.push('agentic');
    if (/\btool.using\b|\bfunction.calling\b|\bsupports.*tools\b|\bthousands.*tool\b/i.test(d)) tags.push('tool use');
    if (/\breasoning\b/i.test(d) && !/\bnon.reasoning\b|\bnot.reasoning\b/i.test(d)) tags.push('reasoning');
    if (/\bthinking\b|\bchain.of.thought\b/i.test(d)) tags.push('thinking');
    if (/\bmultimodal\b|\bvision.language\b|\bimage.*understanding\b/i.test(d)) tags.push('multimodal');
    if (/\bflagship\b|\bmost capable\b|\bpremier\b|\bhighest.quality\b|\bbest overall\b/i.test(d)) tags.push('current default');
    if (/\bgeneral purpose\b|\bgeneral.*tasks\b|\bversatile\b|\ball.?around\b/i.test(d)) tags.push('general purpose');
    if (/\blightweight\b|\bcompact\b|\befficient inference\b|\bsmall.*parameter\b/i.test(d)) tags.push('lightweight');
    if (/\bfast\b|\bhigh.speed\b|\blow.latency\b|\bquick\b|\brapid\b/i.test(d)) tags.push('fast');
    if (/\bcost.effective\b|\baffordable\b|\bbudget|\bvalue.*money\b/i.test(d)) tags.push('cost-efficient');
    if (/\bcreative\b|\bwriting\b|\bstorytelling\b|\bcontent.*creation\b/i.test(d)) tags.push('general chat');
    if (/\bresearch\b|\bscience\b|\bscientific\b|\bacademia\b/i.test(d)) tags.push('complex tasks');
    if (/\btranslation\b|\bmultilingual\b|\blanguage.*support\b/i.test(d)) tags.push('multilingual');
    if (/\bpreview\b|\bexp\b|\bexperimental\b|\balpha\b/i.test(d)) tags.push('new');
  }

  return [...new Set(tags)];
}

async function main() {
  const paidModels = await fetchPaidModels();

  const client = await dbPool.connect();
  try {
    // Check existing paid models in DB
    const { rows: existingRows } = await client.query(
      `SELECT dm.full_id, dm.context_length, dm.input_price_per_million, dm.output_price_per_million
       FROM datapoint_models dm
       WHERE dm.is_free = false AND dm.is_removed = false`,
    );

    const existingMap = new Map(existingRows.map((r) => [r.full_id, r]));

    // Determine new vs updated
    const newModels = [];
    const updatedModels = [];
    const unchangedModels = [];

    for (const m of paidModels) {
      const existing = existingMap.get(m.id);
      if (!existing) {
        newModels.push(m);
      } else {
        const ctxChanged = existing.context_length !== m.context_length;
        const inputChanged = parseFloat(existing.input_price_per_million ?? 0) !== m.input_price_per_million;
        const outputChanged = parseFloat(existing.output_price_per_million ?? 0) !== m.output_price_per_million;
        if (ctxChanged || inputChanged || outputChanged) {
          updatedModels.push(m);
        } else {
          unchangedModels.push(m);
        }
      }
    }

    // Detect potentially removed (models in DB but not in current fetch)
    const fetchedIds = new Set(paidModels.map((m) => m.id));
    const potentiallyRemoved = existingRows
      .filter((r) => !fetchedIds.has(r.full_id))
      .map((r) => r.full_id);

    console.log(`\n── OpenRouter Paid Models ──`);
    console.log(`  New:       ${newModels.length}`);
    console.log(`  Updated:   ${updatedModels.length}`);
    console.log(`  Unchanged: ${unchangedModels.length}`);
    console.log(`  Existing:  ${existingRows.length}`);
    console.log(`  Potentially removed: ${potentiallyRemoved.length}`);

    if (newModels.length > 0) {
      console.log('\nNew models:');
      for (const m of newModels.slice(0, 30)) {
        console.log(`  + ${m.id}  ctx=${m.context_length ?? '?'}  in=$${m.input_price_per_million}  out=$${m.output_price_per_million}`);
      }
      if (newModels.length > 30) console.log(`  ... and ${newModels.length - 30} more`);
    }

    if (updatedModels.length > 0) {
      console.log('\nUpdated models:');
      for (const m of updatedModels.slice(0, 15)) console.log(`  ~ ${m.id}`);
      if (updatedModels.length > 15) console.log(`  ... and ${updatedModels.length - 15} more`);
    }

    if (potentiallyRemoved.length > 0) {
      console.log('\nPotentially removed:');
      for (const id of potentiallyRemoved.slice(0, 30)) console.log(`  - ${id}`);
      if (potentiallyRemoved.length > 30) console.log(`  ... and ${potentiallyRemoved.length - 30} more`);
    }

    // Tag inference coverage report
    const allModels = [...newModels, ...updatedModels, ...unchangedModels];
    const withDesc = allModels.filter((m) => m.description).length;
    const withNameTags = allModels.filter((m) => inferTags(m.name, null).length > 0).length;
    const withDescTags = allModels.filter((m) => m.description && inferTags(null, m.description).length > 0).length;
    const withAnyTags = allModels.filter((m) => inferTags(m.name, m.description).length > 0).length;
    console.log(`\n── Tag Inference Coverage ──`);
    console.log(`  With description: ${withDesc}/${allModels.length}`);
    console.log(`  Tags from name:   ${withNameTags}`);
    console.log(`  Tags from desc:   ${withDescTags}`);
    console.log(`  Tags from either: ${withAnyTags}`);
    console.log(`  No tags at all:   ${allModels.length - withAnyTags}`);
    // Show sample inferences for notable models
    console.log(`\n  Sample inferences:`);
    const samples = allModels.filter((m) => {
      const tags = inferTags(m.name, m.description);
      return tags.length > 0;
    }).slice(0, 8);
    for (const m of samples) {
      const tags = inferTags(m.name, m.description);
      console.log(`    ${m.id.split('/').pop()} → [${tags.join(', ')}]`);
    }

    if (!APPLY) {
      console.log('\nReport mode. Use --apply to write changes.');
      return;
    }

    // ── Apply ──
    console.log('\nApplying changes...');
    await client.query('BEGIN');

    // Ensure OpenRouter provider exists
    await client.query(
      `INSERT INTO datapoint_providers (slug, name) VALUES ('openrouter', 'OpenRouter')
       ON CONFLICT (slug) DO NOTHING`,
    );
    const { rows: provRows } = await client.query(
      "SELECT id, slug FROM datapoint_providers WHERE slug = 'openrouter'",
    );
    const providerId = provRows[0].id;

    // Ensure source exists for provenance
    const sourceSlug = 'openrouter-api';
    await client.query(
      `INSERT INTO sources (slug, name, source_type, datapoint_provider_id)
       VALUES ($1, 'OpenRouter API', 'api_provider', $2)
       ON CONFLICT (slug) DO UPDATE SET datapoint_provider_id = EXCLUDED.datapoint_provider_id`,
      [sourceSlug, providerId],
    );
    const { rows: srcRows } = await client.query(
      `SELECT id FROM sources WHERE slug = $1`, [sourceSlug],
    );
    const srcId = srcRows[0]?.id;

    let inserted = 0;
    let updated = 0;

    for (const m of paidModels) {
      const superSlug = normalizeModelSlug(m.name);

      // Upsert super model
      const { rows: mmRows } = await client.query(
        `INSERT INTO super_models (name, slug) VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [m.name, superSlug],
      );
      const superId = mmRows[0].id;

      const modelInstanceKey = m.id.replace('openrouter/', '');
      const existing = existingMap.get(m.id);

      // Upsert datapoint model
      const { rows: dmRows } = await client.query(
        `INSERT INTO datapoint_models
           (super_model_id, datapoint_provider_id, model_instance_key, full_id, context_length,
            is_free, input_price_per_million, output_price_per_million, status_result, status_detail)
         VALUES ($1, $2, $3, $4, $5, false, $6, $7, 'working',
                 'Paid model — assumed working')
         ON CONFLICT (datapoint_provider_id, model_instance_key) DO UPDATE SET
           context_length = EXCLUDED.context_length,
           input_price_per_million = EXCLUDED.input_price_per_million,
           output_price_per_million = EXCLUDED.output_price_per_million,
           is_removed = false,
           updated_at = now()
         RETURNING id`,
        [superId, providerId, modelInstanceKey, m.id, m.context_length,
         m.input_price_per_million, m.output_price_per_million],
      );
      const dmId = dmRows[0].id;

      // Inferred best_for tags from name + description
      const inferredTags = inferTags(m.name, m.description);
      if (inferredTags.length > 0) {
        await client.query(
          `DELETE FROM datapoint_model_features
           WHERE datapoint_model_id = $1 AND feature_type = 'best_for'`,
          [dmId],
        );
        for (const tag of inferredTags) {
          await client.query(
            `INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
             VALUES ($1, 'best_for', $2)
             ON CONFLICT (datapoint_model_id, feature_type, value) DO NOTHING`,
            [dmId, tag],
          );
        }
      }

      // Store raw description for standalone ranking inference
      if (m.description) {
        const desc = m.description.substring(0, 256);
        await client.query(
          `DELETE FROM datapoint_model_features
           WHERE datapoint_model_id = $1 AND feature_type = 'description'`,
          [dmId],
        );
        await client.query(
          `INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
           VALUES ($1, 'description', $2)
           ON CONFLICT (datapoint_model_id, feature_type, value) DO NOTHING`,
          [dmId, desc],
        );
      }

      // Record provenance
      if (srcId) {
        await client.query(
          `INSERT INTO datapoint_model_sources (datapoint_model_id, source_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [dmId, srcId],
        );
      }

      if (existing) updated++;
      else inserted++;
    }

    // Mark removed models
    if (potentiallyRemoved.length > 0) {
      const { rowCount } = await client.query(
        `UPDATE datapoint_models SET is_removed = true, updated_at = now()
         WHERE full_id = ANY($1) AND is_free = false`,
        [potentiallyRemoved],
      );
      console.log(`  Marked ${rowCount} models as removed`);
    }

    await client.query('COMMIT');
    console.log(`\nDone. Inserted ${inserted}, updated ${updated}.`);
  } catch (err) {
    console.error('Sync failed:', err.message);
    if (APPLY) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    process.exitCode = 1;
  } finally {
    client.release();
    await dbPool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
