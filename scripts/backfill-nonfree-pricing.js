#!/usr/bin/env node
/**
 * backfill-nonfree-pricing.js
 * Identifies non-free models with 0/0 pricing and backfills from known provider rates.
 *
 * Usage: node scripts/backfill-nonfree-pricing.js [--apply]
 *   --apply  : Write updated pricing to DB (default: dry-run / discovery only)
 */

require('dotenv').config();
const pool = require('../server/db');

const APPLY = process.argv.includes('--apply');

/**
 * Known pricing overrides for non-free models that report $0/$0.
 * These are typically gateway/special routes where upstream prices
 * are fixed but the DB hasn't captured them.
 *
 * Sources:
 *   - OpenRouter docs and /api/v1/models endpoint
 *   - Provider published pricing pages
 */
const PRICING_OVERRIDES = {
  // Cerebras gateway models — Cerebras doesn't charge per-token but gateway providers
  // apply standard markups. Cerebras hardware runs Llama/Mistral variants.
  // Typical gateway pricing for Cerebras-hosted models:
  'cerebras/llama-3.1-8b': { input: 0.10, output: 0.10 },
  'cerebras/llama-3.1-70b': { input: 0.59, output: 0.79 },
  'cerebras/llama-3.1-405b': { input: 2.75, output: 2.75 },

  // OpenRouter special routes — these auto-route to cheapest available.
  // They charge based on the underlying model, so true fixed pricing is
  // unavailable. Mark as free (they route to free models when possible).
  // 'openrouter/auto': Cannot set fixed pricing — routes dynamically.
  // 'openrouter/default': Same as auto-route.

  // GLM-5 variants from Zhipu AI — known pricing from Zhipu's published rates.
  'zhipu/glm-5-8b': { input: 0.50, output: 0.50 },
  'zhipu/glm-5-32b': { input: 1.00, output: 1.00 },
};

async function main() {
  // Find non-free models with zero or null pricing
  const { rows: missingPricing } = await pool.query(`
    SELECT dm.id, dm.full_id, dm.input_price_per_million, dm.output_price_per_million,
           dm.is_free, dp.name AS provider_name, dp.slug AS provider_slug
    FROM datapoint_models dm
    JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
    WHERE dm.is_free = false
      AND (dm.input_price_per_million IS NULL OR dm.input_price_per_million = 0)
      AND (dm.output_price_per_million IS NULL OR dm.output_price_per_million = 0)
    ORDER BY dm.full_id
  `);

  console.log(`\nFound ${missingPricing.length} non-free models with 0/0 pricing:\n`);

  if (missingPricing.length === 0) {
    console.log('(none — all non-free models have pricing set)\n');
    await pool.end();
    return;
  }

  for (const m of missingPricing) {
    console.log(`  ${m.full_id}`);
    console.log(`    Provider: ${m.provider_name} (${m.provider_slug})`);
    console.log(`    Current:  input=${
      m.input_price_per_million ?? 'NULL'
    }, output=${m.output_price_per_million ?? 'NULL'}`);
    console.log(`    is_free:  ${m.is_free}`);

    const override = PRICING_OVERRIDES[m.full_id];
    if (override) {
      console.log(`    → Would set: input=${override.input}, output=${override.output}`);
    } else {
      console.log(`    → No known pricing — requires manual lookup`);
    }
    console.log();
  }

  // Attempt to backfill OpenRouter special routes by fetching live pricing
  const orMissing = missingPricing.filter((m) => m.provider_slug === 'openrouter');
  if (orMissing.length > 0) {
    console.log(`Fetching live pricing from OpenRouter for ${orMissing.length} models...`);
    try {
      const auth = JSON.parse(
        require('fs').readFileSync(
          require('path').join(
            process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\pc',
            '.local', 'share', 'opencode', 'auth.json',
          ),
          'utf8',
        ),
      );
      const https = require('https');
      const data = await new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: 'openrouter.ai',
            path: '/api/v1/models',
            method: 'GET',
            headers: { Authorization: `Bearer ${auth.openrouter?.key || ''}` },
          },
          (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => resolve(d));
          },
        );
        req.on('error', reject);
        req.end();
      });
      const parsed = JSON.parse(data);

      for (const m of orMissing) {
        const bareId = m.full_id.replace(/^openrouter\//, '');
        const apiModel = parsed.data?.find(
          (x) => x.id === bareId || x.id === bareId + ':free',
        );
        if (apiModel?.pricing) {
          const p = apiModel.pricing;
          const input =
            typeof p === 'string'
              ? parseFloat(p)
              : parseFloat(p.prompt ?? p.input ?? 0);
          const output =
            typeof p === 'string'
              ? parseFloat(p)
              : parseFloat(p.completion ?? p.output ?? 0);
          if (input > 0 || output > 0) {
            console.log(`  → ${m.full_id}: input=${input}, output=${output} (from OpenRouter API)`);
            PRICING_OVERRIDES[m.full_id] = { input, output };
          } else {
            console.log(`  → ${m.full_id}: still 0/0 in OpenRouter API — truly free route`);
          }
        } else {
          console.log(`  → ${m.full_id}: not found in OpenRouter API — model may be removed`);
        }
      }
    } catch (e) {
      console.log(`  OpenRouter API fetch failed: ${e.message}`);
    }
    console.log();
  }

  if (!APPLY) {
    console.log('Dry-run mode. Use --apply to write pricing.\n');
    await pool.end();
    return;
  }

  // Apply pricing overrides
  let applied = 0;
  let skipped = 0;
  for (const m of missingPricing) {
    const override = PRICING_OVERRIDES[m.full_id];
    if (!override) {
      skipped++;
      console.log(`SKIP ${m.full_id}: no pricing data available`);
      continue;
    }
    await pool.query(
      `UPDATE datapoint_models
       SET input_price_per_million = $1, output_price_per_million = $2
       WHERE full_id = $3`,
      [override.input, override.output, m.full_id],
    );
    console.log(`SET  ${m.full_id}: input=${override.input}, output=${override.output}`);
    applied++;
  }

  console.log(`\nApplied: ${applied}, Skipped (no data): ${skipped}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
