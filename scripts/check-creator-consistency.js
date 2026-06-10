#!/usr/bin/env node
/**
 * check-creator-consistency.js
 *
 * Post-sync sanity check: flags small creators (≤ 2 models) whose names fuzzy-match
 * a larger creator, surfacing potential split entries from non-canonical creator names.
 *
 * Usage:
 *   node scripts/check-creator-consistency.js          # dry-run (reports)
 *   node scripts/check-creator-consistency.js --apply  # auto-merge flagged entries
 *   node scripts/check-creator-consistency.js --json   # JSON output (for nightly logging)
 *
 * Exit code: 0 = clean, 1 = found issues (or error)
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// ── Normalize for comparison ──
function normalizeForCompare(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')  // strip punctuation
    .replace(/\b(llc|inc|ltd|corp|pbc|co|group|holdings|ai|technologies|research|foundation)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Configuration ──
const SMALL_THRESHOLD = 2;    // creators with ≤ N models are "small" and candidates
const LARGE_THRESHOLD = 3;    // creators with ≥ N models are "large" (merge target)
const MIN_LENGTH = 4;         // ignore names shorter than this (too many false positives)

function isFuzzyMatch(smallName, largeName) {
  const sn = normalizeForCompare(smallName);
  const ln = normalizeForCompare(largeName);

  if (sn.length < MIN_LENGTH || ln.length < MIN_LENGTH) return false;

  // Substring containment (one normalized form contains the other).
  // This catches: "NovitaAI" ↔ "Novita AI", "AI2" ↔ "AllenAI" after stripping,
  // "Inflection AI" ↔ "Inflection", etc.
  // Does NOT catch "Qwen" ↔ "Alibaba" — those need explicit overrides in the registry.
  return sn.includes(ln) || ln.includes(sn);
}

async function main() {
  const dryRun = !process.argv.includes('--apply');
  const jsonOut = process.argv.includes('--json');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    // Get all creators with model counts
    const { rows } = await client.query(`
      SELECT
        LOWER(TRIM(creator)) AS creator_key,
        creator AS display_name,
        COUNT(*) AS model_count,
        array_agg(name ORDER BY name) AS model_names
      FROM super_models
      WHERE creator IS NOT NULL
      GROUP BY LOWER(TRIM(creator)), creator
      ORDER BY model_count DESC
    `);

    const small = rows.filter(r => r.model_count <= SMALL_THRESHOLD);
    const large = rows.filter(r => r.model_count >= LARGE_THRESHOLD);

    // Check 1: Same normalized display name, different creator key.
    // This catches the original qwen/Alibaba split: both display as "Alibaba"
    // but one has creator_key "alibaba" and the other "qwen".
    const displayNameMap = new Map(); // normalized display name → [{key, display_name, model_count, model_names}]
    for (const r of rows) {
      const dn = normalizeForCompare(r.display_name);
      if (!displayNameMap.has(dn)) displayNameMap.set(dn, []);
      displayNameMap.get(dn).push(r);
    }

    const issues = [];
    for (const entries of displayNameMap.values()) {
      if (entries.length < 2) continue;
      // Sort by model_count descending — the largest is the merge target
      entries.sort((a, b) => b.model_count - a.model_count);
      const [target, ...rest] = entries;
      for (const sc of rest) {
        issues.push({
          type: 'same_display_name',
          small_key: sc.creator_key,
          small_name: sc.display_name,
          small_count: sc.model_count,
          small_models: sc.model_names,
          large_key: target.creator_key,
          large_name: target.display_name,
          large_count: target.model_count,
        });
      }
    }

    // Check 2: Small creators whose normalized name is a substring of a large creator's name.
    // Catches casing/spacing variants like "NovitaAI" ↔ "Novita AI".
    for (const sc of small) {
      for (const lc of large) {
        if (sc.creator_key === lc.creator_key) continue;
        // Skip if already flagged by same-display-name check
        if (issues.some(i => i.small_key === sc.creator_key && i.large_key === lc.creator_key)) continue;

        if (isFuzzyMatch(sc.display_name, lc.display_name)) {
          issues.push({
            type: 'substring_match',
            small_key: sc.creator_key,
            small_name: sc.display_name,
            small_count: sc.model_count,
            small_models: sc.model_names,
            large_key: lc.creator_key,
            large_name: lc.display_name,
            large_count: lc.model_count,
          });
          break;
        }
      }
    }

    if (issues.length === 0) {
      if (jsonOut) {
        console.log(JSON.stringify({ status: 'clean', issues: [] }));
      } else {
        console.log('✓ Creator consistency check passed — no potential split entries found.');
      }
      return;
    }

    // Report
    if (jsonOut) {
      console.log(JSON.stringify({ status: 'issues_found', issues }, null, 2));
    } else {
      console.log(`⚠ Creator consistency check found ${issues.length} potential split(s):\n`);
      for (const iss of issues) {
        console.log(`  "${iss.small_name}" (${iss.small_count} model${iss.small_count > 1 ? 's' : ''})`);
        console.log(`    may belong to → "${iss.large_name}" (${iss.large_count} models)`);
        console.log(`    Models: ${iss.small_models.join(', ')}`);
        console.log('');
      }
    }

    // Apply
    if (!dryRun) {
      console.log('Applying merges...');
      let totalUpdated = 0;
      for (const iss of issues) {
        const { rowCount } = await client.query(
          `UPDATE super_models SET creator = $1 WHERE LOWER(TRIM(creator)) = $2`,
          [iss.large_name, iss.small_key]
        );
        if (rowCount > 0) {
          console.log(`  ${iss.small_name} → ${iss.large_name}: ${rowCount} model${rowCount > 1 ? 's' : ''} updated`);
        }
        totalUpdated += rowCount;
      }
      console.log(`\nMerged ${issues.length} creator(s), ${totalUpdated} models updated.`);
    } else {
      console.log(`Dry run — use --apply to merge automatically.`);
    }

    // Exit 1 if issues found (for CI/nightly alerting)
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
