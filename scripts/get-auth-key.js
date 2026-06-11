#!/usr/bin/env node
/**
 * get-auth-key.js
 * Reads an API key from opencode's auth.json for a given provider.
 * Exits 0 with the key on stdout, or exits 1 with an error on stderr.
 *
 * Usage:
 *   node scripts/get-auth-key.js --provider openrouter
 *   node scripts/get-auth-key.js --provider nvidia
 *   node scripts/get-auth-key.js --list    (show available providers)
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

// Resolve auth file path — respects GFM_AUTH_FILE env var, falls back to XDG
const authPath =
  process.env.GFM_AUTH_FILE ||
  path.join(
    process.env.XDG_DATA_HOME ||
      path.join(process.env.HOME || process.env.USERPROFILE || '.', '.local', 'share'),
    'opencode',
    'auth.json',
  );

let raw;
try {
  raw = fs.readFileSync(authPath, 'utf8');
} catch {
  console.error(`ERROR: cannot read ${authPath}`);
  process.exit(1);
}

let auth;
try {
  auth = JSON.parse(raw);
} catch {
  console.error('ERROR: auth.json is not valid JSON');
  process.exit(1);
}

if (args.includes('--list')) {
  const providers = Object.keys(auth);
  console.log(providers.join('\n'));
  process.exit(0);
}

const providerFlag = args.indexOf('--provider');
if (providerFlag === -1 || !args[providerFlag + 1]) {
  console.error('Usage: node scripts/get-auth-key.js --provider <name> [--list]');
  process.exit(1);
}

const provider = args[providerFlag + 1];
const entry = auth[provider];

if (!entry) {
  console.error(`ERROR: provider "${provider}" not found in auth.json`);
  console.error(`Available: ${Object.keys(auth).join(', ')}`);
  process.exit(1);
}

const key = entry.key ?? entry.apiKey ?? entry;
if (!key || typeof key !== 'string' || key.length === 0) {
  console.error(`ERROR: no key found for provider "${provider}"`);
  process.exit(1);
}

console.log(key);
process.exit(0);
