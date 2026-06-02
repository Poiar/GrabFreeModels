-- GrabFreeModels normalized schema

CREATE TABLE IF NOT EXISTS providers (
    id          SERIAL PRIMARY KEY,
    slug        VARCHAR(64)  NOT NULL UNIQUE,
    name        VARCHAR(128) NOT NULL,
    base_url    VARCHAR(512)
);

CREATE TABLE IF NOT EXISTS authors (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(256) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS models (
    id                      SERIAL PRIMARY KEY,
    name                    VARCHAR(256) NOT NULL,
    author_id               INTEGER REFERENCES authors(id),
    context_length          INTEGER,
    input_price_per_million NUMERIC(12,4) NOT NULL DEFAULT 0,
    output_price_per_million NUMERIC(12,4) NOT NULL DEFAULT 0,
    is_free                 BOOLEAN NOT NULL DEFAULT true,
    supports_tools          BOOLEAN,
    supports_reasoning      BOOLEAN,
    output_limit            INTEGER,
    temperature             BOOLEAN,
    open_weights            BOOLEAN,
    family                  VARCHAR(64),
    knowledge_cutoff        VARCHAR(32),
    release_date            DATE,
    last_updated            DATE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, author_id)
);

CREATE TABLE IF NOT EXISTS provider_models (
    id              SERIAL PRIMARY KEY,
    model_id        INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    provider_id     INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    remote_id       VARCHAR(256) NOT NULL,
    full_id         VARCHAR(512) NOT NULL UNIQUE,
    source          VARCHAR(32) NOT NULL DEFAULT 'curated',
    status_result   VARCHAR(32),
    status_tested   DATE,
    status_detail   TEXT,
    last_success    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (full_id)
);

CREATE TABLE IF NOT EXISTS model_input_types (
    id          SERIAL PRIMARY KEY,
    model_id    INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    input_type  VARCHAR(32) NOT NULL,
    UNIQUE (model_id, input_type)
);

CREATE TABLE IF NOT EXISTS model_output_types (
    id           SERIAL PRIMARY KEY,
    model_id     INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    output_type  VARCHAR(32) NOT NULL,
    UNIQUE (model_id, output_type)
);

CREATE TABLE IF NOT EXISTS model_features (
    id              SERIAL PRIMARY KEY,
    model_id        INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    feature_type    VARCHAR(32) NOT NULL,
    value           VARCHAR(256) NOT NULL,
    UNIQUE (model_id, feature_type, value)
);

CREATE TABLE IF NOT EXISTS test_results (
    id                  SERIAL PRIMARY KEY,
    provider_model_id   INTEGER NOT NULL REFERENCES provider_models(id) ON DELETE CASCADE,
    tested_at           TIMESTAMPTZ NOT NULL,
    result              VARCHAR(32) NOT NULL,
    detail              TEXT
);

CREATE TABLE IF NOT EXISTS metadata (
    key         VARCHAR(128) PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_models_provider ON provider_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_models_model   ON provider_models(model_id);
CREATE INDEX IF NOT EXISTS idx_models_author            ON models(author_id);
CREATE INDEX IF NOT EXISTS idx_models_family            ON models(family);
CREATE INDEX IF NOT EXISTS idx_test_results_pm          ON test_results(provider_model_id);
