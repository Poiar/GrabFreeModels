#!/usr/bin/env node
/**
 * model-summary.js
 * Quick overview of model statuses and role ranking sizes.
 *
 * Usage: node scripts/model-summary.js
 */

const fs = require('fs');
const path = require('path');

const modelsFile = path.join(__dirname, '..', 'available-models.json');
const json = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));

const free = json.models.filter(m => m.is_free);
const working = free.filter(m => m.status.result === 'working');
const rateLimited = free.filter(m => m.status.result === 'rate_limited');
const broken = free.filter(m => m.status.result === 'broken');

console.log(`Free models: ${free.length}`);
console.log(`  Working: ${working.length}`);
console.log(`  Rate-limited: ${rateLimited.length}`);
console.log(`  Broken: ${broken.length}`);

console.log('\nRanking entry counts:');
const rankings = json._role_rankings;
for (const role of Object.keys(rankings)) {
  if (role === 'description') continue;
  const list = rankings[role];
  if (Array.isArray(list)) {
    console.log(`  ${role}: ${list.length}`);
  }
}
