-- Fix model_scores FK to reference super_models instead of (only) datapoint_models.
-- Benchmark scores are model-level properties — they don't vary by provider.
-- The existing datapoint_model_id FK forces a read-time fan-out hack in build-models-data.js.
--
-- This migration adds super_model_id WITHOUT dropping datapoint_model_id.
-- Both coexist during migration; datapoint_model_id is dropped in the cleanup phase.

-- Add super_model_id column (nullable initially for backfill)
ALTER TABLE model_scores
  ADD COLUMN super_model_id INTEGER REFERENCES super_models(id) ON DELETE CASCADE;

-- Populate from existing datapoint_model_id → datapoint_models → super_models
UPDATE model_scores ms
SET super_model_id = dm.super_model_id
FROM datapoint_models dm
WHERE dm.id = ms.datapoint_model_id
  AND ms.super_model_id IS NULL;

-- Make NOT NULL after population
ALTER TABLE model_scores
  ALTER COLUMN super_model_id SET NOT NULL;

-- Mark old FK as deprecated
COMMENT ON COLUMN model_scores.datapoint_model_id IS
  'DEPRECATED: use super_model_id instead. Kept for read compatibility during migration.';

-- Index for the new FK
CREATE INDEX idx_model_scores_super ON model_scores(super_model_id);

-- Composite index for the most common query: scores for a model by source+type
CREATE INDEX idx_model_scores_super_source_type ON model_scores(super_model_id, source, score_type);

-- Update the UNIQUE constraint: (datapoint_model_id, source, score_type) →
-- also enforce (super_model_id, source, score_type) to prevent duplicates at model level.
-- First deduplicate: multiple datapoints of the same super_model may have the same score.
-- Keep the row with the most recent fetched_at for each (super_model_id, source, score_type).

DELETE FROM model_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY super_model_id, source, score_type
             ORDER BY fetched_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM model_scores
  ) sub
  WHERE rn > 1
);

CREATE UNIQUE INDEX uq_model_scores_super_source_type
  ON model_scores(super_model_id, source, score_type);

COMMENT ON COLUMN model_scores.super_model_id IS
  'FK to super_models(id) — the correct model-level reference for benchmark scores.';
