const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

async function tableExists(client, name) {
  const r = await client.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2',
    ['public', name]
  );
  return r.rows.length > 0;
}

async function migrate() {
  console.log('Starting v1 → v2 migration...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Clean slate for new tables (in case of re-run)
    await client.query('TRUNCATE datapoint_models, datapoint_model_input_types, datapoint_model_output_types, datapoint_model_features, datapoint_providers RESTART IDENTITY CASCADE');
    console.log('Truncated new tables for clean migration');

    // ── Step 0: Check which old tables exist ──
    const oldModels = await tableExists(client, 'models');
    const oldPM = await tableExists(client, 'provider_models');
    const oldProviders = await tableExists(client, 'providers');
    const oldAuthors = await tableExists(client, 'authors');
    const oldMD = await tableExists(client, 'modelsdev');
    const oldMDPM = await tableExists(client, 'modelsdev_provider_models');
    console.log(`Old tables: models=${oldModels}, provider_models=${oldPM}, providers=${oldProviders}, authors=${oldAuthors}, modelsdev=${oldMD}, modelsdev_pm=${oldMDPM}`);

    // ── Step 1: Seed datapoint_providers from old providers ──
    console.log('\nStep 1: Migrating providers → datapoint_providers...');
    if (oldProviders) {
      const oldProv = (await client.query('SELECT slug, name, base_url FROM providers')).rows;
      for (const p of oldProv) {
        await client.query(
          `INSERT INTO datapoint_providers (slug, name, base_url) VALUES ($1,$2,$3)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, base_url = EXCLUDED.base_url`,
          [p.slug, p.name, p.base_url]
        );
      }
    }
    const dpCount = await client.query('SELECT count(*) FROM datapoint_providers');
    console.log(`  datapoint_providers: ${dpCount.rows[0].count}`);

    // ── Step 2: Build provider slug→id mapping ──
    const dpRows = (await client.query('SELECT id, slug FROM datapoint_providers')).rows;
    const dpMap = new Map(dpRows.map(r => [r.slug, r.id]));

    // ── Step 3: Collect all unique model names ──
    console.log('\nStep 2: Collecting unique model names...');
    const allNames = new Map(); // normalized_slug → {name, author, context_length, ...}

    if (oldModels) {
      const rows = (await client.query('SELECT DISTINCT name FROM models')).rows;
      for (const r of rows) {
        const slug = r.name.toLowerCase().replace(/\s*\(free\)\s*$/i, '').trim();
        if (!allNames.has(slug)) allNames.set(slug, r.name);
      }
    }
    if (oldMD) {
      const rows = (await client.query('SELECT DISTINCT name FROM modelsdev')).rows;
      for (const r of rows) {
        const slug = r.name.toLowerCase().replace(/\s*\(free\)\s*$/i, '').trim();
        if (!allNames.has(slug)) allNames.set(slug, r.name);
      }
    }
    console.log(`  Unique model names: ${allNames.size}`);

    // ── Step 4: Create master_models ──
    console.log('\nStep 3: Creating master_models...');
    const masterMap = new Map(); // slug → master_id
    for (const [slug, name] of allNames) {
      const res = await client.query(
        `INSERT INTO master_models (name, slug) VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
         RETURNING id`,
        [name, slug]
      );
      masterMap.set(slug, res.rows[0].id);
    }
    console.log(`  master_models: ${masterMap.size}`);

    // ── Step 5: Migrate provider_models → datapoint_models ──
    if (oldPM && oldModels) {
      console.log('\nStep 4: Migrating provider_models → datapoint_models...');
      const pmRows = (await client.query(`
        SELECT pm.*, p.slug AS provider_slug, m.name AS model_name,
               m.context_length, m.supports_tools, m.supports_reasoning,
               m.output_limit, m.temperature, m.open_weights, m.family,
               m.knowledge_cutoff, m.release_date, m.last_updated,
               m.input_price_per_million, m.output_price_per_million, m.is_free
        FROM provider_models pm
        JOIN providers p ON p.id = pm.provider_id
        JOIN models m ON m.id = pm.model_id
      `)).rows;

      let inserted = 0;
      for (const pm of pmRows) {
        const slug = pm.model_name.toLowerCase().replace(/\s*\(free\)\s*$/i, '').trim();
        const masterId = masterMap.get(slug);
        if (!masterId) { console.log(`  WARN: no master for ${pm.model_name}`); continue; }
        const dpId = dpMap.get(pm.provider_slug);
        if (!dpId) { console.log(`  WARN: no datapoint_provider for ${pm.provider_slug}`); continue; }

        await client.query(`
          INSERT INTO datapoint_models (
            master_model_id, datapoint_provider_id, remote_id, full_id,
            context_length, input_price_per_million, output_price_per_million,
            is_free, supports_tools, supports_reasoning, output_limit,
            temperature, open_weights, family, knowledge_cutoff,
            release_date, last_updated, is_removed,
            status_result, status_tested, status_detail, last_success
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
          ON CONFLICT (full_id) DO UPDATE SET
            context_length = EXCLUDED.context_length,
            is_free = EXCLUDED.is_free,
            supports_tools = EXCLUDED.supports_tools,
            status_result = EXCLUDED.status_result,
            updated_at = now()
        `, [
          masterId, dpId,
          pm.remote_id,
          pm.full_id,
          pm.context_length,
          pm.input_price_per_million != null ? Number(pm.input_price_per_million) : 0,
          pm.output_price_per_million != null ? Number(pm.output_price_per_million) : 0,
          pm.is_free ?? true,
          pm.supports_tools, pm.supports_reasoning, pm.output_limit,
          pm.temperature, pm.open_weights, pm.family, pm.knowledge_cutoff,
          pm.release_date, pm.last_updated,
          pm.removed ?? false,
          pm.status_result, pm.status_tested, pm.status_detail, pm.last_success,
        ]);
        inserted++;
      }
      console.log(`  provider_models migrated: ${inserted}`);
    }

    // ── Step 6: Migrate modelsdev_provider_models → datapoint_models ──
    if (oldMDPM && oldMD) {
      console.log('\nStep 5: Migrating modelsdev_provider_models → datapoint_models...');
      const mdpmRows = (await client.query(`
        SELECT mdp.*, p.slug AS provider_slug, md.name AS model_name
        FROM modelsdev_provider_models mdp
        JOIN providers p ON p.id = mdp.provider_id
        JOIN modelsdev md ON md.id = mdp.modelsdev_id
      `)).rows;

      let inserted = 0;
      for (const mdp of mdpmRows) {
        const slug = mdp.model_name.toLowerCase().replace(/\s*\(free\)\s*$/i, '').trim();
        const masterId = masterMap.get(slug);
        if (!masterId) { console.log(`  WARN: no master for ${mdp.model_name}`); continue; }
        const dpId = dpMap.get(mdp.provider_slug);
        if (!dpId) { console.log(`  WARN: no datapoint_provider for ${mdp.provider_slug}`); continue; }

        await client.query(`
          INSERT INTO datapoint_models (
            master_model_id, datapoint_provider_id, remote_id, full_id,
            context_length, input_price_per_million, output_price_per_million,
            is_free, supports_tools, supports_reasoning, output_limit,
            temperature, open_weights, family, knowledge_cutoff,
            release_date, last_updated, is_removed,
            status_result, status_tested, status_detail, last_success
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
          ON CONFLICT (full_id) DO UPDATE SET
            context_length = EXCLUDED.context_length,
            is_free = EXCLUDED.is_free,
            supports_tools = EXCLUDED.supports_tools,
            status_result = EXCLUDED.status_result,
            updated_at = now()
        `, [
          masterId, dpId, mdp.remote_id, mdp.full_id,
          mdp.context_length,
          mdp.input_price_per_million != null ? Number(mdp.input_price_per_million) : 0,
          mdp.output_price_per_million != null ? Number(mdp.output_price_per_million) : 0,
          mdp.is_free ?? true, mdp.supports_tools, mdp.supports_reasoning, mdp.output_limit,
          mdp.temperature, mdp.open_weights, mdp.family, mdp.knowledge_cutoff,
          mdp.release_date, mdp.last_updated, mdp.removed ?? false,
          mdp.status_result, mdp.status_tested, mdp.status_detail, mdp.last_success,
        ]);
        inserted++;
      }
      console.log(`  modelsdev_provider_models migrated: ${inserted}`);
    }

    // ── Step 7: Migrate features (best_for, tags) per datapoint model ──
    console.log('\nStep 6: Migrating features...');
    let featCount = 0;
    if (oldPM) {
      const pmFeatures = (await client.query(`
        SELECT mf.feature_type, mf.value, pm.full_id
        FROM model_features mf
        JOIN provider_models pm ON pm.model_id = mf.model_id
      `)).rows;
      for (const f of pmFeatures) {
        const dmRes = await client.query(
          'SELECT id FROM datapoint_models WHERE full_id = $1',
          [f.full_id]
        );
        if (dmRes.rows.length === 0) continue;
        await client.query(
          `INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [dmRes.rows[0].id, f.feature_type, f.value]
        );
        featCount++;
      }
    }
    console.log(`  features migrated: ${featCount}`);

    // ── Step 8: Migrate input/output types per datapoint model ──
    console.log('\nStep 7: Migrating input/output types...');
    let ioCount = 0;
    if (oldPM) {
      for (const tbl of [
        { old: 'model_input_types', new: 'datapoint_model_input_types', col: 'input_type' },
        { old: 'model_output_types', new: 'datapoint_model_output_types', col: 'output_type' },
      ]) {
        const rows = (await client.query(`
          SELECT it.${tbl.col}, pm.full_id
          FROM ${tbl.old} it
          JOIN provider_models pm ON pm.model_id = it.model_id
        `)).rows;
        for (const r of rows) {
          const dmRes = await client.query(
            'SELECT id FROM datapoint_models WHERE full_id = $1',
            [r.full_id]
          );
          if (dmRes.rows.length === 0) continue;
          await client.query(
            `INSERT INTO ${tbl.new} (datapoint_model_id, ${tbl.col}) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
            [dmRes.rows[0].id, r[tbl.col]]
          );
          ioCount++;
        }
      }
    }
    console.log(`  I/O types migrated: ${ioCount}`);

    // ── Step 9: Metadata already exists (same table in old + new schema) ──
    console.log('\nStep 8: Metadata already in place (shared table)');
    const metaCount = await client.query('SELECT count(*) FROM metadata');
    console.log(`  metadata keys: ${metaCount.rows[0].count}`);

    await client.query('COMMIT');
    console.log('\nMigration committed successfully!');

    // ── Verification ──
    console.log('\n── Verification ──');
    for (const tbl of ['master_models','datapoint_providers','datapoint_models','datapoint_model_features','datapoint_model_input_types','datapoint_model_output_types']) {
      const r = await client.query(`SELECT count(*) FROM ${tbl}`);
      console.log(`  ${tbl}: ${r.rows[0].count}`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nMigration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
