// One-shot: fix super_models where creator was misattributed to a provider/reseller name
// Run via: node scripts/fix-misattributed-creators.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../server/db');

// Known reseller/provider names that are NOT model creators
const NON_CREATORS = [
  'opencode',
  'poe',
  'novita ai',
  'cloudflare',
  'workers-ai',
  'null',
  '',
];

(async () => {
  const client = await pool.connect();
  try {
    console.log('Fixing super_models with provider-misattributed creators...\n');

    const placeholders = NON_CREATORS.map((_, i) => `$${i + 1}`).join(', ');
    const values = NON_CREATORS.map((s) => s === '' ? '' : s);

    // Find rows where creator is a known non-creator provider and base_creator has the real value
    const { rows: mismatched } = await client.query(`
      SELECT id, slug, name, creator, base_creator
      FROM super_models
      WHERE LOWER(COALESCE(creator, 'null')) IN (${placeholders})
        AND base_creator IS NOT NULL
      ORDER BY id
    `, values);

    console.log(`Found ${mismatched.length} rows:`);
    for (const r of mismatched) {
      console.log(`  #${r.id} ${r.slug}: creator="${r.creator}" -> "${r.base_creator}"`);
    }

    if (mismatched.length > 0) {
      const { rowCount } = await client.query(`
        UPDATE super_models
        SET creator = base_creator
        WHERE LOWER(COALESCE(creator, 'null')) IN (${placeholders})
          AND base_creator IS NOT NULL
      `, values);
      console.log(`\nUpdated ${rowCount} rows.`);
    } else {
      console.log('\nNo rows to update.');
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
