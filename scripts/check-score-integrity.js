#!/usr/bin/env node
/**
 * check-score-integrity.js
 * Detects anomalous benchmark scores in the model_scores table:
 *   - Individual scores >3 sigma from their score_type mean (outliers)
 *   - Per-model score deltas >50% between consecutive imports
 *
 * Usage:
 *   node scripts/check-score-integrity.js          # human-readable output
 *   node scripts/check-score-integrity.js --json   # machine-readable JSON
 */

require('dotenv').config();
const pool = require('../server/db');

const args = process.argv.slice(2);
const JSON_OUTPUT = args.includes('--json');

function mean(values) {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / n;
}

function stddev(values, meanVal) {
  const n = values.length;
  if (n < 2) return 0;
  let sumSq = 0;
  for (const v of values) sumSq += (v - meanVal) ** 2;
  return Math.sqrt(sumSq / (n - 1));
}

async function main() {
  // Check table exists
  try {
    await pool.query('SELECT 1 FROM model_scores LIMIT 1');
  } catch {
    const msg = 'model_scores table does not exist or is empty.';
    if (JSON_OUTPUT) {
      process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    } else {
      console.log(msg);
    }
    await pool.end();
    return;
  }

  // 1. Fetch all scores
  const { rows: allScores } = await pool.query(`
    SELECT ms.id, ms.datapoint_model_id, dm.full_id, ms.source, ms.score_type, ms.score_value, ms.fetched_at
    FROM model_scores ms
    JOIN datapoint_models dm ON dm.id = ms.datapoint_model_id
    ORDER BY ms.score_type, ms.source, ms.datapoint_model_id, ms.fetched_at
  `);

  if (allScores.length === 0) {
    if (JSON_OUTPUT) {
      process.stdout.write(
        JSON.stringify({ outliers: [], deltas: [], summary: { total_scores: 0, score_types: 0 } }) +
          '\n',
      );
    } else {
      console.log('No scores found in model_scores table.');
    }
    await pool.end();
    return;
  }

  // 2. Group by score_type for statistics
  const byType = {};
  for (const s of allScores) {
    if (!byType[s.score_type]) byType[s.score_type] = [];
    byType[s.score_type].push(s);
  }

  const scoreTypeStats = {};
  const outliers = [];
  for (const [type, scores] of Object.entries(byType)) {
    const values = scores.map((s) => Number(s.score_value)).filter((v) => isFinite(v));
    const m = mean(values);
    const sd = stddev(values, m);
    scoreTypeStats[type] = { mean: m, stddev: sd, count: values.length };

    const threshold = 3 * sd;
    for (const s of scores) {
      const v = Number(s.score_value);
      if (!isFinite(v) || sd === 0) continue;
      const deviation = Math.abs(v - m);
      if (deviation > threshold) {
        outliers.push({
          id: s.id,
          full_id: s.full_id || '(unknown)',
          datapoint_model_id: s.datapoint_model_id,
          source: s.source,
          score_type: s.score_type,
          score_value: v,
          type_mean: m,
          type_stddev: sd,
          sigma_above: (v - m) / sd,
          fetched_at: s.fetched_at,
        });
      }
    }
  }

  // 3. Per-model score deltas: compare latest vs previous import
  const deltas = [];
  // Group by (datapoint_model_id, source, score_type)
  const grouped = {};
  for (const s of allScores) {
    const key = s.datapoint_model_id + '|' + s.source + '|' + s.score_type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  for (const entries of Object.values(grouped)) {
    if (entries.length < 2) continue;
    // Sort by fetched_at ascending
    entries.sort((a, b) => new Date(a.fetched_at) - new Date(b.fetched_at));
    const prev = entries[entries.length - 2];
    const latest = entries[entries.length - 1];
    const prevVal = Number(prev.score_value);
    const latestVal = Number(latest.score_value);
    if (!isFinite(prevVal) || !isFinite(latestVal) || prevVal === 0) continue;

    const pctChange = ((latestVal - prevVal) / Math.abs(prevVal)) * 100;
    if (Math.abs(pctChange) > 50) {
      deltas.push({
        full_id: latest.full_id || '(unknown)',
        datapoint_model_id: latest.datapoint_model_id,
        source: latest.source,
        score_type: latest.score_type,
        previous_value: prevVal,
        latest_value: latestVal,
        pct_change: Math.round(pctChange * 10) / 10,
        previous_fetched_at: prev.fetched_at,
        latest_fetched_at: latest.fetched_at,
      });
    }
  }

  // 4. Output
  const hadIssues = outliers.length > 0 || deltas.length > 0;
  const scoreTypes = Object.keys(scoreTypeStats).sort();

  if (JSON_OUTPUT) {
    process.stdout.write(
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          summary: {
            total_scores: allScores.length,
            score_types: scoreTypes.length,
            outliers_found: outliers.length,
            large_deltas_found: deltas.length,
          },
          score_type_stats: scoreTypeStats,
          outliers,
          deltas,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    console.log('\n--- Score Integrity Check ---');
    console.log('Total scores: ' + allScores.length + ' across ' + scoreTypes.length + ' types\n');

    console.log('Score type statistics:');
    for (const type of scoreTypes) {
      const st = scoreTypeStats[type];
      console.log(
        '  ' +
          type +
          ': mean=' +
          st.mean.toFixed(2) +
          ' stddev=' +
          st.stddev.toFixed(2) +
          ' n=' +
          st.count,
      );
    }

    if (outliers.length > 0) {
      console.log('\nOutliers (>3 sigma from type mean):');
      for (const o of outliers) {
        console.log(
          '  [' +
            o.score_type +
            '] ' +
            o.full_id +
            ' (' +
            o.source +
            '): value=' +
            o.score_value +
            ' mean=' +
            o.type_mean.toFixed(2) +
            ' sigma=' +
            o.sigma_above.toFixed(2),
        );
      }
    } else {
      console.log('\nNo statistical outliers detected.');
    }

    if (deltas.length > 0) {
      console.log('\nLarge score deltas (>50% change between imports):');
      for (const d of deltas) {
        console.log(
          '  [' +
            d.score_type +
            '] ' +
            d.full_id +
            ' (' +
            d.source +
            '): ' +
            d.previous_value +
            ' -> ' +
            d.latest_value +
            ' (' +
            d.pct_change +
            '%)',
        );
      }
    } else {
      console.log('\nNo large score deltas between imports.');
    }

    if (hadIssues) {
      console.log(
        '\nIssues found: ' + outliers.length + ' outlier(s), ' + deltas.length + ' large delta(s)',
      );
    } else {
      console.log('\nAll scores pass integrity checks.');
    }
  }

  await pool.end();

  if (hadIssues) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
