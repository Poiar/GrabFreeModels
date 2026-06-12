#!/usr/bin/env node
/**
 * merge-name-variant-dupes.js
 * Merge duplicate super_models whose names differ only in punctuation /
 * whitespace formatting (e.g. "GPT-5" vs "GPT 5", "DeepSeek-V3" vs "DeepSeek V3").
 *
 * Grouping is by bareName — the name with all non-alphanumeric characters
 * stripped and lowercased. Models in the same group are considered the same
 * underlying model and are merged.
 *
 * Usage:
 *   node scripts/merge-name-variant-dupes.js          # dry-run
 *   node scripts/merge-name-variant-dupes.js --apply  # write to DB
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../server/db');

const APPLY = process.argv.includes('--apply');

// ── Helpers ──

function bareName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/* eslint-disable no-unused-vars */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-{2,}/g, '-');
}
/* eslint-enable no-unused-vars */

function pickWinner(models) {
  // Priority:
  // 1. More datapoints (providers) = more authoritative
  // 2. Shorter slug (fewer hyphen segments) = more canonical
  // 3. Slug that does NOT start with a provider prefix
  // 4. Alphabetical

  models.sort((a, b) => {
    const dpDiff = b.dp_count - a.dp_count;
    if (dpDiff !== 0) return dpDiff;

    const aSegments = a.slug.split('-').length;
    const bSegments = b.slug.split('-').length;
    if (aSegments !== bSegments) return aSegments - bSegments;

    // Prefer slugs that start with a letter (not an org prefix with slash)
    const aClean = /^[a-z]/.test(a.slug) ? 0 : 1;
    const bClean = /^[a-z]/.test(b.slug) ? 0 : 1;
    if (aClean !== bClean) return aClean - bClean;

    return a.slug.localeCompare(b.slug);
  });

  return models[0];
}

// ── Main ──

(async () => {
  const client = await pool.connect();

  try {
    console.log(APPLY ? '=== APPLY MODE ===\n' : '=== DRY RUN ===\n');

    // Load all active super_models with provider counts
    const { rows: models } = await client.query(`
      SELECT sm.id, sm.name, sm.slug, sm.creator, sm.base_creator, sm.base_model,
             sm.derivation_method, sm.family,
             COUNT(dm.id) FILTER (WHERE NOT dm.is_removed) AS dp_count,
             array_agg(DISTINCT dp.slug ORDER BY dp.slug) FILTER (WHERE dm.is_free = true AND NOT dm.is_removed) AS free_providers
      FROM super_models sm
      LEFT JOIN datapoint_models dm ON dm.super_model_id = sm.id
      LEFT JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      GROUP BY sm.id
      ORDER BY sm.slug
    `);

    // Group by bareName
    const groups = new Map();
    for (const m of models) {
      const bare = bareName(m.name);
      if (!groups.has(bare)) groups.set(bare, []);
      groups.get(bare).push(m);
    }

    // Filter to groups with >1 member
    const dupeGroups = [...groups.entries()]
      .filter(([, members]) => members.length > 1)
      .sort((a, b) => b[1].length - a[1].length);

    console.log(
      `Found ${dupeGroups.length} duplicate groups among ${groups.size} bare-name groups.\n`,
    );

    if (dupeGroups.length === 0) {
      console.log('No duplicates found — nothing to merge.');
      await pool.end();
      return;
    }

    let totalMerges = 0;
    let totalDatapointsMoved = 0;
    let totalDatapointsDeleted = 0;
    let totalBaseModelUpdates = 0;
    let skippedCreatorConflict = 0;

    for (const [bare, members] of dupeGroups) {
      // Skip groups where creators conflict (needs manual review)
      const creators = [...new Set(members.map((m) => m.creator).filter(Boolean))];
      if (creators.length > 1) {
        console.log(`  SKIP ${bare}: conflicting creators [${creators.join(', ')}]`);
        console.log(`    ${members.map((m) => `${m.name} (${m.slug})`).join(', ')}`);
        skippedCreatorConflict++;
        continue;
      }

      const winner = pickWinner(members);
      const losers = members.filter((m) => m.id !== winner.id);

      console.log(`  ${bare}: ${members.length} dupes`);
      console.log(`    WINNER: ${winner.name} (${winner.slug}) — ${winner.dp_count} providers`);
      for (const loser of losers) {
        const reasons = [];
        if (loser.dp_count < winner.dp_count)
          reasons.push(`fewer providers (${loser.dp_count} vs ${winner.dp_count})`);
        if (loser.slug.split('-').length > winner.slug.split('-').length)
          reasons.push('longer slug');
        console.log(`    LOSER : ${loser.name} (${loser.slug}) — ${reasons.join(', ')}`);
      }

      if (!APPLY) {
        totalMerges += losers.length;
        continue;
      }

      // Apply merge — one loser at a time in a transaction
      for (const loser of losers) {
        try {
          await client.query('BEGIN');

          // 1. Move non-conflicting datapoints from loser to winner
          const { rows: moved } = await client.query(
            `
            WITH moved AS (
              UPDATE datapoint_models dm
              SET super_model_id = $1, updated_at = now()
              WHERE super_model_id = $2
                AND NOT EXISTS (
                  SELECT 1 FROM datapoint_models dm2
                  WHERE dm2.super_model_id = $1
                    AND dm2.datapoint_provider_id = dm.datapoint_provider_id
                    AND dm2.model_instance_key = dm.model_instance_key
                )
              RETURNING dm.id
            )
            SELECT COUNT(*) AS cnt FROM moved
          `,
            [winner.id, loser.id],
          );
          const movedCount = parseInt(moved[0].cnt, 10);
          totalDatapointsMoved += movedCount;

          // 2. Delete remaining (conflicting) datapoints from loser
          const { rows: deleted } = await client.query(
            'DELETE FROM datapoint_models WHERE super_model_id = $1 RETURNING id',
            [loser.id],
          );
          totalDatapointsDeleted += deleted.length;

          // 3. Update base_model references pointing to loser slug
          const { rows: updated } = await client.query(
            'UPDATE super_models SET base_model = $1 WHERE base_model = $2 RETURNING id',
            [winner.slug, loser.slug],
          );
          totalBaseModelUpdates += updated.length;

          // 4. Update base_creator if winner is missing it
          if (!winner.base_creator && loser.base_creator) {
            await client.query('UPDATE super_models SET base_creator = $1 WHERE id = $2', [
              loser.base_creator,
              winner.id,
            ]);
            winner.base_creator = loser.base_creator;
          }

          // 5. Update creator if winner is missing it
          if (!winner.creator && loser.creator) {
            await client.query('UPDATE super_models SET creator = $1 WHERE id = $2', [
              loser.creator,
              winner.id,
            ]);
            winner.creator = loser.creator;
          }

          // 6. Merge derivation_method if winner is missing it
          if (!winner.derivation_method && loser.derivation_method) {
            await client.query('UPDATE super_models SET derivation_method = $1 WHERE id = $2', [
              loser.derivation_method,
              winner.id,
            ]);
            winner.derivation_method = loser.derivation_method;
          }

          // 7. Merge family if winner is missing it
          if (!winner.family && loser.family) {
            await client.query('UPDATE super_models SET family = $1 WHERE id = $2', [
              loser.family,
              winner.id,
            ]);
            winner.family = loser.family;
          }

          // 8. Delete the loser super_model
          await client.query('DELETE FROM super_models WHERE id = $1', [loser.id]);

          await client.query('COMMIT');

          console.log(
            `      Merged: ${movedCount} dp moved, ${deleted.length} deleted, ${updated.length} base_model refs updated`,
          );
          totalMerges++;
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`      ERROR merging ${loser.slug}: ${err.message}`);
          throw err;
        }
      }
    }

    // ── Summary ──
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Duplicate groups:  ${dupeGroups.length}`);
    console.log(`Skipped (conflicting creators): ${skippedCreatorConflict}`);
    if (APPLY) {
      console.log(`Merges applied:    ${totalMerges}`);
      console.log(`Datapoints moved:  ${totalDatapointsMoved}`);
      console.log(`Datapoints deleted: ${totalDatapointsDeleted}`);
      console.log(`Base model updates: ${totalBaseModelUpdates}`);
    } else {
      console.log(`Merges proposed:   ${totalMerges}  (dry run — use --apply to write)`);
    }

    if (skippedCreatorConflict > 0) {
      console.log(`\n⚠  ${skippedCreatorConflict} groups skipped due to creator conflicts.`);
      console.log('   These need manual review — models with different creators might');
      console.log('   genuinely be different models that happen to share a normalized name.');
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
