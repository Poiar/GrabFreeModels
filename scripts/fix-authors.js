#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('pg');

// Known model creators mapped to display names
const CREATORS = {
  'openai': 'OpenAI', 'anthropic': 'Anthropic', 'google': 'Google',
  'meta': 'Meta', 'mistral': 'Mistral AI', 'deepseek': 'DeepSeek',
  'cohere': 'Cohere', 'microsoft': 'Microsoft', 'nvidia': 'NVIDIA',
  'qwen': 'Qwen', 'baai': 'BAAI', '01-ai': '01.AI',
  'stability-ai': 'Stability AI', 'stabilityai': 'Stability AI',
  'ai21': 'AI21 Labs', 'ai21-labs': 'AI21 Labs',
  'cognitive-computations': 'Cognitive Computations',
  'cognitivecomputations': 'Cognitive Computations',
  'fal-ai': 'Fal AI', 'databricks': 'Databricks',
  'upstage': 'Upstage', 'minimax': 'MiniMax',
  'sarvam': 'Sarvam AI', 'sarvamai': 'Sarvam AI',
  'stepfun': 'StepFun', 'stepfun-ai': 'StepFun',
  'moonshot': 'Moonshot AI', 'moonshotai': 'Moonshot AI',
  'bytedance': 'ByteDance', 'black-forest-labs': 'Black Forest Labs',
  'blackforestlabs': 'Black Forest Labs',
  'abacus': 'Abacus AI', 'abacusai': 'Abacus AI',
  'z-ai': 'Z.AI', 'zai': 'Z.AI',
  'x-ai': 'xAI', 'xai': 'xAI',
  'inflection': 'Inflection AI',
  'snowflake': 'Snowflake', 'reka': 'Reka',
  'adept': 'Adept', 'perplexity': 'Perplexity',
  'together': 'Together AI',
  'cerebras': 'Cerebras',
  'groq': 'Groq',
};

// Prefixes that are routing/aggregator providers, NOT the actual creator
const ROUTER_PREFIXES = new Set([
  'aihubmix', 'alibaba-cn', 'alibaba-coding-plan', 'alibaba-coding-plan-cn',
  'atomic-chat', 'cloudflare-ai-gateway', 'cortecs', 'firepass',
  'github-models', 'gitlab', 'huggingface', 'iflowcn', 'jiekou', 'kilo',
  'kimi-for-coding', 'kuae-cloud-coding-plan',
  'llmgateway', 'lmstudio', 'meganova', 'minimax-cn-coding-plan',
  'minimax-coding-plan', 'modelscope', 'modelsdev', 'nano-gpt', 'nova',
  'novita-ai', 'opencode', 'openrouter', 'orcarouter', 'poe', 'poolside',
  'privatemode-ai', 'siliconflow', 'siliconflow-cn', 'tencent-coding-plan',
  'tencent-tokenhub', 'umans-ai-coding-plan', 'vercel', 'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn', 'xiaomi-token-plan-sgp',
  'zai-coding-plan', 'zenmux', 'zhipuai', 'zhipuai-coding-plan',
]);

function normalizeCreator(name) {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return CREATORS[name.toLowerCase()] || CREATORS[key] || null;
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    // Clear all first
    await pool.query("UPDATE super_models SET author = NULL");

    // Get all unique datapoint full_ids grouped by super_model
    const { rows } = await pool.query(`
      SELECT sm.id, dm.full_id
      FROM super_models sm
      JOIN datapoint_models dm ON dm.super_model_id = sm.id
      ORDER BY sm.id
    `);

    const bySuper = new Map();
    for (const r of rows) {
      if (!bySuper.has(r.id)) bySuper.set(r.id, new Set());
      bySuper.get(r.id).add(r.full_id);
    }

    let assigned = 0;
    for (const [id, fullIds] of bySuper) {
      let author = null;

      for (const fullId of fullIds) {
        const parts = fullId.split('/').filter(Boolean);

        // Case 1: First segment is a known creator directly
        // E.g., deepseek/deepseek-chat, google/gemini-pro
        author = normalizeCreator(parts[0]);
        if (author) break;

        // Case 2: First segment is a router, second is the creator
        // E.g., openrouter/openai/gpt-5.1, github-models/meta/llama-4
        if (ROUTER_PREFIXES.has(parts[0]) && parts.length >= 3) {
          author = normalizeCreator(parts[1]);
          if (author) break;
        }
      }

      if (author) {
        await pool.query('UPDATE super_models SET author = $1 WHERE id = $2', [author, id]);
        assigned++;
      }
    }

    const { rows: count } = await pool.query("SELECT COUNT(*) AS c FROM super_models WHERE author IS NOT NULL");
    const { rows: authors } = await pool.query("SELECT DISTINCT author FROM super_models WHERE author IS NOT NULL ORDER BY author");

    console.log(`Assigned ${assigned} confident authors`);
    console.log(`Total with author: ${count[0].c}`);
    console.log('Authors:', authors.map(r => r.author).join(', '));
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
