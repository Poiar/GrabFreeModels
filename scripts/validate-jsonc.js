#!/usr/bin/env node
/**
 * validate-jsonc.js
 * Validates opencode.jsonc JSONC syntax.
 * Exits 0 if valid, 1 if invalid.
 *
 * Usage:  node scripts/validate-jsonc.js
 * Short: node scripts/validate-jsonc.js --short  (machine-readable, no emoji)
 */

const fs = require('fs');

const isShort = process.argv.includes('--short');
const configPath = 'C:\\Users\\pc\\.config\\opencode\\opencode.jsonc';

let raw;
try {
  raw = fs.readFileSync(configPath, 'utf8');
} catch {
  if (isShort) console.error('ERROR:READ');
  else console.error(`❌ Cannot read config: ${configPath}`);
  process.exit(1);
}

const stripped = raw
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/,\s*([}\]])/g, '$1');

try {
  JSON.parse(stripped);
  if (isShort) console.log('OK');
  else console.log('✅ Valid JSONC');
  process.exit(0);
} catch (e) {
  if (isShort) console.error('ERROR:PARSE');
  else {
    console.error('❌ Invalid JSONC');
    console.error(`   ${e.message}`);
  }
  process.exit(1);
}
