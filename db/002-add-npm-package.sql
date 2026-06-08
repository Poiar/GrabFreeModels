-- Migration 002: Add npm_package column to datapoint_providers
-- Tracks the AI SDK npm package name for each provider
-- Used by the frontend to show SDK installation snippets
-- Source: https://github.com/sst/models.dev/tree/dev/providers (provider.toml files)

ALTER TABLE datapoint_providers ADD COLUMN IF NOT EXISTS npm_package VARCHAR(128);

-- Populate npm_package for known providers using a single UPDATE with CASE
UPDATE datapoint_providers SET npm_package = CASE slug
  -- Specific AI SDK packages
  WHEN 'openai'        THEN '@ai-sdk/openai'
  WHEN 'anthropic'     THEN '@ai-sdk/anthropic'
  WHEN 'google'        THEN '@ai-sdk/google'
  WHEN 'groq'          THEN '@ai-sdk/groq'
  WHEN 'mistral'       THEN '@ai-sdk/mistral'
  WHEN 'deepseek'      THEN '@ai-sdk/deepseek'
  WHEN 'cerebras'      THEN '@ai-sdk/cerebras'
  WHEN 'cohere'        THEN '@ai-sdk/cohere'
  WHEN 'xai'           THEN '@ai-sdk/xai'
  WHEN 'perplexity'    THEN '@ai-sdk/perplexity'
  WHEN 'togetherai'    THEN '@ai-sdk/togetherai'
  WHEN 'deepinfra'     THEN '@ai-sdk/deepinfra'
  WHEN 'vercel'        THEN '@ai-sdk/gateway'
  WHEN 'openrouter'    THEN '@openrouter/ai-sdk-provider'
  WHEN 'gitlab'        THEN 'gitlab-ai-provider'
  WHEN 'cloudflare-ai-gateway' THEN 'ai-gateway-provider'
  WHEN 'aihubmix'      THEN '@aihubmix/ai-sdk-provider'
  -- cloudflare workers AI uses @ai-sdk/openai-compatible
  WHEN 'cloudflare'    THEN '@ai-sdk/openai-compatible'
  WHEN 'fireworks'     THEN '@ai-sdk/openai-compatible'
  WHEN 'together'      THEN '@ai-sdk/openai-compatible'
  WHEN 'novitaai'      THEN '@ai-sdk/openai-compatible'
  -- @ai-sdk/openai-compatible providers
  WHEN 'nvidia'        THEN '@ai-sdk/openai-compatible'
  WHEN 'huggingface'   THEN '@ai-sdk/openai-compatible'
  WHEN 'github-models' THEN '@ai-sdk/openai-compatible'
  WHEN 'opencode'      THEN '@ai-sdk/openai-compatible'
  WHEN 'llmgateway'    THEN '@ai-sdk/openai-compatible'
  WHEN 'siliconflow'   THEN '@ai-sdk/openai-compatible'
  WHEN 'siliconflow-cn' THEN '@ai-sdk/openai-compatible'
  -- OpenAI-compatible routing/caching providers
  WHEN 'alibaba'            THEN '@ai-sdk/openai-compatible'
  WHEN 'alibaba-cn'         THEN '@ai-sdk/openai-compatible'
  WHEN 'alibaba-coding-plan' THEN '@ai-sdk/openai-compatible'
  WHEN 'alibaba-coding-plan-cn' THEN '@ai-sdk/openai-compatible'
  WHEN 'atomic-chat'        THEN '@ai-sdk/openai-compatible'
  WHEN 'cortecs'            THEN '@ai-sdk/openai-compatible'
  WHEN 'firepass'           THEN '@ai-sdk/openai-compatible'
  WHEN 'iflowcn'            THEN '@ai-sdk/openai-compatible'
  WHEN 'jiekou'             THEN '@ai-sdk/openai-compatible'
  WHEN 'kilo'               THEN '@ai-sdk/openai-compatible'
  WHEN 'llama'              THEN '@ai-sdk/openai-compatible'
  WHEN 'lmstudio'           THEN '@ai-sdk/openai-compatible'
  WHEN 'meganova'           THEN '@ai-sdk/openai-compatible'
  WHEN 'modelscope'         THEN '@ai-sdk/openai-compatible'
  WHEN 'nano-gpt'           THEN '@ai-sdk/openai-compatible'
  WHEN 'nova'               THEN '@ai-sdk/openai-compatible'
  WHEN 'novita-ai'          THEN '@ai-sdk/openai-compatible'
  WHEN 'orcarouter'         THEN '@ai-sdk/openai-compatible'
  WHEN 'poe'                THEN '@ai-sdk/openai-compatible'
  WHEN 'poolside'           THEN '@ai-sdk/openai-compatible'
  WHEN 'privatemode-ai'     THEN '@ai-sdk/openai-compatible'
  WHEN 'tencent-coding-plan' THEN '@ai-sdk/openai-compatible'
  WHEN 'tencent-tokenhub'   THEN '@ai-sdk/openai-compatible'
  WHEN 'umans-ai-coding-plan' THEN '@ai-sdk/openai-compatible'
  WHEN 'xiaomi-token-plan-ams' THEN '@ai-sdk/openai-compatible'
  WHEN 'xiaomi-token-plan-cn'  THEN '@ai-sdk/openai-compatible'
  WHEN 'xiaomi-token-plan-sgp' THEN '@ai-sdk/openai-compatible'
  WHEN 'zai'               THEN '@ai-sdk/openai-compatible'
  WHEN 'zai-coding-plan'   THEN '@ai-sdk/openai-compatible'
  WHEN 'zenmux'            THEN '@ai-sdk/openai-compatible'
  WHEN 'zhipuai'           THEN '@ai-sdk/openai-compatible'
  WHEN 'zhipuai-coding-plan' THEN '@ai-sdk/openai-compatible'
  -- Providers using @ai-sdk/anthropic (Anthropic-compatible routing)
  WHEN 'kimi-for-coding'   THEN '@ai-sdk/anthropic'
  WHEN 'kuae-cloud-coding-plan' THEN '@ai-sdk/openai-compatible'
  WHEN 'minimax'           THEN '@ai-sdk/anthropic'
  WHEN 'minimax-cn-coding-plan' THEN '@ai-sdk/anthropic'
  WHEN 'minimax-coding-plan' THEN '@ai-sdk/anthropic'
  ELSE npm_package
END
WHERE slug != 'modelsdev';
