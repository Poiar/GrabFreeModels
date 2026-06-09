-- 003-test-observations.sql
-- Adds structured test observation storage for per-request latency and status tracking.

BEGIN;

CREATE TABLE IF NOT EXISTS test_observations (
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

CREATE INDEX IF NOT EXISTS idx_test_obs_full_id ON test_observations(full_id);
CREATE INDEX IF NOT EXISTS idx_test_obs_tested_at ON test_observations(tested_at);
CREATE INDEX IF NOT EXISTS idx_test_obs_provider ON test_observations(provider);
CREATE INDEX IF NOT EXISTS idx_test_obs_dm ON test_observations(datapoint_model_id);

COMMIT;
