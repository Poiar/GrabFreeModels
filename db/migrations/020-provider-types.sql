-- Add provider_type classification to datapoint_providers
-- Distinguishes routers (multi-provider gateways) from inference platforms
-- (run models on their own hardware), local runners, and discovery indices.

CREATE TYPE provider_type AS ENUM (
  'router',        -- Multi-provider API gateway (OpenRouter, Vercel, etc.)
  'inference',     -- Runs models on owned/rented compute (Groq, Together, etc.)
  'local',         -- Runs on user hardware, no cloud dependency (LM Studio)
  'discovery'      -- Meta-index / discovery platform, doesn't serve models (models.dev)
);

ALTER TABLE datapoint_providers
  ADD COLUMN provider_type provider_type;

-- ── Routers: multi-provider gateways that aggregate backend providers ──
UPDATE datapoint_providers SET provider_type = 'router' WHERE slug IN (
  'openrouter',
  'vercel',
  'cloudflare-ai-gateway',
  'llmgateway',
  'huggingface',
  'opencode'
);

-- ── Inference: providers that run models on their own infrastructure ──
UPDATE datapoint_providers SET provider_type = 'inference' WHERE slug IN (
  'cerebras',
  'nvidia',
  'google',
  'deepseek',
  'groq',
  'deepinfra',
  'novitaai',
  'siliconflow',
  'xai',
  'zhipuai',
  'cloudflare',
  'github-models',
  'together',
  'fireworks',
  'mistral',
  'anthropic',
  'openai',
  'cohere',
  'alibaba',
  'alibaba-cn',
  'alibaba-coding-plan',
  'alibaba-coding-plan-cn',
  'siliconflow-cn',
  'zhipuai-coding-plan',
  'firepass',
  'cortecs',
  'atomic-chat',
  'iflowcn',
  'aihubmix',
  'modelscope',
  'jiekou',
  'zenmux',
  'meganova',
  'nova',
  'poe',
  'tencent-tokenhub',
  'tencent-coding-plan',
  'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'minimax-coding-plan',
  'minimax-cn-coding-plan',
  'kimi-for-coding',
  'umans-ai-coding-plan',
  'kuae-cloud-coding-plan',
  'gitlab',
  'llama',
  'poolside',
  'zai',
  'zai-coding-plan',
  'nano-gpt',
  'privatemode-ai',
  'kilo',
  'orcarouter',
  'fastrouter'
);

-- ── Local: runs on user hardware ──
UPDATE datapoint_providers SET provider_type = 'local' WHERE slug IN (
  'lmstudio'
);

-- ── Discovery: meta-index, no inference endpoint ──
UPDATE datapoint_providers SET provider_type = 'discovery' WHERE slug IN (
  'modelsdev'
);
