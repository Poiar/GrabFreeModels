#!/usr/bin/env node
/**
 * check-rankings.js
 * Verifies _role_rankings integrity:
 *   - All IDs exist in models array
 *   - No duplicates
 *   - No used-up providers (current month)
 *   - All models are free, working, not removed, and support tools
 *
 * Usage: node scripts/check-rankings.js
 */

require('dotenv').config();
const loadModels = require('./load-models');

(async () => {
  const json = await loadModels();

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

      const model = json.models.find(m => m.id === id);
      const providerName = model ? model.provider : (id.indexOf('/') === -1 ? id : id.substring(0, id.indexOf('/')));
      if (usedUpProviders.includes(providerName)) {
        fail(`Model '${id}' is from used-up provider '${providerName}' in ${role}`);
      }
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
        if (model.supports_tools !== true) {
          fail(`Model '${id}' lacks supports_tools=true in ${role}`);
        }
      }
    }

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
})().catch(e => { console.error(e.message); process.exit(1); });
