-- Move base_model from datapoint_model_features to super_models column.
-- Run this migration, then: node scripts/backfill-base-models.js --apply

-- Step 1: Add the column (idempotent)
ALTER TABLE super_models
ADD COLUMN IF NOT EXISTS base_model VARCHAR(256);

-- Step 2: Migrate existing data (deduplicated: one value per super_model)
UPDATE super_models sm
SET base_model = (
    SELECT df.value
    FROM datapoint_model_features df
    JOIN datapoint_models dm ON dm.id = df.datapoint_model_id
    WHERE dm.super_model_id = sm.id AND df.feature_type = 'base_model'
    LIMIT 1
)
WHERE EXISTS (
    SELECT 1 FROM datapoint_model_features df
    JOIN datapoint_models dm ON dm.id = df.datapoint_model_id
    WHERE dm.super_model_id = sm.id AND df.feature_type = 'base_model'
);

-- Step 3: Clean up feature rows
DELETE FROM datapoint_model_features WHERE feature_type = 'base_model';
