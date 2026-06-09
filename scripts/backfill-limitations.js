#!/usr/bin/env node
/**
 * backfill-limitations.js
 * One-shot: sets limitations JSONB on existing free models based on provider.
 */
require('dotenv').config();
const { Pool } = require('pg');

const LIMITS = {
  // Major providers with well-known free tier limits
  openrouter: { rate_limit: '20 RPM / 1,000 TPM', notes: 'Free models on OpenRouter have shared rate limits across all free models' },
  cerebras: { rate_limit: '30 RPM / 1M TPM', daily_tokens: 1000000, notes: 'Free tier via Cerebras Cloud. Higher limits for open-source models.' },
  nvidia: { daily_requests: 5000, rate_limit: '5,000 requests/day', notes: 'Free tier via NVIDIA NIM API. Requires NVIDIA account login.' },
  huggingface: { rate_limit: 'Varies by model', notes: 'Free inference tier via Hugging Face Serverless API. Cold starts may apply.' },
  google: { daily_requests: 1500, rate_limit: '15 RPM / 1M TPM', notes: 'Free tier via Google AI Studio. Rate limits vary by model tier.' },
  deepseek: { rate_limit: 'Varies; throttled during peak', notes: 'Free tier access. May be throttled during peak hours. Requires DeepSeek account.' },
  groq: { rate_limit: '30 RPM / 7,000 TPM', notes: 'Free tier. Rate limits may decrease during high demand.' },
  opencode: { rate_limit: 'Varies by model', notes: 'Free tier models via OpenCode Zen. Requires OpenCode account.' },
  // GitHub / Cloudflare / Cohere / Mistral
  'github-models': { rate_limit: 'Varies by model', notes: 'Free tier via GitHub Models. Requires GitHub account. Rate limits vary by model.' },
  cloudflare: { rate_limit: 'Varies by model', notes: 'Free tier via Cloudflare Workers AI. Limited daily requests.' },
  'cloudflare-ai-gateway': { rate_limit: 'Varies by model', notes: 'Free tier via Cloudflare AI Gateway. Limited daily requests.' },
  cohere: { rate_limit: 'Varies by model', notes: 'Free trial tier via Cohere. Rate limited.' },
  mistral: { rate_limit: 'Varies by model', notes: 'Free tier via Mistral API. Rate limited.' },

  // GitLab / HuggingFace community
  gitlab: { rate_limit: 'Varies by model', notes: 'Free tier via GitLab AI. Requires GitLab account.' },
  modelsdev: { rate_limit: 'Varies by model', notes: 'Free inference via Hugging Face community providers. Cold starts and rate limits apply.' },

  // Chinese coding-plan providers
  iflowcn: { rate_limit: 'Varies by model', notes: 'Free tier via iFlow CN. Rate limited.' },
  'alibaba-coding-plan': { rate_limit: 'Varies by model', notes: 'Free tier via Alibaba Cloud coding plan. Requires account.' },
  'alibaba-coding-plan-cn': { rate_limit: 'Varies by model', notes: 'Free tier via Alibaba Cloud coding plan (CN). Requires account.' },
  'tencent-coding-plan': { rate_limit: 'Varies by model', notes: 'Free tier via Tencent Cloud coding plan. Requires account.' },
  'xiaomi-token-plan-ams': { rate_limit: 'Varies by model', notes: 'Free tier via Xiaomi token plan (AMS). Requires account.' },
  'xiaomi-token-plan-cn': { rate_limit: 'Varies by model', notes: 'Free tier via Xiaomi token plan (CN). Requires account.' },
  'xiaomi-token-plan-sgp': { rate_limit: 'Varies by model', notes: 'Free tier via Xiaomi token plan (SGP). Requires account.' },
  'minimax-coding-plan': { rate_limit: 'Varies by model', notes: 'Free tier via MiniMax coding plan. Requires account.' },
  'minimax-cn-coding-plan': { rate_limit: 'Varies by model', notes: 'Free tier via MiniMax coding plan (CN). Requires account.' },
  'zhipuai-coding-plan': { rate_limit: 'Varies by model', notes: 'Free tier via ZhipuAI coding plan. Requires account.' },
  'kimi-for-coding': { rate_limit: 'Varies by model', notes: 'Free tier via Kimi for Coding. Requires account.' },
  'umans-ai-coding-plan': { rate_limit: 'Varies by model', notes: "Free tier via Uman's AI coding plan. Requires account." },
  'kuae-cloud-coding-plan': { rate_limit: 'Varies by model', notes: 'Free tier via Kuae Cloud coding plan. Requires account.' },

  // Other providers
  kilo: { rate_limit: 'Varies by model', notes: 'Free tier via Kilo. Rate limited.' },
  modelscope: { rate_limit: 'Varies by model', notes: 'Free tier via ModelScope. Requires account.' },
  llama: { rate_limit: 'Varies by model', notes: 'Free tier via Llama API. Rate limited.' },
  cortecs: { rate_limit: 'Varies by model', notes: 'Free tier via Cortecs. Rate limited.' },
  'atomic-chat': { rate_limit: 'Varies by model', notes: 'Free tier via Atomic Chat. Rate limited.' },
  aihubmix: { rate_limit: 'Varies by model', notes: 'Free tier via AI Hub Mix. Rate limited.' },
  siliconflow: { rate_limit: 'Varies by model', notes: 'Free tier via SiliconFlow. Requires account.' },
  'siliconflow-cn': { rate_limit: 'Varies by model', notes: 'Free tier via SiliconFlow (CN). Requires account.' },
  lmstudio: { rate_limit: 'Varies by model', notes: 'Free tier via LM Studio. Local inference; no API rate limits.' },
  poe: { rate_limit: 'Varies by model', notes: 'Free tier via Poe by Quora. Daily message limits apply.' },
  vercel: { rate_limit: 'Varies by model', notes: 'Free tier via Vercel AI. Rate limited.' },
  zenmux: { rate_limit: 'Varies by model', notes: 'Free tier via ZenMux. Rate limited.' },
  zhipuai: { rate_limit: 'Varies by model', notes: 'Free tier via ZhipuAI. Requires account.' },
  'alibaba-cn': { rate_limit: 'Varies by model', notes: 'Free tier via Alibaba Cloud (CN). Requires account.' },
  nova: { rate_limit: 'Varies by model', notes: 'Free tier via Nova. Rate limited.' },
  poolside: { rate_limit: 'Varies by model', notes: 'Free tier via Poolside. Rate limited.' },
  firepass: { rate_limit: 'Varies by model', notes: 'Free tier via Firepass. Rate limited.' },
  jiekou: { rate_limit: 'Varies by model', notes: 'Free tier via Jiekou. Rate limited.' },
  meganova: { rate_limit: 'Varies by model', notes: 'Free tier via MegaNova. Rate limited.' },
  'nano-gpt': { rate_limit: 'Varies by model', notes: 'Free tier via NanoGPT. Rate limited.' },
  'novita-ai': { rate_limit: 'Varies by model', notes: 'Free tier via Novita AI. Rate limited.' },
  orcarouter: { rate_limit: 'Varies by model', notes: 'Free tier via OrcaRouter. Rate limited.' },
  'tencent-tokenhub': { rate_limit: 'Varies by model', notes: 'Free tier via Tencent TokenHub. Requires account.' },
  llmgateway: { rate_limit: 'Varies by model', notes: 'Free tier via LLM Gateway. Rate limited.' },
  'privatemode-ai': { rate_limit: 'Varies by model', notes: 'Free tier via PrivateMode AI. Rate limited.' },
};

(async () => {
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.includes('sslmode=require') && !connectionString.includes('uselibpqcompat')) {
    connectionString = connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
  }
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0;
    for (const [slug, limits] of Object.entries(LIMITS)) {
      const res = await client.query(
        `UPDATE datapoint_models dm
         SET limitations = $1
         FROM datapoint_providers dp
         WHERE dm.datapoint_provider_id = dp.id
           AND dp.slug = $2
           AND dm.limitations IS NULL
           AND dm.is_free = true`,
        [JSON.stringify(limits), slug]
      );
      if (res.rowCount > 0) console.log(`${slug}: ${res.rowCount} updated`);
      total += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Total updated: ${total}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
