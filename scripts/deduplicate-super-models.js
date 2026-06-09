// Merge duplicate super_models that differ only by org prefix
// Dry-run (default): node scripts/deduplicate-super-models.js
// Apply:              node scripts/deduplicate-super-models.js --apply
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../server/db');

const APPLY = process.argv.includes('--apply');

const ORG_PREFIXES = [
  'minimaxai', 'deepseek-ai', 'meta-llama', 'mistralai', 'arcee-ai',
  'stabilityai', 'nousresearch', 'cognitivecomputations', 'abacusai',
  'sarvamai', 'internlm', 'upstage', 'databricks', 'bigcode', 'baai',
  'ibm-granite', 'microsoft', 'google',
];

function stripOrgPrefix(slug) {
  for (const prefix of ORG_PREFIXES) {
    if (slug.startsWith(prefix + '-')) return slug.slice(prefix.length + 1);
  }
  return null;
}

(async () => {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '=== APPLY MODE ===\n' : '=== DRY RUN ===\n');

    const { rows } = await client.query(`
      SELECT sm.id, sm.slug, sm.name, sm.creator, sm.base_creator,
             array_agg(DISTINCT dp.slug ORDER BY dp.slug) FILTER (WHERE dm.is_free = true AND dm.is_removed = false) AS providers
      FROM super_models sm
      LEFT JOIN datapoint_models dm ON dm.super_model_id = sm.id AND dm.is_free = true AND dm.is_removed = false
      LEFT JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      GROUP BY sm.id
      ORDER BY sm.slug
    `);

    const slugIndex = new Map();
    for (const r of rows) slugIndex.set(r.slug, r);

    const merges = [];
    for (const r of rows) {
      const stripped = stripOrgPrefix(r.slug);
      if (!stripped) continue;
      const target = slugIndex.get(stripped);
      if (!target || target.id === r.id) continue;
      if (r.base_creator && target.base_creator && r.base_creator !== target.base_creator) continue;
      if (/\bv\d+$/.test(r.slug) && /\bv\d+$/.test(target.slug)) continue;

      const rProvs = r.providers?.filter(Boolean) || [];
      const tProvs = target.providers?.filter(Boolean) || [];

      // Keep the canonical (shorter slug) as winner, prefer one with more providers
      const winner = tProvs.length >= rProvs.length ? target : r;
      const loser = winner.id === target.id ? r : target;

      const key = `${loser.id}->${winner.id}`;
      if (merges.some(m => m.key === key)) continue;
      merges.push({ key, winner, loser });
    }

    console.log(`Found ${merges.length} merges\n`);

    let merged = 0;
    let datapointsMoved = 0;

    for (const m of merges) {
      process.stdout.write(`#${m.loser.id} (${m.loser.slug}) -> #${m.winner.id} (${m.winner.slug}) ... `);

      // Check for conflicting datapoints (same provider + model_instance_key on both)
      const { rows: conflicts } = await client.query(`
        SELECT dm_loser.id AS loser_dm_id, dm_loser.full_id AS loser_full_id,
               dm_winner.id AS winner_dm_id, dm_winner.full_id AS winner_full_id
        FROM datapoint_models dm_loser
        JOIN datapoint_models dm_winner
          ON dm_winner.super_model_id = $1
         AND dm_winner.datapoint_provider_id = dm_loser.datapoint_provider_id
         AND dm_winner.model_instance_key = dm_loser.model_instance_key
        WHERE dm_loser.super_model_id = $2
      `, [m.winner.id, m.loser.id]);

      if (!APPLY) {
        const { rows: loserDps } = await client.query(
          'SELECT COUNT(*) as c FROM datapoint_models WHERE super_model_id = $1', [m.loser.id]
        );
        const count = parseInt(loserDps[0].c);
        console.log(`${count} datapoints${conflicts.length > 0 ? ` (${conflicts.length} conflicts)` : ''}`);
        merged++;
        continue;
      }

      // Handle conflicts: keep winner's datapoint, skip loser's
      if (conflicts.length > 0) {
        for (const c of conflicts) {
          // Mark loser's conflicting datapoint as removed
          await client.query(
            'UPDATE datapoint_models SET is_removed = true, updated_at = now() WHERE id = $1',
            [c.loser_dm_id]
          );
        }
      }

      // Move remaining datapoints to winner
      const { rowCount } = await client.query(
        'UPDATE datapoint_models SET super_model_id = $1, updated_at = now() WHERE super_model_id = $2',
        [m.winner.id, m.loser.id]
      );
      datapointsMoved += rowCount;

      // Delete the loser super_model (datapoints already moved or marked removed)
      await client.query('DELETE FROM super_models WHERE id = $1', [m.loser.id]);

      console.log(`${rowCount} moved${conflicts.length > 0 ? `, ${conflicts.length} skipped` : ''}`);
      merged++;
    }

    console.log(`\n${merged} merges${APPLY ? ' applied' : ' would be applied'}, ${datapointsMoved} datapoints moved`);
    if (!APPLY) console.log('Run with --apply to execute.');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
