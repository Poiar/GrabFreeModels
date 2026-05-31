#!/usr/bin/env node
/**
 * health-badge.js
 * Generates a Shields.io compatible JSON badge describing overall free-model health.
 * Output file: badge/health.json
 *
 * Usage: node scripts/health-badge.js
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const jsonPath = path.join(repoRoot, 'available-models.json');
const badgeDir = path.join(repoRoot, 'badge');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const free = data.models.filter(m => m.is_free);
const working = free.filter(m => m.status.result === 'working');
const percent = Math.round((working.length / free.length) * 100);

const color = percent >= 80 ? 'green' : percent >= 50 ? 'yellow' : 'red';

const badge = {
  schemaVersion: 1,
  label: 'free models',
  message: `${percent}% working`,
  color,
};

if (!fs.existsSync(badgeDir)) {
  fs.mkdirSync(badgeDir, { recursive: true });
}

fs.writeFileSync(path.join(badgeDir, 'health.json'), JSON.stringify(badge, null, 2) + '\n', 'utf8');
console.log(`Health badge written to ${path.join(badgeDir, 'health.json')}`);
