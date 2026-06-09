-- 004-deprecated-at.sql
-- Adds deprecated_at tracking to datapoint_models for model lifecycle management.
-- When a provider marks a model as deprecated, we record the timestamp so the
-- frontend can surface deprecation status to users.

BEGIN;

ALTER TABLE datapoint_models
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_dp_models_deprecated
  ON datapoint_models(deprecated_at)
  WHERE deprecated_at IS NOT NULL;

COMMIT;
