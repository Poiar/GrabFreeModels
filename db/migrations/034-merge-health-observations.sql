-- Merge model_health_snapshots into test_observations.
-- These two tables track the same concept (model test results at a point in time)
-- but with inconsistent schemas. test_observations is the richer table, so
-- model_health_snapshots rows are migrated into it with a source tag.
--
-- ⚠ CRITICAL: Before running this migration, ensure all code that queries
-- model_health_snapshots has been updated to use test_observations instead.
-- See Phase 4 of the architecture overhaul.

-- Migrate existing health snapshots
INSERT INTO test_observations (
    datapoint_model_id,
    full_id,
    provider,
    model_name,
    status,
    latency_ms,
    error_type,
    tested_at
)
SELECT
    NULL AS datapoint_model_id,  -- health_snapshots only had free-text full_id
    hs.full_id,
    split_part(hs.full_id, '/', 1) AS provider,
    split_part(hs.full_id, '/', 2) AS model_name,
    CASE
        WHEN hs.status = 'working' THEN 'pass'
        WHEN hs.status = 'broken' THEN 'fail'
        WHEN hs.status = 'rate_limited' THEN 'fail'
        ELSE 'fail'
    END AS status,
    hs.latency_ms::NUMERIC(10,2),
    hs.detail AS error_type,
    hs.tested_at
FROM model_health_snapshots hs
WHERE NOT EXISTS (
    -- Don't duplicate rows that already exist
    SELECT 1 FROM test_observations tob
    WHERE tob.full_id = hs.full_id
      AND tob.tested_at = hs.tested_at
      AND tob.error_type = hs.detail
);

-- Drop the old table (cascades its indexes)
DROP TABLE IF EXISTS model_health_snapshots;

-- Add composite index for the most common query pattern
CREATE INDEX IF NOT EXISTS idx_test_obs_full_tested
  ON test_observations(full_id, tested_at DESC);

-- Note: the old indexes (idx_health_full_id, idx_health_tested_at) are already
-- covered by idx_test_obs_full_id and idx_test_obs_tested_at in the base schema.
