-- Migration 001: Cleanup passive columns on datapoint_models
-- 1. Replace status_result VARCHAR with ENUM
-- 2. Move 8 pass-through columns into datapoint_model_features
-- 3. Drop orphaned test_results table (zero reads/writes in codebase)
-- 4. Drop dead author column from super_models (always null)
-- 5. Drop the now-removed columns from datapoint_models

BEGIN;

-- 1. Normalize 'paid' → 'not_found' (is_free already tracks paid status)
UPDATE datapoint_models SET status_result = 'not_found' WHERE status_result = 'paid';

-- 2. Create status ENUM and convert column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'model_status') THEN
        CREATE TYPE model_status AS ENUM (
            'working', 'broken', 'rate_limited', 'untested', 'not_found'
        );
    END IF;
END$$;

ALTER TABLE datapoint_models
    ALTER COLUMN status_result TYPE model_status
    USING status_result::model_status;

-- 2. Migrate existing data into datapoint_model_features
-- supports_reasoning (boolean → store as string 'true'/'false')
INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
    SELECT id, 'supports_reasoning', 'true'
    FROM datapoint_models
    WHERE supports_reasoning = true
ON CONFLICT (datapoint_model_id, feature_type, value) DO NOTHING;

-- output_limit (integer → store as string)
INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
    SELECT id, 'output_limit', output_limit::text
    FROM datapoint_models
    WHERE output_limit IS NOT NULL
ON CONFLICT (datapoint_model_id, feature_type, value) DO NOTHING;

-- temperature (boolean)
INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
    SELECT id, 'temperature', 'true'
    FROM datapoint_models
    WHERE temperature = true
ON CONFLICT (datapoint_model_id, feature_type, value) DO NOTHING;

-- open_weights (boolean)
INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
    SELECT id, 'open_weights', 'true'
    FROM datapoint_models
    WHERE open_weights = true
ON CONFLICT (datapoint_model_id, feature_type, value) DO NOTHING;

-- family (varchar)
INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
    SELECT id, 'family', family
    FROM datapoint_models
    WHERE family IS NOT NULL
ON CONFLICT (datapoint_model_id, feature_type, value) DO NOTHING;

-- knowledge_cutoff (varchar)
INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
    SELECT id, 'knowledge_cutoff', knowledge_cutoff
    FROM datapoint_models
    WHERE knowledge_cutoff IS NOT NULL
ON CONFLICT (datapoint_model_id, feature_type, value) DO NOTHING;

-- release_date (date)
INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
    SELECT id, 'release_date', release_date::text
    FROM datapoint_models
    WHERE release_date IS NOT NULL
ON CONFLICT (datapoint_model_id, feature_type, value) DO NOTHING;

-- last_updated (date)
INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value)
    SELECT id, 'last_updated', last_updated::text
    FROM datapoint_models
    WHERE last_updated IS NOT NULL
ON CONFLICT (datapoint_model_id, feature_type, value) DO NOTHING;

-- 3. Drop orphaned test_results table (zero reads/writes in codebase)
DROP TABLE IF EXISTS test_results CASCADE;
DROP INDEX IF EXISTS idx_test_results_dm;

-- 4. Drop dead author column from super_models (never populated, always null in API output)
ALTER TABLE super_models
    DROP COLUMN IF EXISTS author;

-- 5. Drop the migrated columns from datapoint_models
ALTER TABLE datapoint_models
    DROP COLUMN IF EXISTS supports_reasoning,
    DROP COLUMN IF EXISTS output_limit,
    DROP COLUMN IF EXISTS temperature,
    DROP COLUMN IF EXISTS open_weights,
    DROP COLUMN IF EXISTS family,
    DROP COLUMN IF EXISTS knowledge_cutoff,
    DROP COLUMN IF EXISTS release_date,
    DROP COLUMN IF EXISTS last_updated;

COMMIT;
