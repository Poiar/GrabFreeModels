// Fix models whose creator field is the hosting provider, not the model maker.
// Only fixes clear cases: where the creator matches a provider slug (NVIDIA, Together, etc.)
// and the model name clearly belongs to a different creator.
// Also fixes non-canonical creator names (Qwen → Alibaba, Z.AI → Zhipu AI, etc.).
// Loads canonical creators from data/canonical-creators.json (single source of truth).
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } });
const REG = require('../data/canonical-creators.json');

// Canonical creator name overrides: raw name → canonical name (only entries that differ)
const CANONICAL_CREATOR = {};
for (const [raw, canon] of Object.entries(REG.authorOverrides)) {
  if (raw !== canon.name.toLowerCase()) {
    CANONICAL_CREATOR[raw] = canon.name;
  }
}

// Model name pattern → correct creator (only checked when creator is a hosting provider)
const NAME_TO_CREATOR = [
  { pattern: /llama/, creator: 'Meta' },
  { pattern: /codellama/, creator: 'Meta' },
  { pattern: /mistral/, creator: 'Mistral AI' },
  { pattern: /mixtral/, creator: 'Mistral AI' },
  { pattern: /codestral/, creator: 'Mistral AI' },
  { pattern: /devstral/, creator: 'Mistral AI' },
  { pattern: /ministral/, creator: 'Mistral AI' },
  { pattern: /gemma/, creator: 'Google' },
  { pattern: /gemini/, creator: 'Google' },
  { pattern: /shieldgemma/, creator: 'Google' },
  { pattern: /recurrentgemma/, creator: 'Google' },
  { pattern: /codegemma/, creator: 'Google' },
  { pattern: /paligemma/, creator: 'Google' },
  { pattern: /deepseek/, creator: 'DeepSeek' },
  { pattern: /deepseek-ai/, creator: 'DeepSeek' },
  { pattern: /qwen/, creator: 'Alibaba' },
  { pattern: /qwq/, creator: 'Alibaba' },
  { pattern: /\bphi\b/, creator: 'Microsoft' },
  { pattern: /\bphi-/, creator: 'Microsoft' },
  { pattern: /claude/, creator: 'Anthropic' },
  { pattern: /whisper/, creator: 'OpenAI' },
  { pattern: /dall-e/, creator: 'OpenAI' },
  { pattern: /\bflux\b/, creator: 'Black Forest Labs' },
  { pattern: /\bflux\./, creator: 'Black Forest Labs' },
  { pattern: /\bflux-/, creator: 'Black Forest Labs' },
  { pattern: /grok/, creator: 'xAI' },
  { pattern: /jamba/, creator: 'AI21 Labs' },
  { pattern: /dbrx/, creator: 'Databricks' },
  { pattern: /hunyuan/, creator: 'Tencent' },
  { pattern: /glm/, creator: 'Zhipu AI' },
  { pattern: /chatglm/, creator: 'Zhipu AI' },
  { pattern: /command[- ]r/, creator: 'Cohere' },
  { pattern: /command[- ]a/, creator: 'Cohere' },
  { pattern: /kimi/, creator: 'Moonshot AI' },
  { pattern: /minimax/, creator: 'MiniMax' },
  { pattern: /nemotron/, creator: 'NVIDIA' },
  { pattern: /ace(instruct|math|reason)/i, creator: 'NVIDIA' },
  { pattern: /minitron/, creator: 'NVIDIA' },
  { pattern: /hymba/, creator: 'NVIDIA' },
  { pattern: /cosmos/, creator: 'NVIDIA' },
];

// Provider names that are never the actual creator — they only host other companies' models
// Source: data/canonical-creators.json → hostingProviders
const PROVIDER_AS_CREATOR = new Set(REG.hostingProviders);

async function main() {
  const client = await pool.connect();

  try {
    const { rows } = await client.query(`
      SELECT sm.id, sm.name, sm.creator, sm.slug
      FROM super_models sm
      WHERE sm.creator IS NOT NULL
      ORDER BY sm.id
    `);

    console.log(`Checking ${rows.length} super_models...\n`);

    const updates = [];

    for (const model of rows) {
      const creatorLower = model.creator.toLowerCase().trim();
      const nameLower = model.name.toLowerCase();

      // Check 1: Non-canonical creator name
      if (CANONICAL_CREATOR[creatorLower] && CANONICAL_CREATOR[creatorLower] !== model.creator) {
        updates.push({ id: model.id, name: model.name, oldCreator: model.creator, newCreator: CANONICAL_CREATOR[creatorLower] });
        continue;
      }

      // Check 2: Creator is a hosting provider, model name suggests a different creator
      if (PROVIDER_AS_CREATOR.has(creatorLower)) {
        for (const rule of NAME_TO_CREATOR) {
          if (rule.pattern.test(nameLower)) {
            if (model.creator !== rule.creator) {
              updates.push({ id: model.id, name: model.name, oldCreator: model.creator, newCreator: rule.creator });
            }
            break; // First match wins
          }
        }
      }
    }

    console.log(`Found ${updates.length} models with wrong creator:\n`);

    const groups = {};
    for (const u of updates) {
      const key = `${u.oldCreator} → ${u.newCreator}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(u.name);
    }
    for (const [key, names] of Object.entries(groups)) {
      console.log(`  ${key} (${names.length} models)`);
      for (const n of names.slice(0, 5)) console.log(`    - ${n}`);
      if (names.length > 5) console.log(`    ... and ${names.length - 5} more`);
    }

    if (updates.length === 0) {
      console.log('No misattributions found.');
      return;
    }

    const dryRun = !process.argv.includes('--apply');
    if (dryRun) {
      console.log(`\nDry run — use --apply to update ${updates.length} models.`);
      return;
    }

    let changed = 0;
    for (const u of updates) {
      await client.query('UPDATE super_models SET creator = $1 WHERE id = $2', [u.newCreator, u.id]);
      changed++;
    }

    console.log(`\nUpdated ${changed} models.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
