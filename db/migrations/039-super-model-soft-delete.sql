-- Add soft-delete support to super_models.
-- datapoint_models already has is_removed; super_models had no equivalent,
-- meaning cascade deletes destroyed the audit trail.

ALTER TABLE super_models
  ADD COLUMN is_removed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE super_models
  ADD COLUMN removed_at TIMESTAMPTZ;

CREATE INDEX idx_super_models_removed ON super_models(is_removed);

COMMENT ON COLUMN super_models.is_removed IS
  'Soft-delete flag. When true, the model and all its datapoints should be excluded from API responses.';
COMMENT ON COLUMN super_models.removed_at IS
  'Timestamp when the model was soft-deleted. NULL if not removed.';
