#!/usr/bin/env node
/**
 * health-check.js — Quick DB integrity verification
 * Usage: node scripts/health-check.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const c = await p.connect();
  try {
    const checks = [];

    // 1. Slug uniqueness
    const dups = await c.query('SELECT slug, COUNT(*) as cnt FROM super_models GROUP BY slug HAVING COUNT(*) > 1');
    checks.push(`Slug duplicates: ${dups.rows.length} (should be 0)`);

    // 2. Models with author
    const auth = await c.query('SELECT COUNT(*) FROM super_models WHERE author IS NOT NULL');
    checks.push(`Models with author: ${auth.rows[0].count} / 564`);

    // 3. modelsdev coverage
    const md = await c.query("SELECT COUNT(DISTINCT dm.super_model_id) FROM datapoint_models dm JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id WHERE dp.slug = 'modelsdev'");
    checks.push(`Models with modelsdev: ${md.rows[0].count} / 564 (should be 615 before merge)`);

    // 4. Old tables gone
    const old = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('models','providers','authors','provider_models','model_features','model_input_types','model_output_types')");
    checks.push(`Old tables remaining: ${old.rows.length} (should be 0)`);

    // 5. Row counts
    const counts = await c.query(`
      SELECT 'super_models' as t, COUNT(*) as n FROM super_models
      UNION ALL SELECT 'datapoint_models', COUNT(*) FROM datapoint_models
      UNION ALL SELECT 'datapoint_providers', COUNT(*) FROM datapoint_providers
      UNION ALL SELECT 'datapoint_model_features', COUNT(*) FROM datapoint_model_features
      UNION ALL SELECT 'model_scores', COUNT(*) FROM model_scores
    `);
    for (const r of counts.rows) checks.push(`  ${r.t}: ${r.n}`);

    // 6. Orphan check
    const orphans = await c.query('SELECT COUNT(*) FROM datapoint_models dm WHERE NOT EXISTS (SELECT 1 FROM super_models sm WHERE sm.id = dm.super_model_id)');
    checks.push(`Orphaned datapoints: ${orphans.rows[0].count} (should be 0)`);

    console.log('=== DB Health Check ===');
    for (const ch of checks) console.log(ch);
    console.log('=== Done ===');
  } finally {
    c.release();
    await p.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
