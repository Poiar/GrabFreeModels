-- Promote super-model-level fields from the EAV feature table to proper
-- columns on super_models. These are inherently model-identity properties,
-- not per-provider variations.
--
-- Fields promoted:
--   knowledge_cutoff  → super_models.knowledge_cutoff  (DATE)
--   release_date      → super_models.release_date       (DATE)
--   description       → super_models.description        (TEXT)

-- Add columns
ALTER TABLE super_models
  ADD COLUMN knowledge_cutoff DATE,
  ADD COLUMN release_date     DATE,
  ADD COLUMN description      TEXT;

-- Backfill from EAV features (pick the first non-null value per super_model)
-- We join through datapoint_models to find which super_model each feature belongs to.
WITH feature_values AS (
  SELECT DISTINCT ON (dm.super_model_id, df.feature_type)
    dm.super_model_id,
    df.feature_type,
    df.value
  FROM datapoint_model_features df
  JOIN datapoint_models dm ON dm.id = df.datapoint_model_id
  WHERE df.feature_type IN ('knowledge_cutoff', 'release_date', 'description')
  ORDER BY dm.super_model_id, df.feature_type, dm.id  -- earliest datapoint wins
)
UPDATE super_models sm SET
  knowledge_cutoff = (SELECT value::DATE FROM feature_values fv
    WHERE fv.super_model_id = sm.id AND fv.feature_type = 'knowledge_cutoff'
    AND value ~ '^\d{4}-\d{2}-\d{2}'),
  release_date = (SELECT value::DATE FROM feature_values fv
    WHERE fv.super_model_id = sm.id AND fv.feature_type = 'release_date'
    AND value ~ '^\d{4}-\d{2}-\d{2}'),
  description = (SELECT value FROM feature_values fv
    WHERE fv.super_model_id = sm.id AND fv.feature_type = 'description'
    AND length(value) > 0)
WHERE sm.id IN (SELECT super_model_id FROM feature_values);

-- NOTE: The old feature rows are NOT deleted here — Phase 8 cleanup will
-- handle removing them after all consumers have migrated to the new columns.
COMMENT ON COLUMN super_models.knowledge_cutoff IS 'Training data cutoff date (promoted from EAV features)';
COMMENT ON COLUMN super_models.description IS 'Model description (promoted from EAV features)';
COMMENT ON COLUMN super_models.release_date IS 'Model release date (promoted from EAV features)';
