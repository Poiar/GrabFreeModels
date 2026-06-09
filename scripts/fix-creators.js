#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('pg');

// Known model creators mapped to display names
const CREATORS = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  meta: 'Meta',
  mistral: 'Mistral AI',
  deepseek: 'DeepSeek',
  cohere: 'Cohere',
  microsoft: 'Microsoft',
  nvidia: 'NVIDIA',
  qwen: 'Qwen',
  baai: 'BAAI',
  '01-ai': '01.AI',
  'stability-ai': 'Stability AI',
  stabilityai: 'Stability AI',
  ai21: 'AI21 Labs',
  'ai21-labs': 'AI21 Labs',
  'cognitive-computations': 'Cognitive Computations',
  cognitivecomputations: 'Cognitive Computations',
  'fal-ai': 'Fal AI',
  databricks: 'Databricks',
  upstage: 'Upstage',
  minimax: 'MiniMax',
  sarvam: 'Sarvam AI',
  sarvamai: 'Sarvam AI',
  stepfun: 'StepFun',
  'stepfun-ai': 'StepFun',
  moonshot: 'Moonshot AI',
  moonshotai: 'Moonshot AI',
  bytedance: 'ByteDance',
  'black-forest-labs': 'Black Forest Labs',
  blackforestlabs: 'Black Forest Labs',
  abacus: 'Abacus AI',
  abacusai: 'Abacus AI',
  'z-ai': 'Z.AI',
  zai: 'Z.AI',
  'x-ai': 'xAI',
  xai: 'xAI',
  inflection: 'Inflection AI',
  snowflake: 'Snowflake',
  reka: 'Reka',
  adept: 'Adept',
  perplexity: 'Perplexity',
  together: 'Together AI',

  // Additional creator aliases
  'meta-llama': 'Meta',
  mistralai: 'Mistral AI',
  'mistral-ai': 'Mistral AI',
  'nv-mistralai': 'Mistral AI',
  ibm: 'IBM',
  writer: 'Writer',
  bigcode: 'BigCode',
  zyphra: 'Zyphra',
  'arcee-ai': 'Arcee AI',
  arceeai: 'Arcee AI',
  poolside: 'Poolside',
  nousresearch: 'Nous Research',
  stockmark: 'Stockmark',
  core42: 'Core42',
  meituan: 'Meituan',
  baidu: 'Baidu',
  liquid: 'Liquid AI',
  lumalabs: 'Luma AI',
  'topazlabs-co': 'Topaz Labs',
  voyage: 'Voyage AI',
  elevenlabs: 'ElevenLabs',
  ideogramai: 'Ideogram',
  recraft: 'Recraft',
  runwayml: 'Runway',
  xiaomimimo: 'Xiaomi',
  fireworks: 'Fireworks AI',
  'fireworks-ai': 'Fireworks AI',
  kwaipilot: 'Kwaipilot',
  poetools: 'POE',
  bfl: 'Black Forest Labs',
  paddlepaddle: 'PaddlePaddle',
  tencent: 'Tencent',
  'workers-ai': 'Cloudflare',
  deepgram: 'Deepgram',
  inclusionai: 'Inclusion AI',
  zhipuai: 'Zhipu AI',
  novita: 'Novita AI',
  'mini max ai': 'MiniMax',
  trytako: 'Tako',
  devstral: 'Devstral',
  longcat: 'Meituan',
  llama: 'Meta',
  nova: 'Nova',
  'nano-gpt': 'Nano GPT',
  umans: 'Umans AI',
  xiaomi: 'Xiaomi',
  chatgpt: 'OpenAI',
};

// Model family name prefixes → creator (fallback when segment matching fails)
const NAME_PREFIXES = {
  claude: 'Anthropic',
  gemini: 'Google',
  gemma: 'Google',
  llama: 'Meta',
  mistral: 'Mistral AI',
  ministral: 'Mistral AI',
  codestral: 'Mistral AI',
  mixtral: 'Mistral AI',
  phi: 'Microsoft',
  granite: 'IBM',
  hunyuan: 'Tencent',
  kimi: 'Moonshot AI',
  doubao: 'ByteDance',
  aya: 'Cohere',
  c4ai: 'Cohere',
  palmyra: 'Writer',
  zamba: 'Zyphra',
  stockmark: 'Stockmark',
  sarvam: 'Sarvam AI',
  devstral: 'Devstral',
  qwen: 'Qwen',
  starcoder2: 'BigCode',
  flux: 'Black Forest Labs',
  bart: 'Meta',
  deepgram: 'Deepgram',
  elevenlabs: 'ElevenLabs',
  ideogram: 'Ideogram',
  recraft: 'Recraft',
  runway: 'Runway',
  voyage: 'Voyage AI',
  topazlabs: 'Topaz Labs',
  ling: 'Inclusion AI',
  wan: 'Wan',
  melotts: 'MyShell',
  kling: 'Kling',
  ring: 'Ring',
  grok: 'xAI',
  mimo: 'Xiaomi',
  longcat: 'Meituan',
  trinity: 'Arcee AI',
  laguna: 'Poolside',
  hermes: 'Nous Research',
  jais: 'Core42',
  rnj: 'RNJ',
  cogito: 'Cogito',
  glm: 'Zhipu AI',
  hidream: 'HiDream',
  ray: 'Luma AI',
};

function firstWord(name) {
  const word =
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)[0] || '';
  return word.replace(/\d+$/, '');
}

// Prefixes that are routing/aggregator providers, NOT the actual creator
const ROUTER_PREFIXES = new Set([
  'aihubmix',
  'alibaba-cn',
  'alibaba-coding-plan',
  'alibaba-coding-plan-cn',
  'atomic-chat',
  'cloudflare-ai-gateway',
  'cerebras',
  'cortecs',
  'groq',
  'firepass',
  'github-models',
  'gitlab',
  'huggingface',
  'iflowcn',
  'jiekou',
  'kilo',
  'kimi-for-coding',
  'kuae-cloud-coding-plan',
  'llmgateway',
  'lmstudio',
  'meganova',
  'minimax-cn-coding-plan',
  'minimax-coding-plan',
  'modelscope',
  'modelsdev',
  'nano-gpt',
  'nova',
  'novita-ai',
  'opencode',
  'openrouter',
  'orcarouter',
  'poe',
  'poolside',
  'privatemode-ai',
  'siliconflow',
  'siliconflow-cn',
  'tencent-coding-plan',
  'tencent-tokenhub',
  'umans-ai-coding-plan',
  'vercel',
  'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'zai-coding-plan',
  'zenmux',
  'zhipuai',
  'zhipuai-coding-plan',
]);

function normalizeCreator(name) {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return CREATORS[name.toLowerCase()] || CREATORS[key] || CREATORS[key.split('-')[0]] || null;
}

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  try {
    // Only fill NULL creators — never clear existing ones
    const { rows: nullCount } = await pool.query('SELECT COUNT(*) AS c FROM super_models WHERE creator IS NULL');
    console.log(`Models with NULL creator before fix: ${nullCount[0].c}`);

    // Get unique datapoint full_ids only for NULL-creator super models
    const { rows } = await pool.query(`
      SELECT sm.id, dm.full_id
      FROM super_models sm
      JOIN datapoint_models dm ON dm.super_model_id = sm.id
      WHERE sm.creator IS NULL
      ORDER BY sm.id
    `);

    const bySuper = new Map();
    for (const r of rows) {
      if (!bySuper.has(r.id)) bySuper.set(r.id, new Set());
      bySuper.get(r.id).add(r.full_id);
    }

    let assigned = 0;
    for (const [id, fullIds] of bySuper) {
      let creator = null;

      for (const fullId of fullIds) {
        const parts = fullId.split('/').filter(Boolean);

        // Case 1: First segment is a known creator directly
        // E.g., deepseek/deepseek-chat, google/gemini-pro
        // Skip if first segment is a routing/aggregator provider
        if (!ROUTER_PREFIXES.has(parts[0])) {
          creator = normalizeCreator(parts[0]);
          if (creator) break;
        }

        // Case 2: First segment is a router, second is the creator
        // E.g., openrouter/openai/gpt-5.1, github-models/meta/llama-4
        if (ROUTER_PREFIXES.has(parts[0]) && parts.length >= 3) {
          creator = normalizeCreator(parts[1]);
          if (creator) break;
        }

        // Case 3: First segment is a router, only 2 parts total (name is in second part)
        // E.g., modelsdev/claude-3.5-sonnet, modelsdev/kimi-k2.5
        if (ROUTER_PREFIXES.has(parts[0]) && parts.length === 2) {
          creator = normalizeCreator(parts[1]);
          if (creator) break;
          creator = NAME_PREFIXES[firstWord(parts[1])];
          if (creator) break;
        }

        // Case 4: Name prefix matching on the last segment
        // E.g., modelsdev/mistral-ai/mistral-nemo → 'mistral' prefix
        if (!creator) {
          const last = parts[parts.length - 1];
          creator = NAME_PREFIXES[firstWord(last)];
          if (creator) break;
        }

        // Case 5: GitLab Duo Chat rebranded models
        // duo-chat-gpt* → OpenAI, duo-chat-(haiku|opus|sonnet|claude) → Anthropic
        if (!creator) {
          const last = parts[parts.length - 1].toLowerCase();
          const duoMatch = last.match(/duo[._-]chat[._-](gpt|claude|haiku|opus|sonnet)/);
          if (duoMatch) {
            creator = duoMatch[1] === 'gpt' ? 'OpenAI' : 'Anthropic';
            break;
          }
        }
      }

      if (creator) {
        await pool.query('UPDATE super_models SET creator = $1 WHERE id = $2', [creator, id]);
        assigned++;
      }
    }

    const { rows: count } = await pool.query(
      'SELECT COUNT(*) AS c FROM super_models WHERE creator IS NOT NULL',
    );
    const { rows: creators } = await pool.query(
      'SELECT DISTINCT creator FROM super_models WHERE creator IS NOT NULL ORDER BY creator',
    );

    console.log(`Assigned ${assigned} confident creators`);
    console.log(`Total with creator: ${count[0].c}`);
    console.log('Creators:', creators.map((r) => r.creator).join(', '));
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
