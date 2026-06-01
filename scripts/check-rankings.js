#!/usr/bin/env node
/**
 * check-rankings.js
 * Verifies that every model ID referenced in _role_rankings exists in the models array,
 * that there are no duplicate entries, and that no model belongs to a provider
 * listed in _provider_usage for the current month.
 *
 * Usage: node scripts/check-rankings.js
 */

const fs = require('fs');
const path = require('path');

const modelsFile = path.join(__dirname, '..', 'available-models.json');
const json = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));

const modelIds = json.models.map(m => m.id);
const modelIdSet = new Set(modelIds);
let allGood = true;

function fail(msg) {
  console.error(`  ❌ ${msg}`);
  allGood = false;
}

function ok(msg) {
  console.log(`  ${msg}`);
}

// Determine which providers are used-up this month
const currentMonth = new Date().toISOString().slice(0, 7);
const usedUpProviders = [];

if (json._provider_usage) {
  console.log(`Checking _provider_usage for month ${currentMonth}...`);
  for (const [key, entry] of Object.entries(json._provider_usage)) {
    if (key === 'description') continue;
    if (entry && entry.month === currentMonth) {
      usedUpProviders.push(key);
      console.log(`  Provider '${key}' marked as used-up: ${entry.reason}`);
    }
  }
  if (usedUpProviders.length === 0) {
    console.log('  No providers used-up this month.');
  }
  console.log('');
}

const rankings = json._role_rankings;
for (const role of Object.keys(rankings)) {
  if (role === 'description') continue;
  const list = rankings[role];
  if (!Array.isArray(list)) continue;

  console.log(`Checking role: ${role}`);

  for (const id of list) {
    if (!modelIdSet.has(id)) {
      fail(`Missing model ID: ${id}`);
    }
    if (id.startsWith('opencode/')) {
      fail(`opencode/ model in ${role} ranking: ${id} — cannot be validated, should be excluded`);
    }
    const provider = id.indexOf('/') === -1 ? id : id.substring(0, id.indexOf('/'));
    if (usedUpProviders.includes(provider)) {
      fail(`Model '${id}' is from used-up provider '${provider}' in ${role}`);
    }
    const model = json.models.find(m => m.id === id);
    if (model) {
      if (model._removed) {
        fail(`Model '${id}' is removed in ${role}`);
      }
      if (!model.is_free) {
        fail(`Model '${id}' is not free (is_free=false) in ${role}`);
      }
      if (model.status.result === 'broken') {
        fail(`Model '${id}' has status 'broken' in ${role}`);
      }
      if (model.status.result === 'rate_limited') {
        fail(`Model '${id}' has status 'rate_limited' in ${role}`);
      }
    }
  }

  // Check duplicates
  const seen = new Set();
  for (const id of list) {
    if (seen.has(id)) {
      const count = list.filter(x => x === id).length;
      fail(`Duplicate ID in ${role}: ${id} (appears ${count} times)`);
    }
    seen.add(id);
  }
}

if (allGood) {
  console.log('All rankings are valid.');
} else {
  process.exit(1);
}
