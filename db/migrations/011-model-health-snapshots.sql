-- 011-model-health-snapshots.sql
-- Per-model health history tracking for stability computation and degradation detection.

BEGIN;

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

COMMIT;
