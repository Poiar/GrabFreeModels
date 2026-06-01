#!/usr/bin/env node
/**
 * nightly-maintenance.js
 * Intended for scheduled execution (e.g., Windows Task Scheduler / cron).
 * Validates free models, runs ranking sanity check, generates a summary, commits changes,
 * and pushes to the remote.
 *
 * Usage: node scripts/nightly-maintenance.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const MODELS_FILE = path.join(REPO_ROOT, 'available-models.json');
const PREV_COPY = path.join(REPO_ROOT, 'available-models.prev.json');
const SUMMARY_LOG = path.join(REPO_ROOT, 'nightly-summary.log');

// Change to repo directory
process.chdir(REPO_ROOT);

// Obtain webhook URLs from environment
let webhookUrl = null;
const alertEndpoints = [];
try {
  const envRaw = process.env.GRAB_FREE_MODELS_ALERTS;
  if (envRaw) {
    const secretJson = JSON.parse(envRaw);
    if (secretJson.webhook) webhookUrl = secretJson.webhook;
    if (secretJson.slack) alertEndpoints.push(secretJson.slack);
    if (secretJson.teams) alertEndpoints.push(secretJson.teams);
    if (secretJson.email) alertEndpoints.push(secretJson.email);
  }
} catch {
  // ignore parse errors
}
if (!webhookUrl) webhookUrl = process.env.WEBHOOK_URL;
if (webhookUrl) alertEndpoints.push(webhookUrl);

// 0. Save previous state for rollback and recovery detection
if (fs.existsSync(MODELS_FILE)) {
  fs.copyFileSync(MODELS_FILE, PREV_COPY);
}

// 1. Run validation (updates statuses)
console.log('Running validation...');
execSync('node scripts/validate-free-models.js --apply', { stdio: 'inherit' });

// 2. Run sanity check
console.log('Running ranking sanity check...');
execSync('node scripts/check-rankings.js', { stdio: 'inherit' });

// 3. Generate summary (log to file)
const summaryOutput = execSync('node scripts/model-summary.js', { encoding: 'utf8' });
fs.writeFileSync(SUMMARY_LOG, summaryOutput, 'utf8');
console.log(`Summary written to ${SUMMARY_LOG}`);

// 4. Detect changes
let hasChanges = false;
try {
  execSync(`git diff --quiet ${MODELS_FILE}`, { stdio: 'pipe' });
} catch {
  hasChanges = true; // git diff exits non-zero when there are differences
}

if (hasChanges) {
  // Compute overall health percentage
  const json = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
  const free = json.models.filter(m => m.is_free);
  const working = free.filter(m => m.status.result === 'working');
  const healthPct = Math.round((working.length / free.length) * 100);
  const rollbackThreshold = 70;

  if (healthPct < rollbackThreshold) {
    console.log(`Health ${healthPct}% below threshold ${rollbackThreshold}% – performing automatic rollback`);
    if (fs.existsSync(PREV_COPY)) {
      fs.copyFileSync(PREV_COPY, MODELS_FILE);
      execSync(`git add ${MODELS_FILE}`);
      execSync(`git commit -m "chore(models): automatic rollback to previous stable state (health ${healthPct}%)"`);
      execSync('git push origin master');
      console.log('Rollback committed and pushed');
    }
    process.exit(0);
  }

  execSync(`git add ${MODELS_FILE}`);
  const date = new Date().toISOString().slice(0, 10);
  execSync(`git commit -m "chore(models): nightly validation ${date}"`);

  // 5. Push changes
  execSync('git push origin master');
  console.log('Pushed commits');
} else {
  console.log('No changes detected; nothing to commit.');
}

// 7. Alert via webhook – highlight models that recovered to working status
if (fs.existsSync(PREV_COPY)) {
  const prev = JSON.parse(fs.readFileSync(PREV_COPY, 'utf8'));
  const curr = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));

  const recovered = curr.models.filter(m => {
    if (m.status.result !== 'working') return false;
    const prevMatch = prev.models.find(pm => pm.id === m.id);
    return prevMatch && prevMatch.status.result !== 'working';
  });

  if (recovered.length > 0 && alertEndpoints.length > 0) {
    const payload = JSON.stringify({ severity: 'warning', type: 'recovery', models: recovered.map(m => m.id) });
    const tmpFile = path.join(require('os').tmpdir(), `gfm-alert-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, payload, 'utf8');
    for (const url of alertEndpoints) {
      try {
        execSync(`curl -s -X POST -H 'Content-Type: application/json' -d @'${tmpFile}' '${url}'`, { stdio: 'pipe' });
        console.log(`Alert sent to ${url}`);
      } catch {
        console.log(`Failed to send alert to ${url}`);
      }
    }
    fs.unlinkSync(tmpFile);
  }
}
