#!/usr/bin/env node
/**
 * nightly-summary.js
 * Gathers nightly run stats and sends a digest to Slack/Discord via webhook.
 * Designed to run as the final step of nightly-maintenance.js.
 *
 * Usage:
 *   node scripts/nightly-summary.js              # send to webhook
 *   node scripts/nightly-summary.js --dry-run    # print summary to stdout only
 */

require('dotenv').config();
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const path = require('path');
const pool = require('../server/db');

const DRY_RUN = process.argv.includes('--dry-run');

function getWebhookUrl() {
  return process.env.NIGHTLY_WEBHOOK_URL;
}

function sendWebhook(url, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const data = JSON.stringify(payload);

    const req = mod.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error('Webhook returned ' + res.statusCode + ': ' + body));
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Webhook timeout'));
    });
    req.write(data);
    req.end();
  });
}

/** Build a Slack Block Kit payload from nightly stats */
function buildSlackPayload(stats) {
  const { date, validation, newModels, degradation, rankings } = stats;

  // Determine overall color
  let color = '#36a64f'; // green
  const hasErrors = validation.workingCount > 0 && validation.workingRate < 0.7;
  const hasWarnings = degradation.alerts_count > 0 || Object.keys(rankings.changes || {}).length > 0;
  if (hasErrors) color = '#dc3545'; // red
  else if (hasWarnings) color = '#ffc107'; // yellow

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Nightly Pipeline — ' + date },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: validation.workingCount + ' working / ' + validation.totalFree + ' free models (' + validation.workingRateText + ')',
      },
    },
    { type: 'divider' },
  ];

  // Validation section
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Validation*',
    },
  });

  const vLines = [
    'Tested: ' + validation.testedCount + ' models',
    'Working: ' + validation.workingCount,
    'Broken: ' + validation.brokenCount,
    'Rate-limited: ' + validation.rateLimitedCount,
    'Untested: ' + validation.untestedCount,
    'Not found: ' + validation.notFoundCount,
  ];

  const healthEmoji = validation.workingRate >= 0.9 ? '✅' : validation.workingRate >= 0.7 ? '⚠️' : '❌';
  vLines.push(healthEmoji + ' Health: ' + validation.workingRateText);

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: vLines.join('\n') },
  });

  // New models section
  if (newModels.count > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*New Models Discovered*: ' + newModels.count + ' new' + (newModels.examples.length > 0 ? '\n' + newModels.examples.slice(0, 5).map(function (id) { return '• ' + id; }).join('\n') : '') + (newModels.examples.length > 5 ? '\n... and ' + (newModels.examples.length - 5) + ' more' : ''),
      },
    });
  }

  // Degradation section
  if (degradation.alerts_count > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Degradation Alerts*: ' + degradation.alerts_count + ' model(s)' + '\nRun date: ' + degradation.run_date,
      },
    });

    for (var a = 0; a < Math.min(degradation.alerts.length, 10); a++) {
      var alert = degradation.alerts[a];
      var alertLines = ['*' + alert.full_id + '* (' + alert.provider + ')'];
      for (var b = 0; b < alert.alerts.length; b++) {
        alertLines.push('• ' + alert.alerts[b].message);
      }
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: alertLines.join('\n') },
      });
    }
    if (degradation.alerts.length > 10) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '... and ' + (degradation.alerts.length - 10) + ' more alerts' },
      });
    }
  }

  // Rankings section
  var rankingChanges = rankings.changes || {};
  var rankingKeys = Object.keys(rankingChanges);
  var totalRankingChanges = 0;
  for (var r = 0; r < rankingKeys.length; r++) {
    totalRankingChanges += rankingChanges[rankingKeys[r]].added.length + rankingChanges[rankingKeys[r]].removed.length;
  }

  if (totalRankingChanges > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Ranking Changes*',
      },
    });

    for (var roleIdx = 0; roleIdx < rankingKeys.length; roleIdx++) {
      var role = rankingKeys[roleIdx];
      var rc = rankingChanges[role];

      var roleLines = [];
      if (rc.added.length > 0) {
        roleLines.push('*Added* (' + rc.added.length + '):');
        for (var ai = 0; ai < Math.min(rc.added.length, 5); ai++) {
          roleLines.push('  + ' + rc.added[ai]);
        }
        if (rc.added.length > 5) roleLines.push('  ... and ' + (rc.added.length - 5) + ' more');
      }
      if (rc.removed.length > 0) {
        roleLines.push('*Removed* (' + rc.removed.length + '):');
        for (var ri = 0; ri < Math.min(rc.removed.length, 5); ri++) {
          roleLines.push('  - ' + rc.removed[ri]);
        }
        if (rc.removed.length > 5) roleLines.push('  ... and ' + (rc.removed.length - 5) + ' more');
      }

      if (roleLines.length > 0) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: '*' + role + '*\n' + roleLines.join('\n') },
        });
      }
    }
  }

  return {
    text: 'Nightly Pipeline — ' + date + ' (' + validation.workingCount + '/' + validation.totalFree + ' working)',
    attachments: [
      {
        color: color,
        blocks: blocks,
      },
    ],
  };
}

async function main() {
  var today = new Date().toISOString().slice(0, 10);
  var stats = {
    date: today,
    validation: {
      testedCount: 0,
      workingCount: 0,
      brokenCount: 0,
      rateLimitedCount: 0,
      untestedCount: 0,
      notFoundCount: 0,
      totalFree: 0,
      workingRate: 0,
      workingRateText: '0%',
    },
    newModels: {
      count: 0,
      examples: [],
    },
    degradation: {
      alerts_count: 0,
      run_date: today,
      alerts: [],
    },
    rankings: {
      changes: {},
    },
  };

  // 1. Query test observation counts for today
  try {
    var obsResult = await pool.query(
      'SELECT COUNT(*)::int AS total, COUNT(DISTINCT full_id)::int AS models FROM test_observations WHERE tested_at::date >= $1',
      [today],
    );
    stats.validation.testedCount = parseInt(obsResult.rows[0].models, 10) || 0;
  } catch (e) {
    console.log('Warning: could not query test_observations: ' + e.message);
  }

  // 2. Query _test_summary for working/broken/rate_limited counts
  try {
    var summaryResult = await pool.query(
      "SELECT value::text FROM metadata WHERE key = '_test_summary'",
    );
    if (summaryResult.rows.length > 0) {
      var summary = JSON.parse(summaryResult.rows[0].value);
      var results = summary.results || {};
      stats.validation.workingCount = (results.working || []).length;
      stats.validation.brokenCount = (results.broken || []).length;
      stats.validation.rateLimitedCount = (results.rate_limited || []).length;
      stats.validation.untestedCount = (results.untested || []).length;
      stats.validation.notFoundCount = (results.not_found || []).length;
      stats.validation.totalFree = stats.validation.workingCount + stats.validation.brokenCount + stats.validation.rateLimitedCount + stats.validation.untestedCount + stats.validation.notFoundCount;
      stats.validation.workingRate = stats.validation.totalFree > 0 ? stats.validation.workingCount / stats.validation.totalFree : 0;
      stats.validation.workingRateText = Math.round(stats.validation.workingRate * 100) + '%';
    }
  } catch (e) {
    console.log('Warning: could not query _test_summary: ' + e.message);
  }

  // 3. New models discovered today
  try {
    var newResult = await pool.query(
      'SELECT full_id FROM datapoint_models WHERE created_at::date >= $1 ORDER BY created_at DESC',
      [today],
    );
    stats.newModels.count = newResult.rows.length;
    stats.newModels.examples = newResult.rows.map(function (r) { return r.full_id; });
  } catch (e) {
    console.log('Warning: could not query new models: ' + e.message);
  }

  // 4. Degradation alerts via check-degradation.js --json
  try {
    var degOutput = execSync('node ' + path.join(__dirname, 'check-degradation.js') + ' --json', {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000,
    });

    // Parse the JSON output — last line is the JSON payload
    var lines = degOutput.trim().split('\n');
    var jsonLine = lines[lines.length - 1];
    var deg = JSON.parse(jsonLine);
    if (deg && deg.alerts) {
      stats.degradation = {
        alerts_count: deg.alerts_count || deg.alerts.length,
        run_date: deg.run_date || today,
        alerts: deg.alerts,
      };
    }
  } catch (e) {
    console.log('Warning: degradation check failed: ' + e.message);
  }

  // 5. Ranking changes via diff-rankings.js --db --prior <yesterday> --json
  try {
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var yesterdayStr = yesterday.toISOString().slice(0, 10);

    var diffOutput = execSync(
      'node ' + path.join(__dirname, 'diff-rankings.js') + ' --db --prior ' + yesterdayStr + ' --json',
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 },
    );

    var diffLines = diffOutput.trim().split('\n');
    var diffJson = JSON.parse(diffLines[diffLines.length - 1]);
    if (diffJson && diffJson.results) {
      stats.rankings.changes = diffJson.results;
    }
  } catch (e) {
    console.log('Ranking diff not available (first run or no prior snapshot): ' + e.message);
  }

  // Build Slack payload
  var payload = buildSlackPayload(stats);

  if (DRY_RUN) {
    console.log('\n=== Nightly Summary Digest ===\n');
    console.log(JSON.stringify(payload, null, 2));
    console.log('\n=== End Summary ===\n');
    await pool.end();
    return;
  }

  // Send via webhook
  var webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    console.log('NIGHTLY_WEBHOOK_URL not set. Use --dry-run to preview.');
    await pool.end();
    return;
  }

  try {
    await sendWebhook(webhookUrl, payload);
    console.log('Nightly summary sent to webhook.');
  } catch (e) {
    console.error('Failed to send nightly summary: ' + e.message);
  }

  await pool.end();
}

main().catch(function (e) {
  console.error('Nightly summary failed: ' + e.message);
  process.exit(1);
});
