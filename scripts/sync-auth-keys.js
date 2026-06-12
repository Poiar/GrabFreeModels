#!/usr/bin/env node
/**
 * sync-auth-keys.js
 * Syncs provider API keys from auth.json into opencode.jsonc.
 *
 * For each provider present in BOTH files, compares auth.json["provider"].key
 * with opencode.jsonc["provider"].options.apiKey and reports/applies diffs.
 *
 * Usage:
 *   node scripts/sync-auth-keys.js         # dry run, show diffs
 *   node scripts/sync-auth-keys.js --apply # write changes
 *   node scripts/sync-auth-keys.js --list  # list providers in auth.json
 *   node scripts/sync-auth-keys.js --check # exit 1 if any key differs
 */

const fs = require('fs');
const path = require('path');

/**
 * Strip JSONC comments without touching string values.
 * Handles // line comments and /* block comments outside of strings.
 */
function stripJsonc(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    // String literal — copy verbatim
    if (s[i] === '"') {
      out += '"';
      i++;
      while (i < s.length) {
        if (s[i] === '\\') {
          out += s[i] + (s[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (s[i] === '"') {
          out += '"';
          i++;
          break;
        }
        out += s[i];
        i++;
      }
      continue;
    }
    // Line comment
    if (s[i] === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (s[i] === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += s[i];
    i++;
  }
  return out;
}

// Resolve paths — respects GFM_AUTH_FILE / GFM_CONFIG_FILE env vars, falls back to XDG
const XDG_DATA =
  process.env.XDG_DATA_HOME ||
  path.join(process.env.HOME || process.env.USERPROFILE || '.', '.local', 'share');

const AUTH_PATH = process.env.GFM_AUTH_FILE || path.join(XDG_DATA, 'opencode', 'auth.json');

const CONFIG_PATH =
  process.env.GFM_CONFIG_FILE ||
  path.join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.config',
    'opencode',
    'opencode.jsonc',
  );

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIST = args.includes('--list');
const CHECK = args.includes('--check');

let authRaw, configRaw;
try {
  authRaw = fs.readFileSync(AUTH_PATH, 'utf8');
} catch {
  console.error(`ERROR: cannot read ${AUTH_PATH}`);
  process.exit(1);
}
try {
  configRaw = fs.readFileSync(CONFIG_PATH, 'utf8');
} catch {
  console.error(`ERROR: cannot read ${CONFIG_PATH}`);
  process.exit(1);
}

let auth, config;
try {
  auth = JSON.parse(authRaw);
} catch {
  console.error('ERROR: auth.json is not valid JSON');
  process.exit(1);
}
try {
  config = JSON.parse(stripJsonc(configRaw));
} catch {
  console.error('ERROR: opencode.jsonc has invalid JSONC');
  process.exit(1);
}

if (LIST) {
  console.log(Object.keys(auth).join('\n'));
  process.exit(0);
}

const authProviders = Object.keys(auth);
const configProviders = Object.keys(config.provider || {});
const inBoth = authProviders.filter((p) => configProviders.includes(p));
const onlyInAuth = authProviders.filter((p) => !configProviders.includes(p));
const onlyInConfig = configProviders.filter((p) => !authProviders.includes(p));

let changed = 0,
  synced = 0;

for (const p of inBoth) {
  const newKey = auth[p]?.key ?? auth[p]?.apiKey;
  const prov = config.provider[p];
  const hasField = prov?.options && 'apiKey' in prov.options;
  if (!newKey) {
    console.warn(`  WARN: no key for "${p}" in auth.json`);
    continue;
  }
  if (!hasField) {
    console.warn(`  WARN: no options.apiKey for "${p}" in opencode.jsonc`);
    continue;
  }

  const oldKey = prov.options.apiKey;
  if (oldKey === newKey) {
    synced++;
  } else {
    console.log(`  ${p}: ${APPLY ? 'updated' : 'differs'}`);
    changed++;
    if (APPLY) {
      // Targeted replacement: find 'apiKey' within this provider's block.
      const providerHeader = `"${p}"`;
      const headerIdx = configRaw.indexOf(providerHeader);
      if (headerIdx === -1) {
        console.warn(`  WARN: could not locate "${p}" in raw file`);
        continue;
      }
      const searchFrom = headerIdx + providerHeader.length;
      const keyIdx = configRaw.indexOf('"apiKey"', searchFrom);
      if (keyIdx === -1) {
        console.warn(`  WARN: could not locate apiKey for "${p}"`);
        continue;
      }
      const colonIdx = configRaw.indexOf(':', keyIdx + 7);
      const startQuote = configRaw.indexOf('"', colonIdx + 1);
      const endQuote = configRaw.indexOf('"', startQuote + 1);
      configRaw = configRaw.slice(0, startQuote + 1) + newKey + configRaw.slice(endQuote);
    }
  }
}

for (const p of onlyInAuth) console.warn(`  WARN: "${p}" in auth.json but not opencode.jsonc`);
for (const p of onlyInConfig) console.warn(`  WARN: "${p}" in opencode.jsonc but not auth.json`);

console.log(
  `${changed} changed, ${synced} in sync, ${onlyInAuth.length + onlyInConfig.length} warnings`,
);

if (APPLY && changed > 0) {
  fs.writeFileSync(CONFIG_PATH, configRaw, 'utf8');
  console.log(`Wrote ${CONFIG_PATH}`);
  // Validate after write
  try {
    JSON.parse(stripJsonc(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch {
    console.error('ERROR: opencode.jsonc is no longer valid JSONC after write');
    process.exit(1);
  }
  console.log('JSONC validation passed');
}

if (!APPLY && changed > 0) console.log('Run with --apply to write changes');
process.exit(CHECK && changed > 0 ? 1 : 0);
