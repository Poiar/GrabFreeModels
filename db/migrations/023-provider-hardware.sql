-- Add hardware classification to datapoint_providers.
-- Distinguishes the physical compute substrate providers run on —
-- affects latency, throughput, and cost expectations.

CREATE TYPE provider_hardware AS ENUM (
  'gpu',      -- Standard GPU clusters (NVIDIA, Together, Fireworks, etc.)
  'lpu',      -- Language Processing Unit — Groq's custom inference chip
  'wafer',    -- Wafer-scale engine — Cerebras' custom accelerator
  'tpu',      -- Google's Tensor Processing Unit
  'edge',     -- Edge/global network (Cloudflare Workers AI)
  'local',    -- Runs on user's own hardware (LM Studio)
  'unknown'   -- Not applicable or undisclosed (routers, discovery)
);

ALTER TABLE datapoint_providers
  ADD COLUMN hardware provider_hardware DEFAULT 'unknown';

-- ── GPU: standard GPU clusters ──
UPDATE datapoint_providers SET hardware = 'gpu' WHERE slug IN (
  'nvidia', 'together', 'fireworks', 'deepinfra', 'novitaai', 'siliconflow',
  'siliconflow-cn', 'github-models', 'mistral', 'anthropic', 'openai',
  'cohere', 'deepseek', 'xai', 'zhipuai', 'zhipuai-coding-plan',
  'alibaba', 'alibaba-cn', 'alibaba-coding-plan', 'alibaba-coding-plan-cn',
  'firepass', 'cortecs', 'aihubmix', 'modelscope', 'jiekou', 'zenmux',
  'meganova', 'nova', 'tencent-tokenhub', 'tencent-coding-plan',
  'xiaomi-token-plan-ams', 'xiaomi-token-plan-cn', 'xiaomi-token-plan-sgp',
  'minimax-coding-plan', 'minimax-cn-coding-plan', 'kimi-for-coding',
  'umans-ai-coding-plan', 'kuae-cloud-coding-plan', 'gitlab', 'llama',
  'poolside', 'zai', 'zai-coding-plan', 'atomic-chat', 'iflowcn',
  'nano-gpt', 'orcarouter', 'fastrouter', 'privatemode-ai', 'kilo',
  'poe'
);

-- ── LPU: Groq's custom inference processor ──
UPDATE datapoint_providers SET hardware = 'lpu' WHERE slug IN ('groq');

-- ── Wafer-scale: Cerebras' CS-3 wafer-scale engine ──
UPDATE datapoint_providers SET hardware = 'wafer' WHERE slug IN ('cerebras');

-- ── TPU: Google's tensor processors ──
UPDATE datapoint_providers SET hardware = 'tpu' WHERE slug IN ('google');

-- ── Edge: global edge/CDN infrastructure ──
UPDATE datapoint_providers SET hardware = 'edge' WHERE slug IN ('cloudflare');

-- ── Local: user's own hardware ──
UPDATE datapoint_providers SET hardware = 'local' WHERE slug IN ('lmstudio');

-- ── Routers / discovery: keep 'unknown' (no inference hardware) ──
-- Already default for: openrouter, vercel, cloudflare-ai-gateway,
--   llmgateway, huggingface, opencode, modelsdev
