-- v2 schema: Super-model + datapoint-provider pattern
-- Canonical source: models.dev (import via scripts/import-modelsdev.js)
-- Old tables (models, provider_models, providers, authors) dropped — data migrated into super_models/datapoint_models

-- Master model: the abstract identity
CREATE TABLE super_models (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(256) NOT NULL,
    slug            VARCHAR(256) NOT NULL UNIQUE,  -- normalized lowercase, no spaces
    creator         VARCHAR(128),                  -- organization behind the model
    base_creator    VARCHAR(128),                  -- original model maker (for derived/fine-tuned models)
    family          VARCHAR(64),                   -- model lineage (Llama, GPT, Qwen, etc.)
    base_model      VARCHAR(256),                  -- parent super_model slug this is derived/fine-tuned from
    derivation_method VARCHAR(32),                 -- how: finetune, merge, distillation, dpo, continued_pretraining, lora_adapter, quantization, foundation, unknown
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Data source providers (models.dev, OpenRouter, NVIDIA, etc.)
CREATE TABLE datapoint_providers (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(64) NOT NULL UNIQUE,
    name            VARCHAR(128) NOT NULL,
    base_url        VARCHAR(512),
    npm_package     VARCHAR(128),
    is_health_trackable BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status enum for datapoint_models
CREATE TYPE model_status AS ENUM (
    'working', 'broken', 'rate_limited', 'untested', 'not_found'
);

-- One row per provider's version of a model
CREATE TABLE datapoint_models (
    id                      SERIAL PRIMARY KEY,
    super_model_id         INTEGER NOT NULL REFERENCES super_models(id) ON DELETE CASCADE,
    datapoint_provider_id   INTEGER NOT NULL REFERENCES datapoint_providers(id) ON DELETE CASCADE,
    model_instance_key      VARCHAR(256) NOT NULL,        -- provider's own ID for this model instance
    full_id                 VARCHAR(512) NOT NULL UNIQUE, -- providerSlug/remoteId
    -- raw fields from the provider
    context_length          INTEGER,
    quantization            VARCHAR(32),                   -- weight precision: fp32, fp16, bf16, fp8, fp4, int8, int4, gguf, gptq, awq, bnb
    input_price_per_million NUMERIC(12,4) NOT NULL DEFAULT 0,
    output_price_per_million NUMERIC(12,4) NOT NULL DEFAULT 0,
    is_free                 BOOLEAN NOT NULL DEFAULT true,
    supports_tools          BOOLEAN,
    limitations             JSONB,                      -- free tier limits: {daily_tokens, daily_requests, rate_limit, requires_card, subscription_required, expires, notes}
    -- tracking
    is_removed              BOOLEAN NOT NULL DEFAULT false,
    status_result           model_status,
    status_tested           DATE,
    status_detail           TEXT,
    last_success            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (datapoint_provider_id, model_instance_key)
);

CREATE TABLE datapoint_model_input_types (
    id                SERIAL PRIMARY KEY,
    datapoint_model_id INTEGER NOT NULL REFERENCES datapoint_models(id) ON DELETE CASCADE,
    input_type        VARCHAR(32) NOT NULL,
    UNIQUE (datapoint_model_id, input_type)
);

CREATE TABLE datapoint_model_output_types (
    id                SERIAL PRIMARY KEY,
    datapoint_model_id INTEGER NOT NULL REFERENCES datapoint_models(id) ON DELETE CASCADE,
    output_type       VARCHAR(32) NOT NULL,
    UNIQUE (datapoint_model_id, output_type)
);

CREATE TABLE datapoint_model_features (
    id                SERIAL PRIMARY KEY,
    datapoint_model_id INTEGER NOT NULL REFERENCES datapoint_models(id) ON DELETE CASCADE,
    feature_type      VARCHAR(32) NOT NULL,
    value             VARCHAR(256) NOT NULL,
    UNIQUE (datapoint_model_id, feature_type, value)
);

-- Metadata key-value store (rankings, summary, etc.)
CREATE TABLE metadata (
    key         VARCHAR(128) PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- External model source data (community lists, leaderboards, etc.)
CREATE TABLE external_sources (
    id              SERIAL PRIMARY KEY,
    source_name     VARCHAR(128) NOT NULL UNIQUE,
    source_url      VARCHAR(512),
    raw_data        JSONB,
    models_data     JSONB,
    model_count     INTEGER DEFAULT 0,
    fetched_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source registry for provenance tracking (API providers + community lists)
CREATE TYPE source_type AS ENUM ('api_provider', 'community_list');

CREATE TABLE sources (
    id                SERIAL PRIMARY KEY,
    slug              VARCHAR(64) NOT NULL UNIQUE,
    name              VARCHAR(128) NOT NULL,
    source_type       source_type NOT NULL,
    datapoint_provider_id INTEGER REFERENCES datapoint_providers(id) ON DELETE SET NULL,
    source_url        VARCHAR(512),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Provenance junction: which sources contribute to which model instances
CREATE TABLE datapoint_model_sources (
    id                  SERIAL PRIMARY KEY,
    datapoint_model_id  INTEGER NOT NULL REFERENCES datapoint_models(id) ON DELETE CASCADE,
    source_id           INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (datapoint_model_id, source_id)
);

-- Normalized community-source provider entries
CREATE TABLE external_source_providers (
    id              SERIAL PRIMARY KEY,
    source_id       INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    external_name   VARCHAR(256) NOT NULL,
    mapped_slug     VARCHAR(64),
    trial_credits   TEXT,
    UNIQUE (source_id, external_name)
);

-- Normalized community-source model entries
CREATE TABLE external_source_models (
    id                          SERIAL PRIMARY KEY,
    source_id                   INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    external_source_provider_id INTEGER NOT NULL REFERENCES external_source_providers(id) ON DELETE CASCADE,
    model_name                  VARCHAR(256) NOT NULL,
    model_limits                TEXT,
    UNIQUE (source_id, external_source_provider_id, model_name)
);

CREATE INDEX idx_dm_sources_dm ON datapoint_model_sources(datapoint_model_id);
CREATE INDEX idx_dm_sources_src ON datapoint_model_sources(source_id);
CREATE INDEX idx_ext_src_prov_source ON external_source_providers(source_id);
CREATE INDEX idx_ext_src_models_provider ON external_source_models(external_source_provider_id);
CREATE INDEX idx_ext_src_models_source ON external_source_models(source_id);

-- External benchmark scores for models (Artificial Analysis, etc.)
CREATE TABLE model_scores (
    id                 SERIAL PRIMARY KEY,
    datapoint_model_id INTEGER NOT NULL REFERENCES datapoint_models(id) ON DELETE CASCADE,
    source             VARCHAR(64) NOT NULL,   -- e.g. 'artificial_analysis', 'arena', 'huggingface'
    score_type         VARCHAR(64) NOT NULL,   -- e.g. 'intelligence', 'elo', 'mmlu', 'humaneval', 'gsm8k', 'price', 'speed', 'latency'
    score_value        NUMERIC(12,4),
    raw_data           JSONB,                  -- optional: store the full scraped row
    fetched_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (datapoint_model_id, source, score_type)
);

-- Test observations: per-request latency and status for validation runs
-- datapoint_model_id is nullable because observations may reference models that
-- were tested but not yet persisted in datapoint_models at observation time.
CREATE TABLE test_observations (
    id                  SERIAL PRIMARY KEY,
    datapoint_model_id  INTEGER REFERENCES datapoint_models(id) ON DELETE CASCADE,
    full_id             VARCHAR(512) NOT NULL,
    provider            VARCHAR(64) NOT NULL,
    model_name          VARCHAR(256),
    status              VARCHAR(16) NOT NULL,       -- 'pass' or 'fail'
    latency_ms          NUMERIC(10,2),
    error_type          VARCHAR(64),                -- 'timeout', 'rate_limited', 'server_error', 'client_error', 'network_error', 'not_found'
    cost_details        JSONB,
    metadata            JSONB,
    tested_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Model health snapshots: per-validation-run results for stability tracking
CREATE TABLE IF NOT EXISTS model_health_snapshots (
  id SERIAL PRIMARY KEY,
  full_id TEXT NOT NULL,
  tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  detail TEXT,
  latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_health_full_id ON model_health_snapshots(full_id);
CREATE INDEX IF NOT EXISTS idx_health_tested_at ON model_health_snapshots(tested_at);

-- Indexes
CREATE INDEX idx_dp_models_super ON datapoint_models(super_model_id);
CREATE INDEX idx_dp_models_provider ON datapoint_models(datapoint_provider_id);
CREATE INDEX idx_dp_models_full_id ON datapoint_models(full_id);
CREATE INDEX idx_dp_models_status ON datapoint_models(status_result);
CREATE INDEX idx_dp_models_free ON datapoint_models(is_free);
CREATE INDEX idx_dp_models_removed ON datapoint_models(is_removed);
CREATE INDEX idx_super_slug ON super_models(slug);
CREATE INDEX idx_model_scores_dm ON model_scores(datapoint_model_id);
CREATE INDEX idx_model_scores_source ON model_scores(source);
CREATE INDEX idx_model_scores_type ON model_scores(score_type);
CREATE INDEX idx_model_scores_source_type ON model_scores(source, score_type);
CREATE INDEX idx_test_obs_full_id ON test_observations(full_id);
CREATE INDEX idx_test_obs_tested_at ON test_observations(tested_at);
CREATE INDEX idx_test_obs_provider ON test_observations(provider);
CREATE INDEX idx_test_obs_dm ON test_observations(datapoint_model_id);

-- Helper function: normalize model name to slug
-- Strips provider prefixes, lowercases, removes special chars
CREATE OR REPLACE FUNCTION normalize_model_slug(name TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    result := lower(name);
    -- Strip common prefixes like "coding-", "xiaomi-", "01-ai/", "Pro/"
    result := regexp_replace(result, '^(coding[-_]|xiaomi[-_]|01-ai[-_/]|pro[-_/])', '');
    -- Remove (free), (free tier) suffixes
    result := regexp_replace(result, '\s*\(free\s*(tier)?\)\s*$', '');
    -- Remove trailing " free" or "-free" bare word
    result := regexp_replace(result, '([-\s])free\s*$', '');
    -- Replace spaces and special chars with hyphens
    result := regexp_replace(result, '[^a-z0-9]+', '-', 'g');
    -- Trim leading/trailing hyphens
    result := trim(both '-' from result);
    -- Collapse multiple hyphens
    result := regexp_replace(result, '-{2,}', '-', 'g');
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Seed datapoint_providers
INSERT INTO datapoint_providers (slug, name, base_url, provider_type, serves_third_party, hardware, is_openai_compat) VALUES
    ('modelsdev', 'models.dev', 'https://models.dev', 'discovery', NULL, 'unknown', true),
    ('openrouter', 'OpenRouter', 'https://openrouter.ai', 'router', true, 'unknown', true),
    ('nvidia', 'NVIDIA', 'https://integrate.api.nvidia.com', 'inference', true, 'gpu', true),
    ('cerebras', 'Cerebras', 'https://api.cerebras.ai', 'inference', true, 'wafer', true),
    ('huggingface', 'Hugging Face', 'https://huggingface.co', 'router', true, 'unknown', true),
    ('deepseek', 'DeepSeek', 'https://api.deepseek.com', 'inference', false, 'gpu', true),
    ('google', 'Google AI', 'https://generativelanguage.googleapis.com', 'inference', false, 'tpu', true),
    ('opencode', 'OpenCode Zen', 'https://opencode.ai/zen', 'router', true, 'unknown', false),
    ('llmgateway', 'LLM Gateway', 'https://llm-gateway.com', 'router', true, 'unknown', true),
    ('github-models', 'GitHub Models', 'https://models.inference.ai.azure.com', 'inference', true, 'gpu', true),
    ('vercel', 'Vercel AI Gateway', 'https://ai-gateway.vercel.sh', 'router', true, 'unknown', true),
    ('groq', 'Groq', 'https://api.groq.com', 'inference', true, 'lpu', true),
    ('mistral', 'Mistral', 'https://api.mistral.ai', 'inference', false, 'gpu', true),
    ('together', 'Together', 'https://api.together.xyz', 'inference', true, 'gpu', true),
    ('fireworks', 'Fireworks', 'https://api.fireworks.ai', 'inference', true, 'gpu', true),
    ('cloudflare', 'Cloudflare AI', 'https://api.cloudflare.com', 'inference', true, 'edge', false),
    ('anthropic', 'Anthropic', 'https://api.anthropic.com', 'inference', false, 'gpu', true),
    ('openai', 'OpenAI', 'https://api.openai.com', 'inference', false, 'gpu', true)
ON CONFLICT (slug) DO NOTHING;

-- Seed sources for provenance tracking (one per API provider, plus community sources)
INSERT INTO sources (slug, name, source_type, datapoint_provider_id)
SELECT dp.slug || '-api', dp.name || ' API', 'api_provider', dp.id
FROM datapoint_providers dp
ON CONFLICT (slug) DO NOTHING;

INSERT INTO sources (slug, name, source_type, source_url)
VALUES ('free-llm-api-resources', 'Free LLM API Resources (community list)', 'community_list',
        'https://raw.githubusercontent.com/cheahjs/free-llm-api-resources/main/README.md')
ON CONFLICT (slug) DO NOTHING;