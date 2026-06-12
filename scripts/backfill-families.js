// Backfill family assignments for models missing them.
// Infers family from model name patterns.
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

// Model name pattern → family slug. First match wins.
const FAMILY_PATTERNS = [
  // OpenAI
  { pattern: /\bgpt\b/i, family: 'gpt' },
  { pattern: /whisper/i, family: 'whisper' },
  { pattern: /dall[- ]?e/i, family: 'dall-e' },
  { pattern: /sora/i, family: 'sora' },

  // Meta
  { pattern: /\bllama/i, family: 'llama' },
  { pattern: /codellama/i, family: 'llama' },

  // Google — check Gemini before Gemma (Gemini contains "gem" but not "gemma")
  { pattern: /gemini/i, family: 'gemini' },
  { pattern: /gemma/i, family: 'gemma' },
  { pattern: /codegemma/i, family: 'gemma' },
  { pattern: /shieldgemma/i, family: 'gemma' },
  { pattern: /recurrentgemma/i, family: 'gemma' },
  { pattern: /medgemma/i, family: 'gemma' },
  { pattern: /paligemma/i, family: 'gemma' },
  { pattern: /imagen/i, family: 'imagen' },
  { pattern: /veo/i, family: 'veo' },
  { pattern: /lyria/i, family: 'lyria' },

  // Anthropic
  { pattern: /claude/i, family: 'claude' },

  // Mistral AI — check before generic
  { pattern: /mixtral/i, family: 'mixtral' },
  { pattern: /ministral/i, family: 'ministral' },
  { pattern: /codestral/i, family: 'codestral' },
  { pattern: /devstral/i, family: 'devstral' },
  { pattern: /mistral/i, family: 'mistral' },

  // DeepSeek
  { pattern: /deepseek/i, family: 'deepseek' },

  // Alibaba
  { pattern: /qwen/i, family: 'qwen' },
  { pattern: /qwq/i, family: 'qwen' },

  // Microsoft
  { pattern: /\bphi\b/i, family: 'phi' },
  { pattern: /\bphi[-\s]?\d/i, family: 'phi' },

  // xAI
  { pattern: /grok/i, family: 'grok' },

  // Zhipu AI
  { pattern: /chatglm/i, family: 'glm' },
  { pattern: /\bglm\b/i, family: 'glm' },
  { pattern: /\bglm[-\s]?\d/i, family: 'glm' },

  // Moonshot AI
  { pattern: /kimi/i, family: 'kimi' },

  // MiniMax
  { pattern: /minimax/i, family: 'minimax' },

  // NVIDIA
  { pattern: /nemotron/i, family: 'nemotron' },
  { pattern: /\bace(instruct|math|reason)/i, family: 'nemotron' },
  { pattern: /minitron/i, family: 'nemotron' },
  { pattern: /hymba/i, family: 'nemotron' },
  { pattern: /cosmos[-\s]?(reason)?/i, family: 'nemotron' },

  // Black Forest Labs
  { pattern: /\bflux\b/i, family: 'flux' },
  { pattern: /\bflux[.\-\s]?\d/i, family: 'flux' },

  // Cohere
  { pattern: /command[- ][ar]/i, family: 'command' },

  // AI21 Labs
  { pattern: /jamba/i, family: 'jamba' },

  // Databricks / Mosaic
  { pattern: /dbrx/i, family: 'dbrx' },

  // Tencent
  { pattern: /hunyuan/i, family: 'hunyuan' },

  // Stability AI
  { pattern: /stable[-\s]?(diffusion|audio|video|cascade)/i, family: 'stable-diffusion' },

  // 01.AI
  { pattern: /\byi\b/i, family: 'yi' },
  { pattern: /\byi[-\s]?\d/i, family: 'yi' },
  { pattern: /\byi[-\s]?(large|medium|small|coder|vision)/i, family: 'yi' },

  // ElevenLabs
  { pattern: /elevenlabs/i, family: 'elevenlabs' },

  // Ideogram
  { pattern: /ideogram/i, family: 'ideogram' },

  // Runway
  { pattern: /runway/i, family: 'runway' },

  // Recraft
  { pattern: /recraft/i, family: 'recraft' },

  // Topaz Labs
  { pattern: /topaz/i, family: 'topazlabs' },

  // BGE / BAAI
  { pattern: /bge/i, family: 'bge' },

  // Voyage
  { pattern: /voyage/i, family: 'voyage' },

  // Sarvam
  { pattern: /sarvam/i, family: 'sarvam' },

  // Liquid AI
  { pattern: /liquid/i, family: 'liquid' },

  // Step
  { pattern: /\bstep[-\s]?\d/i, family: 'step' },

  // Seed / ByteDance
  { pattern: /\bseed/i, family: 'seed' },

  // Cogito
  { pattern: /cogito/i, family: 'cogito' },

  // G42 / JAIS
  { pattern: /jais/i, family: 'jais' },

  // Ling
  { pattern: /\bling[-\s]/i, family: 'ling' },

  // Mimo
  { pattern: /\bmimo/i, family: 'mimo' },

  // Nova (AWS)
  { pattern: /\bnova[-\s]?(lite|pro|micro)/i, family: 'nova' },

  // Tako
  { pattern: /tako/i, family: 'tako' },

  // Trinity
  { pattern: /trinity/i, family: 'trinity' },

  // Aura
  { pattern: /aura/i, family: 'aura' },

  // MeloTTS
  { pattern: /melo/i, family: 'melotts' },

  // Ray
  { pattern: /\bray\b/i, family: 'ray' },

  // RNJ
  { pattern: /\brnj\b/i, family: 'rnj' },

  // Canopylabs
  { pattern: /canopy/i, family: 'canopylabs' },

  // Smart-turn
  { pattern: /smart[- ]turn/i, family: 'smart-turn' },

  // Longcat
  { pattern: /longcat/i, family: 'longcat' },

  // Common model families from HuggingFace / known architectures
  { pattern: /\bfalcon/i, family: 'falcon' },
  { pattern: /\borca\b/i, family: 'orca' },
  { pattern: /\bzephyr\b/i, family: 'zephyr' },
  { pattern: /\bdolphin\b/i, family: 'dolphin' },
  { pattern: /\bhermes\b/i, family: 'hermes' },
  { pattern: /\bstarcoder\b/i, family: 'starcoder' },
  { pattern: /\bbloom\b/i, family: 'bloom' },
  { pattern: /\bmpt\b/i, family: 'mpt' },
  { pattern: /\bolmo\b/i, family: 'olmo' },
  { pattern: /\bgranite\b/i, family: 'granite' },
  { pattern: /\bvicuna\b/i, family: 'vicuna' },
  { pattern: /\balpaca\b/i, family: 'alpaca' },
  { pattern: /\btinyllama\b/i, family: 'llama' },
  { pattern: /\bsolar\b/i, family: 'solar' },
  { pattern: /\bdbrx\b/i, family: 'dbrx' },
  { pattern: /\bc4ai\b/i, family: 'command' },

  // Baidu
  { pattern: /ernie/i, family: 'ernie' },

  // Bria
  { pattern: /bria/i, family: 'bria' },

  // Alibaba
  { pattern: /qwen/i, family: 'qwen' }, // double-check catch
];

async function main() {
  const client = await pool.connect();

  try {
    const { rows } = await client.query(`
      SELECT sm.id, sm.name
      FROM super_models sm
      WHERE EXISTS (SELECT 1 FROM datapoint_models dm WHERE dm.super_model_id = sm.id AND NOT dm.is_removed)
        AND sm.family IS NULL
      ORDER BY sm.name
    `);

    console.log(`Found ${rows.length} super_models without family...\n`);

    const assignments = [];
    const noMatch = [];

    for (const model of rows) {
      let matched = false;
      for (const rule of FAMILY_PATTERNS) {
        if (rule.pattern.test(model.name)) {
          assignments.push({ id: model.id, name: model.name, family: rule.family });
          matched = true;
          break;
        }
      }
      if (!matched) noMatch.push(model.name);
    }

    console.log(`Matched: ${assignments.length}  No match: ${noMatch.length}`);

    const familyCounts = {};
    for (const a of assignments) {
      familyCounts[a.family] = (familyCounts[a.family] || 0) + 1;
    }
    console.log('\nBy family:');
    for (const [f, c] of Object.entries(familyCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${f}: ${c}`);
    }

    if (noMatch.length > 0) {
      console.log(`\nUnmatched (${noMatch.length}):`);
      for (const n of noMatch.slice(0, 30)) console.log(`  - ${n}`);
      if (noMatch.length > 30) console.log(`  ... and ${noMatch.length - 30} more`);
    }

    const dryRun = !process.argv.includes('--apply');
    if (dryRun) {
      console.log(`\nDry run — use --apply to set family on ${assignments.length} super_models.`);
      return;
    }

    let updated = 0;
    for (const a of assignments) {
      await client.query('UPDATE super_models SET family = $1 WHERE id = $2 AND family IS NULL', [
        a.family,
        a.id,
      ]);
      updated++;
    }

    console.log(`\nUpdated ${updated} super_models with family.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
