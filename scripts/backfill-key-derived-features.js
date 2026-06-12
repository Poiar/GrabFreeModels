#!/usr/bin/env node
/**
 * backfill-key-derived-features.js
 *
 * Derives structured features from model_instance_key patterns and writes them
 * to datapoint_model_features. Idempotent — deletes and re-inserts all
 * key-derived features on each run.
 *
 * Extracts: model_tier, model_variant, param_count_b, active_param_count_b,
 *           thinking_variant, model_version, release_stage, coding_specialized,
 *           modality markers.
 *
 * Usage: node scripts/backfill-key-derived-features.js [--apply]
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

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
const pool = new Pool({
  connectionString,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

// ── Pattern definitions ──

const TIER_WORDS = new Set([
  'flash',
  'pro',
  'lite',
  'nano',
  'mini',
  'turbo',
  'plus',
  'max',
  'ultra',
  'large',
  'small',
  'omni',
]);

const VARIANT_WORDS = new Set(['instruct', 'chat', 'base']);

const STAGE_WORDS = new Set([
  'preview',
  'experimental',
  'exp',
  'latest',
  'dev',
  'stable',
  'beta',
  'alpha',
]);

function extractFeatures(key) {
  if (!key) return {};

  // Normalize: handle :thinking, :free colon suffixes by also treating : as separator
  const workingKey = key.replace(/:free$/i, '').replace(/:thinking$/i, '-thinking');

  // Get the model name part (after last /)
  const slashIdx = workingKey.lastIndexOf('/');
  const modelName = slashIdx >= 0 ? workingKey.slice(slashIdx + 1) : workingKey;

  // Split into segments
  const segments = modelName.split(/[-._]/).filter(Boolean);
  const segsLower = segments.map((s) => s.toLowerCase());

  const result = {};

  // ── Parameter count: scan for patterns like 8b, 70b, 235b-a22b ──
  for (let i = 0; i < segsLower.length; i++) {
    const seg = segsLower[i];
    const baseParamMatch = seg.match(/^(\d+)b$/);
    if (baseParamMatch) {
      result.param_count_b = baseParamMatch[1];
      // Check next segment for active params or expert count
      if (i + 1 < segsLower.length) {
        const activeMatch = segsLower[i + 1].match(/^a(\d+)b$/);
        if (activeMatch) result.active_param_count_b = activeMatch[1];
        const expertMatch = segsLower[i + 1].match(/^(\d+)e$/);
        if (expertMatch) result.expert_count = expertMatch[1];
      }
    }
    // Also match format like "30b-a3b" in a single segment (already split by - though)
    const compoundMatch = seg.match(/^(\d+)b-a(\d+)b$/);
    if (compoundMatch) {
      result.param_count_b = compoundMatch[1];
      result.active_param_count_b = compoundMatch[2];
    }
  }

  // ── Classify each segment ──
  for (let i = 0; i < segsLower.length; i++) {
    const seg = segsLower[i];

    // Skip segments that are param counts
    if (/^\d+b$/.test(seg) || /^a\d+b$/.test(seg) || /^\d+e$/.test(seg)) continue;

    // Tier — collect all matches (flash-lite → both flash and lite)
    if (TIER_WORDS.has(seg)) {
      if (!result.model_tier) result.model_tier = [];
      result.model_tier.push(seg);
      continue;
    }

    // Variant
    if (VARIANT_WORDS.has(seg)) {
      result.model_variant = seg;
      continue;
    }

    // Stage
    if (STAGE_WORDS.has(seg)) {
      result.release_stage = seg === 'exp' ? 'experimental' : seg;
      continue;
    }

    // Thinking
    if (seg === 'thinking' || (seg.startsWith('think') && seg.length <= 10)) {
      result.thinking_variant = 'true';
      continue;
    }

    // Coding specialization
    if (seg === 'coder' || seg === 'code') {
      result.coding_specialized = 'true';
      continue;
    }

    // Vision / multimodal
    if (seg === 'vision' || seg === 'vl' || seg === 'visual' || seg === 'image') {
      result.modality_vision = 'true';
      continue;
    }
    if (seg === 'video') {
      result.modality_video = 'true';
      continue;
    }

    // Audio
    if (seg === 'audio' || seg === 'speech' || seg === 'voice' || seg === 'tts' || seg === 'stt') {
      result.modality_audio = 'true';
      continue;
    }

    // Version (v-prefixed or date-like)
    const vMatch = seg.match(/^v?(\d+\.\d+(?:\.\d+)?)$/);
    if (vMatch) {
      result.model_version = vMatch[1];
      continue;
    }
    // Date-based version: 4-6 digit numbers (but not year-like 4-digit at start of name)
    if (/^\d{4,6}$/.test(seg) && !result.model_version) {
      // Filter out things that look like years in model family names
      // Only capture if it looks like a date code (month-day or year-month)
      if (seg.length === 4) {
        // 0324 = March 24, 2506 = June 2025 — plausible version dates
        result.model_version = seg;
      } else if (seg.length === 6) {
        // 250625 = June 25, 2025
        result.model_version = seg;
      }
    }
  }

  return result;
}

// ── Main ──

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '🔧 --apply: will write to DB' : '🔍 --dry-run: preview only');

  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `SELECT dm.id, dm.full_id, dm.model_instance_key
       FROM datapoint_models dm
       WHERE dm.is_removed = false
       ORDER BY dm.id`,
    );
    console.log(`\nLoaded ${rows.length} datapoint_models\n`);

    const toInsert = [];
    const stats = {
      model_tier: 0,
      model_variant: 0,
      param_count_b: 0,
      active_param_count_b: 0,
      expert_count: 0,
      thinking_variant: 0,
      model_version: 0,
      release_stage: 0,
      coding_specialized: 0,
      modality_vision: 0,
      modality_video: 0,
      modality_audio: 0,
    };

    for (const row of rows) {
      const feat = extractFeatures(row.model_instance_key);

      for (const [type, val] of Object.entries(feat)) {
        if (Array.isArray(val)) {
          for (const v of val) {
            toInsert.push({ dmId: row.id, type, val: v });
            if (stats[type] !== undefined) stats[type]++;
          }
        } else {
          toInsert.push({ dmId: row.id, type, val });
          if (stats[type] !== undefined) stats[type]++;
        }
      }

      // Show sample extractions
      if (Object.keys(feat).length > 0) {
        const preview = Object.entries(feat)
          .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('+') : v}`)
          .join(', ');
        console.log(`  ${row.model_instance_key.padEnd(60)} → ${preview}`);
      }
    }

    console.log(`\n📊 Summary:`);
    for (const [type, count] of Object.entries(stats)) {
      console.log(`  ${type}: ${count}`);
    }
    console.log(`  Total feature rows to insert: ${toInsert.length}`);

    if (apply) {
      // Delete all existing key-derived features
      const KEY_DERIVED_TYPES = [
        'model_tier',
        'model_variant',
        'param_count_b',
        'active_param_count_b',
        'expert_count',
        'thinking_variant',
        'model_version',
        'release_stage',
        'coding_specialized',
        'modality_vision',
        'modality_video',
        'modality_audio',
      ];
      await client.query(`DELETE FROM datapoint_model_features WHERE feature_type = ANY($1)`, [
        KEY_DERIVED_TYPES,
      ]);
      console.log(`\n🗑️  Deleted existing key-derived features`);

      // Use unnest to avoid Neon parameter-count limits and type-inference issues
      if (toInsert.length > 0) {
        const dmIds = toInsert.map((x) => x.dmId);
        const types = toInsert.map((x) => x.type);
        const vals = toInsert.map((x) => x.val);

        await client.query(
          `INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
           SELECT * FROM unnest($1::int[], $2::text[], $3::text[])`,
          [dmIds, types, vals],
        );
        console.log(`✅ Inserted ${toInsert.length} feature rows`);
      }
    } else {
      console.log(`\n💡 Run with --apply to write these features to the DB.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
