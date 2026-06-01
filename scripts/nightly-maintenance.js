#!/usr/bin/env node
/**
 * nightly-maintenance.js
 * Intended for scheduled execution (e.g., Windows Task Scheduler / cron).
 * Snapshots current state, validates free models, runs ranking sanity check, generates a summary,
 * commits and pushes changes. Auto-rolls back if working count drops or health falls below 70%.
 *
 * Usage: node scripts/nightly-maintenance.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const MODELS_FILE = path.join(REPO_ROOT, 'available-models.json');
const SNAPSHOT_DIR = path.join(REPO_ROOT, 'snapshots');
if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
const PREV_COPY = path.join(SNAPSHOT_DIR, `available-models-${new Date().toISOString().slice(0, 10)}.json`);
const SUMMARY_LOG = path.join(REPO_ROOT, 'nightly-summary.log');

// Change to repo directory
process.chdir(REPO_ROOT);

// Ensure git identity is set (needed for CI/scheduled tasks)
try {
  execSync('git config user.email', { stdio: 'pipe' });
} catch {
  execSync('git config user.email "nightly@grabfreemodels"');
  execSync('git config user.name "Nightly Maintenance"');
}

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

// 0.5. Prune opencode/ models from role rankings (can't be validated via HTTPS)
console.log('Pruning opencode/ models from role rankings...');
const pruneJson = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
let pruned = 0;
for (const role of Object.keys(pruneJson._role_rankings)) {
  if (role === 'description') continue;
  const arr = pruneJson._role_rankings[role];
  if (!Array.isArray(arr)) continue;
  const filtered = arr.filter(id => !id.startsWith('opencode/'));
  if (filtered.length !== arr.length) {
    pruneJson._role_rankings[role] = filtered;
    pruned += arr.length - filtered.length;
  }
}
if (pruned > 0) {
  fs.writeFileSync(MODELS_FILE, JSON.stringify(pruneJson, null, 2), 'utf8');
  console.log(`  Removed ${pruned} opencode/ entries from rankings`);
}

// 1. Run validation (updates statuses)
console.log('Running validation...');
execSync('node scripts/validate-free-models.js --apply', { stdio: 'inherit' });

// 2.5. Prune stale non-working models from rankings (with 7-day burn-in)
console.log('Pruning stale non-working models from rankings (7-day burn-in)...');
const rankJson = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
const now = Date.now();
const BURN_IN_MS = 7 * 24 * 60 * 60 * 1000;
const staleNonWorking = new Set(rankJson.models.filter(m => {
  if (m.status.result === 'working') return false;
  const tested = m.status.tested ? new Date(m.status.tested).getTime() : NaN;
  if (isNaN(tested)) return false; // never tested — don't prune
  return (now - tested) > BURN_IN_MS;
}).map(m => m.id));
let rankPruned = 0;
for (const role of Object.keys(rankJson._role_rankings)) {
  if (role === 'description') continue;
  const arr = rankJson._role_rankings[role];
  if (!Array.isArray(arr)) continue;
  const before = arr.length;
  rankJson._role_rankings[role] = arr.filter(id => !staleNonWorking.has(id));
  rankPruned += before - rankJson._role_rankings[role].length;
}
if (rankPruned > 0) {
  fs.writeFileSync(MODELS_FILE, JSON.stringify(rankJson, null, 2), 'utf8');
  console.log(`  Removed ${rankPruned} stale non-working entries from rankings`);
}

// 2. Run sanity check (after pruning, so rankings are clean)
console.log('Running ranking sanity check...');
execSync('node scripts/check-rankings.js', { stdio: 'inherit' });

// 2.8. Regenerate _test_summary from current data
console.log('Regenerating _test_summary...');
const summaryJson = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
const freeModels = summaryJson.models.filter(m => m.is_free);
const byResult = (r) => freeModels.filter(m => m.status.result === r).map(m => m.id).sort();
summaryJson._test_summary = {
  date: new Date().toISOString().slice(0, 10),
  results: {
    working: byResult('working'),
    rate_limited: byResult('rate_limited'),
    broken: byResult('broken'),
    untested: byResult('untested'),
    not_found: byResult('not_found'),
  },
};
fs.writeFileSync(MODELS_FILE, JSON.stringify(summaryJson, null, 2), 'utf8');
console.log(`  _test_summary updated: ${byResult('working').length} working, ${byResult('rate_limited').length} rate_limited, ${byResult('broken').length} broken`);

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
  const prev = fs.existsSync(PREV_COPY) ? JSON.parse(fs.readFileSync(PREV_COPY, 'utf8')) : null;
  const free = json.models.filter(m => m.is_free);
  const working = free.filter(m => m.status.result === 'working');
  const healthPct = Math.round((working.length / free.length) * 100);

  // Only rollback if working count actually decreased (real breakage),
  // not just because untested models got classified as rate_limited.
  let shouldRollback = false;
  if (prev) {
    const prevFree = prev.models.filter(m => m.is_free);
    const prevWorking = prevFree.filter(m => m.status.result === 'working');
    if (working.length < prevWorking.length) {
      shouldRollback = true;
      console.log(`Working models decreased from ${prevWorking.length} to ${working.length} – performing rollback`);
    }
  } else {
    // No previous copy – use threshold as fallback
    const rollbackThreshold = 70;
    if (healthPct < rollbackThreshold) {
      shouldRollback = true;
      console.log(`Health ${healthPct}% below threshold ${rollbackThreshold}% – performing rollback`);
    }
  }

  if (shouldRollback) {
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
