#!/usr/bin/env node
/**
 * check-base-model-cycles.js — Detects and optionally fixes circular base_model chains.
 *
 * This is a safety net that catches any cycles that slip past the script-level
 * guards in safe-chain-walker.js and the DB CHECK constraint (044).
 *
 * Usage:
 *   node scripts/check-base-model-cycles.js          # dry-run: detect and report
 *   node scripts/check-base-model-cycles.js --apply  # fix: nullify cycle-causing base_models
 *
 * Called automatically during the nightly pipeline (Step 4.5).
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { detectCycles, validateNoSelfRefs } = require('./utils/safe-chain-walker');

let connectionString = process.env.DATABASE_URL;
if (
  connectionString &&
  connectionString.includes('sslmode=require') &&
  !connectionString.includes('uselibpqcompat')
) {
  connectionString = connectionString.replace(
    'sslmode=require',
    'uselibpqcompat=true&sslmode=require',
  );
}

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString, max: 1, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();

  try {
    // Load all base_model relationships
    const { rows } = await client.query(`
      SELECT slug, base_model
      FROM super_models
      WHERE base_model IS NOT NULL
    `);

    const parentMap = new Map();
    for (const r of rows) {
      parentMap.set(r.slug, r.base_model);
    }

    console.log(`Loaded ${parentMap.size} models with base_model links.\n`);

    // Check for self-references (should be blocked by DB constraint)
    const selfRefs = validateNoSelfRefs(parentMap);
    if (selfRefs.length > 0) {
      console.log(`⛔ SELF-REFERENCES FOUND: ${selfRefs.length}`);
      console.log('   (These should be blocked by ck_base_model_no_self_ref — investigate!)');
      selfRefs.slice(0, 10).forEach((s) => console.log(`   ${s} → ${s}`));
      if (selfRefs.length > 10) console.log(`   ... and ${selfRefs.length - 10} more`);
    } else {
      console.log('✓ No self-references found.');
    }

    // Check for cycles (A→B→...→A)
    const cycleSlugs = detectCycles(parentMap);
    if (cycleSlugs.length > 0) {
      console.log(`\n⛔ CYCLES FOUND: ${cycleSlugs.length}`);
      for (const slug of cycleSlugs.slice(0, 15)) {
        // Walk the cycle to show the path
        const visited = new Set();
        let cur = slug;
        let chain = [];
        let depth = 0;
        while (cur && depth < 50) {
          depth++;
          if (visited.has(cur)) {
            chain.push(`↺${cur}`);
            break;
          }
          visited.add(cur);
          chain.push(cur);
          cur = parentMap.get(cur);
        }
        console.log(`   ${chain.join(' → ')}`);
      }
      if (cycleSlugs.length > 15) console.log(`   ... and ${cycleSlugs.length - 15} more`);

      if (APPLY) {
        console.log('\nFixing: nullifying base_model for cycle-participating models...');
        let fixed = 0;
        for (const slug of cycleSlugs) {
          await client.query('UPDATE super_models SET base_model = NULL WHERE slug = $1', [slug]);
          fixed++;
        }
        console.log(`Fixed ${fixed} models.`);
      } else {
        console.log(
          `\nDry run — use --apply to nullify ${cycleSlugs.length} cycle-causing base_models.`,
        );
        process.exitCode = 1; // Signal failure to nightly pipeline
      }
    } else {
      console.log('\n✓ No cycles detected — base_model graph is healthy.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
