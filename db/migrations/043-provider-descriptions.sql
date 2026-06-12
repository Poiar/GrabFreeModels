-- Consolidate provider metadata: add description column.
-- The column is populated from provider-descriptions.json by the migration runner
-- (scripts/utils/migrate.js executes a Node.js backfill step when it sees this sentinel).
-- Alternatively, run: node scripts/backfill-provider-metadata.js

-- Add description column
ALTER TABLE datapoint_providers ADD COLUMN IF NOT EXISTS description TEXT;

-- Fill NULL base_urls from provider-base-urls.json
UPDATE datapoint_providers SET base_url = u.base_url
FROM (VALUES
    ('alibaba-cn', 'https://dashscope.aliyuncs.com/api/v1'),
    ('alibaba-coding-plan', 'https://dashscope.aliyuncs.com/api/v1'),
    ('alibaba-coding-plan-cn', 'https://dashscope.aliyuncs.com/api/v1'),
    ('anthropic', 'https://api.anthropic.com'),
    ('cerebras', 'https://api.cerebras.ai/v1'),
    ('cloudflare', 'https://api.cloudflare.com/client/v4'),
    ('cloudflare-ai-gateway', 'https://gateway.ai.cloudflare.com/v1'),
    ('cohere', 'https://api.cohere.ai/v1'),
    ('deepinfra', 'https://api.deepinfra.com/v1/openai'),
    ('deepseek', 'https://api.deepseek.com/v1'),
    ('firepass', 'https://api.fireworks.ai'),
    ('fireworks', 'https://api.fireworks.ai'),
    ('github-models', 'https://models.inference.ai.azure.com'),
    ('google', 'https://generativelanguage.googleapis.com/v1beta'),
    ('groq', 'https://api.groq.com/openai/v1'),
    ('huggingface', 'https://router.huggingface.co/v1'),
    ('llmgateway', 'https://api.llmgateway.io/v1'),
    ('lmstudio', 'http://localhost:1234/v1'),
    ('mistral', 'https://api.mistral.ai/v1'),
    ('modelsdev', 'https://models.dev'),
    ('novitaai', 'https://api.novita.ai/v3/openai'),
    ('nvidia', 'https://integrate.api.nvidia.com'),
    ('openai', 'https://api.openai.com'),
    ('opencode', 'https://opencode.ai/zen'),
    ('openrouter', 'https://openrouter.ai'),
    ('siliconflow', 'https://api.siliconflow.cn/v1'),
    ('siliconflow-cn', 'https://api.siliconflow.cn/v1'),
    ('together', 'https://api.together.xyz'),
    ('xai', 'https://api.x.ai'),
    ('vercel', 'https://ai-gateway.vercel.sh')
) AS u(slug, base_url)
WHERE datapoint_providers.slug = u.slug
  AND datapoint_providers.base_url IS NULL;

COMMENT ON COLUMN datapoint_providers.description IS 'Human-readable provider description. Populated by scripts/backfill-provider-metadata.js.';
