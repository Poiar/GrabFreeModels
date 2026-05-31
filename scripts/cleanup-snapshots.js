#!/usr/bin/env node
/**
 * cleanup-snapshots.js
 * Retains the most recent N snapshots (default 30) and deletes older ones.
 *
 * Usage: node scripts/cleanup-snapshots.js [--keep 30] [--dir snapshots]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let keep = 30;
let snapshotDir = path.join(__dirname, '..', 'snapshots');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--keep' && args[i + 1]) keep = parseInt(args[++i], 10);
  if (args[i] === '--dir' && args[i + 1]) snapshotDir = args[++i];
}

if (!fs.existsSync(snapshotDir)) {
  console.log(`Snapshot directory does not exist: ${snapshotDir}`);
  process.exit(0);
}

const files = fs.readdirSync(snapshotDir)
  .filter(f => f.match(/^available-models-.*\.json$/))
  .map(f => ({
    name: f,
    path: path.join(snapshotDir, f),
    mtime: fs.statSync(path.join(snapshotDir, f)).mtime,
  }))
  .sort((a, b) => b.mtime - a.mtime);

if (files.length <= keep) {
  console.log(`Only ${files.length} snapshots present – nothing to delete.`);
  process.exit(0);
}

const toDelete = files.slice(keep);
for (const f of toDelete) {
  fs.unlinkSync(f.path);
  console.log(`Deleted old snapshot: ${f.name}`);
}
