-- 002-source-provenance.sql
-- Adds source registry, provenance tracking, and normalized community-source storage.

BEGIN;

-- Source type enum
DO $$ BEGIN
  CREATE TYPE source_type AS ENUM ('api_provider', 'community_list');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Master registry of all data sources
CREATE TABLE IF NOT EXISTS sources (
    id                SERIAL PRIMARY KEY,
    slug              VARCHAR(64) NOT NULL UNIQUE,
    name              VARCHAR(128) NOT NULL,
    source_type       source_type NOT NULL,
    datapoint_provider_id INTEGER REFERENCES datapoint_providers(id) ON DELETE SET NULL,
    source_url        VARCHAR(512),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Provenance junction: which sources contribute to which model instances
CREATE TABLE IF NOT EXISTS datapoint_model_sources (
    id                  SERIAL PRIMARY KEY,
    datapoint_model_id  INTEGER NOT NULL REFERENCES datapoint_models(id) ON DELETE CASCADE,
    source_id           INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (datapoint_model_id, source_id)
);

-- Normalized community-source provider entries (replaces JSONB blob queries)
CREATE TABLE IF NOT EXISTS external_source_providers (
    id              SERIAL PRIMARY KEY,
    source_id       INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    external_name   VARCHAR(256) NOT NULL,
    mapped_slug     VARCHAR(64),
    trial_credits   TEXT,
    UNIQUE (source_id, external_name)
);

-- Normalized community-source model entries
CREATE TABLE IF NOT EXISTS external_source_models (
    id                          SERIAL PRIMARY KEY,
    source_id                   INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    external_source_provider_id INTEGER NOT NULL REFERENCES external_source_providers(id) ON DELETE CASCADE,
    model_name                  VARCHAR(256) NOT NULL,
    model_limits                TEXT,
    UNIQUE (source_id, external_source_provider_id, model_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dm_sources_dm ON datapoint_model_sources(datapoint_model_id);
CREATE INDEX IF NOT EXISTS idx_dm_sources_src ON datapoint_model_sources(source_id);
CREATE INDEX IF NOT EXISTS idx_ext_src_prov_source ON external_source_providers(source_id);
CREATE INDEX IF NOT EXISTS idx_ext_src_models_provider ON external_source_models(external_source_provider_id);
CREATE INDEX IF NOT EXISTS idx_ext_src_models_source ON external_source_models(source_id);

-- Seed sources for API providers
INSERT INTO sources (slug, name, source_type, datapoint_provider_id)
SELECT 'openrouter-api', 'OpenRouter API', 'api_provider'::source_type, id FROM datapoint_providers WHERE slug = 'openrouter'
UNION ALL
SELECT 'cerebras-api', 'Cerebras API', 'api_provider'::source_type, id FROM datapoint_providers WHERE slug = 'cerebras'
UNION ALL
SELECT 'nvidia-api', 'NVIDIA API', 'api_provider'::source_type, id FROM datapoint_providers WHERE slug = 'nvidia'
UNION ALL
SELECT 'huggingface-api', 'HuggingFace API', 'api_provider'::source_type, id FROM datapoint_providers WHERE slug = 'huggingface'
UNION ALL
SELECT 'google-api', 'Google AI API', 'api_provider'::source_type, id FROM datapoint_providers WHERE slug = 'google'
UNION ALL
SELECT 'deepseek-api', 'DeepSeek API', 'api_provider'::source_type, id FROM datapoint_providers WHERE slug = 'deepseek'
UNION ALL
SELECT 'groq-api', 'Groq API', 'api_provider'::source_type, id FROM datapoint_providers WHERE slug = 'groq'
UNION ALL
SELECT 'opencode-api', 'OpenCode API', 'api_provider'::source_type, id FROM datapoint_providers WHERE slug = 'opencode'
UNION ALL
SELECT 'cloudflare-api', 'Cloudflare API', 'api_provider'::source_type, id FROM datapoint_providers WHERE slug = 'cloudflare'
ON CONFLICT (slug) DO NOTHING;

-- Seed API sources for providers that may not have datapoint_providers rows yet
-- (sync-models.js --apply creates the provider rows; backfill-provenance.js links them later)
INSERT INTO sources (slug, name, source_type)
VALUES
  ('deepinfra-api', 'DeepInfra API', 'api_provider'::source_type),
  ('novitaai-api', 'NovitaAI API', 'api_provider'::source_type)
ON CONFLICT (slug) DO NOTHING;

-- Seed the community source
INSERT INTO sources (slug, name, source_type)
VALUES ('free-llm-api-resources', 'cheahjs/free-llm-api-resources', 'community_list'::source_type)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
