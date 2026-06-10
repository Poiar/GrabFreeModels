-- Add serves_third_party to datapoint_providers
-- Distinguishes inference providers that host models from other creators (like Groq, Together)
-- from those that only serve their own first-party models (like DeepSeek, Google, xAI).
-- TRUE = hosts models from other creators / serves as an open-model platform
-- FALSE = only serves the organization's own models
-- NULL = not applicable (discovery platforms, etc.)

ALTER TABLE datapoint_providers
  ADD COLUMN serves_third_party BOOLEAN;

-- ── Routers: by definition always serve third-party models ──
UPDATE datapoint_providers SET serves_third_party = true WHERE provider_type = 'router';

-- ── Local: runs any model the user downloads ──
UPDATE datapoint_providers SET serves_third_party = true WHERE provider_type = 'local';

-- ── Discovery: N/A ──
-- modelsdev stays NULL

-- ── Inference: first-party only (serve ONLY their own models) ──
UPDATE datapoint_providers SET serves_third_party = false WHERE slug IN (
  'deepseek',
  'google',
  'xai',
  'anthropic',
  'mistral',
  'zhipuai',
  'openai',
  'cohere',
  'alibaba',
  'alibaba-cn',
  'alibaba-coding-plan',
  'alibaba-coding-plan-cn',
  'tencent-coding-plan',
  'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'minimax-coding-plan',
  'minimax-cn-coding-plan',
  'kimi-for-coding',
  'zhipuai-coding-plan',
  'zai',
  'zai-coding-plan',
  'poolside',
  'cortecs'
);

-- ── Inference: open-model hosts (serve models from other creators) ──
UPDATE datapoint_providers SET serves_third_party = true WHERE slug IN (
  'groq',
  'cerebras',
  'together',
  'fireworks',
  'deepinfra',
  'novitaai',
  'siliconflow',
  'siliconflow-cn',
  'nvidia',
  'cloudflare',
  'github-models',
  'firepass',
  'aihubmix',
  'modelscope',
  'jiekou',
  'zenmux',
  'meganova',
  'nova',
  'poe',
  'tencent-tokenhub',
  'umans-ai-coding-plan',
  'kuae-cloud-coding-plan',
  'gitlab',
  'llama',
  'nano-gpt',
  'privatemode-ai',
  'kilo',
  'orcarouter',
  'fastrouter',
  'iflowcn',
  'atomic-chat'
);
