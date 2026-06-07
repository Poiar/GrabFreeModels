-- v2 schema: Super-model + datapoint-provider pattern
-- Canonical source: models.dev (import via scripts/import-modelsdev.js)
-- Old tables (models, provider_models, providers, authors) dropped — data migrated into super_models/datapoint_models

-- Master model: the abstract identity
CREATE TABLE super_models (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(256) NOT NULL,
    slug            VARCHAR(256) NOT NULL UNIQUE,  -- normalized lowercase, no spaces
    creator         VARCHAR(128),                  -- organization behind the model
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Data source providers (models.dev, OpenRouter, NVIDIA, etc.)
CREATE TABLE datapoint_providers (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(64) NOT NULL UNIQUE,
    name            VARCHAR(128) NOT NULL,
    base_url        VARCHAR(512),
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
    remote_id               VARCHAR(256) NOT NULL,        -- provider's own ID
    full_id                 VARCHAR(512) NOT NULL UNIQUE, -- providerSlug/remoteId
    -- raw fields from the provider
    context_length          INTEGER,
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
    UNIQUE (datapoint_provider_id, remote_id)
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

-- Helper function: normalize model name to slug
-- Strips provider prefixes, lowercases, removes special chars
CREATE OR REPLACE FUNCTION normalize_model_slug(name TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    result := lower(name);
    -- Strip common prefixes like "coding-", "xiaomi-"
    result := regexp_replace(result, '^(coding[-_]|xiaomi[-_])', '');
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
INSERT INTO datapoint_providers (slug, name, base_url) VALUES
    ('modelsdev', 'models.dev', 'https://models.dev'),
    ('openrouter', 'OpenRouter', 'https://openrouter.ai'),
    ('nvidia', 'NVIDIA', 'https://integrate.api.nvidia.com'),
    ('cerebras', 'Cerebras', 'https://api.cerebras.ai'),
    ('huggingface', 'Hugging Face', 'https://huggingface.co'),
    ('deepseek', 'DeepSeek', 'https://api.deepseek.com'),
    ('google', 'Google AI', 'https://generativelanguage.googleapis.com'),
    ('opencode-zen', 'OpenCode Zen', 'https://opencode.ai/zen'),
    ('llm-gateway', 'LLM Gateway', 'https://llm-gateway.com'),
    ('github-models', 'GitHub Models', 'https://models.inference.ai.azure.com'),
    ('vercel', 'Vercel AI Gateway', 'https://ai-gateway.vercel.sh'),
    ('groq', 'Groq', 'https://api.groq.com'),
    ('mistral', 'Mistral', 'https://api.mistral.ai'),
    ('together', 'Together', 'https://api.together.xyz'),
    ('fireworks', 'Fireworks', 'https://api.fireworks.ai'),
    ('cloudflare', 'Cloudflare AI', 'https://api.cloudflare.com'),
    ('anthropic', 'Anthropic', 'https://api.anthropic.com'),
    ('openai', 'OpenAI', 'https://api.openai.com')
ON CONFLICT (slug) DO NOTHING;