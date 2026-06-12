#!/usr/bin/env node
/**
 * merge-name-subset-dupes.js
 * Merge duplicate super_models where one name is a proper subset of another
 * after normalization (e.g. "R1" ⊆ "DeepSeek R1"). These are the same model
 * reported by different providers under slightly different names.
 *
 * Usage:
 *   node scripts/merge-name-subset-dupes.js          # dry-run
 *   node scripts/merge-name-subset-dupes.js --apply  # write to DB
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../server/db');

const APPLY = process.argv.includes('--apply');

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

(async () => {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '=== APPLY MODE ===\n' : '=== DRY RUN ===\n');

    // Load all active models with their names and base_models
    const { rows: models } = await client.query(`
      SELECT sm.id, sm.name, sm.slug, sm.creator, sm.base_model,
             COUNT(dm.id) FILTER (WHERE NOT dm.is_removed) AS dp_count,
             array_agg(DISTINCT dp.slug ORDER BY dp.slug) FILTER (WHERE dm.is_free = true AND NOT dm.is_removed) AS providers
      FROM super_models sm
      LEFT JOIN datapoint_models dm ON dm.super_model_id = sm.id
      LEFT JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      GROUP BY sm.id
      ORDER BY sm.slug
    `);

    const merges = [];

    // Find pairs where normalized name1 is a substring of normalized name2
    for (const a of models) {
      const aNorm = normalizeName(a.name);
      if (aNorm.length < 8) continue; // too short, would match everything

      for (const b of models) {
        if (a.id === b.id) continue;
        const bNorm = normalizeName(b.name);
        if (bNorm.length <= aNorm.length) continue; // b must be longer

        // b's normalized name must END with a's normalized name
        // (e.g., "DeepSeek R1 Distill Llama 70B" ends with "R1 Distill Llama 70B")
        // NOT the other way — "Tulu 3 70B DPO" ending with "Tulu 3 70B"
        // would mean Tulu→DPO-Tulu which is a derivative, not a duplicate.
        // Require at least 4 chars of prefix difference to avoid trivial matches.
        const suffixIdx = bNorm.length - aNorm.length;
        if (suffixIdx < 4) continue;
        if (!bNorm.endsWith(aNorm)) continue;

        // The extra prefix should be a known creator or org name
        const prefix = bNorm.substring(0, suffixIdx).trim();
        const prefixIsCreator =
          prefix === 'deepseek' ||
          prefix === 'cohere' ||
          prefix === 'openai' ||
          prefix === 'meta' ||
          prefix === 'mistral ai' ||
          prefix === 'nvidia' ||
          prefix === 'google' ||
          prefix === 'anthropic' ||
          prefix === 'alibaba' ||
          prefix === 'microsoft' ||
          prefix === 'ibm' ||
          prefix === 'xai' ||
          prefix === 'stability ai' ||
          prefix === 'baidu' ||
          prefix === 'zhipu ai' ||
          prefix === 'canopy labs' ||
          prefix === 'bytedance' ||
          prefix === 'nous research' ||
          prefix === 'cognitive computations' ||
          prefix === 'databricks';
        if (!prefixIsCreator) continue;

        // "Command R+" vs "Command R" — the + gets lost in normalization but
        // they're different model tiers. Skip this specific false positive.
        const slugs = [a.slug, b.slug];
        if (
          slugs.includes('cohere-cohere-command-r-plus-08-2024') &&
          slugs.includes('cohere-command-r-08-2024')
        )
          continue;

        // Same creator (or one is null)
        if (a.creator && b.creator && a.creator !== b.creator) continue;

        // Shared base_model or shared provider strongly suggests duplication
        const shareBase = a.base_model && a.base_model === b.base_model;
        const shareProv =
          a.providers && b.providers && a.providers.some((p) => b.providers.includes(p));

        if (!shareBase && !shareProv) continue;

        // Pick winner = longer name (more descriptive), more providers
        const aScore = a.dp_count * 2 + (shareBase ? 10 : 0);
        const bScore = b.dp_count * 2 + (shareBase ? 10 : 0);
        const [winner, loser] = bScore >= aScore ? [b, a] : [a, b];

        // Avoid duplicate merges
        if (merges.some((m) => m.loser.id === loser.id)) continue;

        merges.push({
          reason: `"${aNorm}" ⊆ "${bNorm}"${shareBase ? ' + shared base_model=' + a.base_model : ''}${shareProv ? ' + shared provider' : ''}`,
          winner: {
            id: winner.id,
            name: winner.name,
            slug: winner.slug,
            dp_count: winner.dp_count,
          },
          loser: { id: loser.id, name: loser.name, slug: loser.slug, dp_count: loser.dp_count },
        });
      }
    }

    if (merges.length === 0) {
      console.log('No subset-name duplicates found.');
      await pool.end();
      return;
    }

    console.log(`Found ${merges.length} subset-name duplicate pairs:\n`);
    let applied = 0,
      moved = 0,
      deleted = 0,
      refUpdates = 0;

    for (const m of merges) {
      console.log(`  WINNER: ${m.winner.name} (${m.winner.slug}) — ${m.winner.dp_count} dp`);
      console.log(`  LOSER : ${m.loser.name} (${m.loser.slug}) — ${m.loser.dp_count} dp`);
      console.log(`  REASON: ${m.reason}\n`);

      if (!APPLY) continue;

      try {
        await client.query('BEGIN');

        // Move non-conflicting datapoints
        const { rows: mv } = await client.query(
          `
          WITH moved AS (
            UPDATE datapoint_models SET super_model_id = $1, updated_at = now()
            WHERE super_model_id = $2
              AND NOT EXISTS (
                SELECT 1 FROM datapoint_models dm2
                WHERE dm2.super_model_id = $1
                  AND dm2.datapoint_provider_id = datapoint_models.datapoint_provider_id
                  AND dm2.model_instance_key = datapoint_models.model_instance_key
              )
            RETURNING id
          ) SELECT COUNT(*) AS cnt FROM moved
        `,
          [m.winner.id, m.loser.id],
        );
        moved += parseInt(mv[0].cnt, 10);

        // Delete remaining
        const { rows: del } = await client.query(
          'DELETE FROM datapoint_models WHERE super_model_id = $1 RETURNING id',
          [m.loser.id],
        );
        deleted += del.length;

        // Update base_model refs
        const { rows: ref } = await client.query(
          'UPDATE super_models SET base_model = $1 WHERE base_model = $2 RETURNING id',
          [m.winner.slug, m.loser.slug],
        );
        refUpdates += ref.length;

        // Merge metadata
        const fields = ['base_creator', 'creator', 'derivation_method', 'family'];
        for (const f of fields) {
          await client.query(
            `UPDATE super_models SET ${f} = COALESCE(super_models.${f}, loser.${f})
             FROM (SELECT ${f} FROM super_models WHERE id = $1) AS loser WHERE id = $2`,
            [m.loser.id, m.winner.id],
          );
        }

        await client.query('DELETE FROM super_models WHERE id = $1', [m.loser.id]);
        await client.query('COMMIT');
        applied++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ERROR: ${err.message}`);
      }
    }

    console.log(`${'='.repeat(60)}`);
    if (APPLY) {
      console.log(
        `Merges: ${applied}  Datapoints moved: ${moved}  Deleted: ${deleted}  Refs updated: ${refUpdates}`,
      );
    } else {
      console.log(`${merges.length} merges proposed (dry run — use --apply to write)`);
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
