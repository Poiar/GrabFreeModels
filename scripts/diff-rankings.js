#!/usr/bin/env node
/**
 * diff-rankings.js
 * Compares two ranking snapshots and reports changes per role.
 *
 * Usage:
 *   node scripts/diff-rankings.js old.json new.json          # compare two JSON files
 *   node scripts/diff-rankings.js --db --prior prior.json    # compare DB vs JSON file
 *   node scripts/diff-rankings.js --db --prior 2026-06-01    # compare DB vs git snapshot at date
 *   node scripts/diff-rankings.js ... --json                 # machine-readable JSON output
 */

require('dotenv').config();
const fs = require('fs');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const JSON_OUTPUT = args.includes('--json');
const USE_DB = args.includes('--db');

// Score component keys expected in _scores entries
const COMPONENT_KEYS = ['ctxContrib', 'tagBonus', 'qualityBonus'];

function usage() {
  console.error('Usage:');
  console.error('  node scripts/diff-rankings.js old.json new.json');
  console.error('  node scripts/diff-rankings.js --db --prior <file.json | YYYY-MM-DD>');
  console.error('  node scripts/diff-rankings.js ... --json');
  process.exit(1);
}

function loadJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load ' + filePath + ': ' + e.message);
    process.exit(1);
  }
}

function extractRankings(data) {
  // Rankings are stored under _role_rankings, or directly as { role: [ids] }
  if (data._role_rankings) return data._role_rankings;
  return data;
}

function extractScores(data) {
  // Scores detail is stored under _role_rankings._scores or top-level _scores
  const rankings = data._role_rankings || data;
  if (rankings._scores) return rankings._scores;
  if (data._scores) return data._scores;
  return null;
}

function getRoles(rankings) {
  return Object.keys(rankings).filter((k) => !k.startsWith('_'));
}

function getPriorDate(dateStr) {
  // Validate YYYY-MM-DD format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return dateStr;
}

function loadPriorFromGit(dateStr) {
  const ref = 'available-models.json';
  try {
    const raw = execSync('git show "' + dateStr + ':' + ref + '"', {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load prior snapshot from git at ' + dateStr + ': ' + e.message);
    process.exit(1);
  }
}

function loadDbRankings() {
  const pool = require('../server/db');
  return pool.query("SELECT value::text FROM metadata WHERE key = '_role_rankings'").then((result) => {
    if (result.rows.length === 0) {
      console.error('No _role_rankings found in DB metadata.');
      process.exit(1);
    }
    return pool.end().then(() => JSON.parse(result.rows[0].value));
  });
}

function findInScores(scores, modelId, role) {
  if (!scores || !scores[role]) return null;
  return scores[role].find((s) => s.id === modelId) || null;
}

async function main() {
  let oldData, newData;

  if (USE_DB) {
    // Load new from DB, old from --prior
    const priorIdx = args.indexOf('--prior');
    if (priorIdx === -1) usage();

    const priorArg = args[priorIdx + 1];
    if (!priorArg) usage();

    // Check if priorArg is a file path
    if (fs.existsSync(priorArg)) {
      oldData = loadJsonFile(priorArg);
    } else if (getPriorDate(priorArg)) {
      oldData = loadPriorFromGit(priorArg);
    } else {
      console.error('--prior must be a JSON file path or a YYYY-MM-DD date.');
      process.exit(1);
    }

    newData = await loadDbRankings();
  } else {
    // Compare two files
    const positionalArgs = [];
    for (const a of process.argv.slice(2)) {
      if (a.startsWith('-')) continue;
      positionalArgs.push(a);
    }

    if (positionalArgs.length !== 2) usage();

    oldData = loadJsonFile(positionalArgs[0]);
    newData = loadJsonFile(positionalArgs[1]);
  }

  const oldRankings = extractRankings(oldData);
  const newRankings = extractRankings(newData);
  const oldScores = extractScores(oldData);
  const newScores = extractScores(newData);

  const roles = getRoles(newRankings);
  const allRoles = [...new Set([...roles, ...getRoles(oldRankings)])].sort();

  const results = {};

  for (const role of allRoles) {
    const oldList = oldRankings[role] || [];
    const newList = newRankings[role] || [];
    const oldSet = new Set(oldList);
    const newSet = new Set(newList);

    const added = newList.filter((id) => !oldSet.has(id));
    const removed = oldList.filter((id) => !newSet.has(id));

    // Build position maps
    const oldPos = {};
    oldList.forEach((id, i) => (oldPos[id] = i));
    const newPos = {};
    newList.forEach((id, i) => (newPos[id] = i));

    // Find movers: models present in both, rank changed by 3+ positions
    const movers = [];
    for (const id of oldList) {
      if (!newSet.has(id)) continue;
      const oldIdx = oldPos[id];
      const newIdx = newPos[id];
      const delta = oldIdx - newIdx; // positive = moved up, negative = moved down
      if (Math.abs(delta) >= 3) {
        const oldRank = oldIdx + 1;
        const newRank = newIdx + 1;
        const oldScoreEntry = findInScores(oldScores, id, role);
        const newScoreEntry = findInScores(newScores, id, role);

        const componentDiffs = {};
        let biggestChange = '';
        let biggestDelta = 0;

        for (const key of COMPONENT_KEYS) {
          const oldVal = oldScoreEntry ? oldScoreEntry[key] : undefined;
          const newVal = newScoreEntry ? newScoreEntry[key] : undefined;
          if (oldVal !== undefined && newVal !== undefined) {
            const diff = newVal - oldVal;
            componentDiffs[key] = diff;
            if (Math.abs(diff) > Math.abs(biggestDelta)) {
              biggestDelta = diff;
              biggestChange = key;
            }
          }
        }

        const totalOld = oldScoreEntry ? oldScoreEntry.score : null;
        const totalNew = newScoreEntry ? newScoreEntry.score : null;

        movers.push({
          id,
          old_rank: oldRank,
          new_rank: newRank,
          rank_delta: delta,
          score_before: totalOld,
          score_after: totalNew,
          component_deltas: componentDiffs,
          biggest_change: biggestChange,
        });
      }
    }

    results[role] = {
      old_count: oldList.length,
      new_count: newList.length,
      added,
      removed,
      movers,
    };
  }

  // Output
  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify({
      generated_at: new Date().toISOString(),
      old_source: USE_DB ? 'current DB' : args[0] || 'unknown',
      new_source: USE_DB ? 'DB (_role_rankings)' : args[1] || 'unknown',
      results,
    }, null, 2) + '\n');
  } else {
    console.log('\n=== Ranking Diff ===\n');
    for (const role of allRoles) {
      const r = results[role];
      console.log('--- ' + role + ' (' + r.old_count + ' -> ' + r.new_count + ' models) ---');

      // New entries
      if (r.added.length > 0) {
        console.log('  New entries (' + r.added.length + '):');
        for (const id of r.added.slice(0, 10)) {
          console.log('    + ' + id);
        }
        if (r.added.length > 10) console.log('    ... and ' + (r.added.length - 10) + ' more');
      }

      // Dropped entries
      if (r.removed.length > 0) {
        console.log('  Dropped entries (' + r.removed.length + '):');
        for (const id of r.removed.slice(0, 10)) {
          console.log('    - ' + id);
        }
        if (r.removed.length > 10) console.log('    ... and ' + (r.removed.length - 10) + ' more');
      }

      // Movers
      if (r.movers.length > 0) {
        console.log('  Movers (rank change >= 3):');
        // Sort by absolute delta
        const sorted = [...r.movers].sort((a, b) => Math.abs(b.rank_delta) - Math.abs(a.rank_delta));
        for (const m of sorted) {
          const dir = m.rank_delta > 0 ? 'up' : 'down';
          const compStr = m.biggest_change ? ' [' + m.biggest_change + ' changed most]' : '';
          const scoreStr = m.score_before !== null && m.score_after !== null
            ? ' score: ' + m.score_before.toFixed(3) + ' -> ' + m.score_after.toFixed(3)
            : '';
          console.log('    ~ ' + m.id + ': #' + m.old_rank + ' -> #' + m.new_rank + ' (' + dir + ' ' + Math.abs(m.rank_delta) + ')' + scoreStr + compStr);
        }
      }

      if (r.added.length === 0 && r.removed.length === 0 && r.movers.length === 0) {
        console.log('  No changes.');
      }

      console.log('');
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
