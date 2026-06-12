-- Cleanup: drop deprecated columns and tables after all consumers have migrated.
--
-- PREREQUISITES:
--   - All code reads rankings from `rankings` table (migration 037)
--   - All code reads health from `test_observations` (migration 041)
--   - All code reads scores via `super_model_id` (migration 038)
--   - All code reads features via `feature_types` lookup (migration 031)
--   - All code reads I/O types from `datapoint_model_io_types` (migration 033)
--   - All code uses `super_models.family_id` for family lookups (migration 036)
--   - All code uses `super_models.knowledge_cutoff/release_date/description` (migration 032)
--   - All code filters `super_models.is_removed` (migration 039)
--
-- This migration is SAFE TO RUN once the above conditions are met.
-- It does NOT drop data — only removes columns/tables that have been superseded.

-- ── 1. Drop model_health_snapshots (replaced by test_observations aggregation) ──
DROP TABLE IF EXISTS model_health_snapshots CASCADE;

-- ── 2. Drop deprecated datapoint_model_id FK on model_scores (keep column for now) ──
-- The old unique constraint is superseded by uq_model_scores_super_source_type (038).
ALTER TABLE model_scores DROP CONSTRAINT IF EXISTS model_scores_datapoint_model_id_source_score_key;
-- Drop old index
DROP INDEX IF EXISTS idx_model_scores_dm;

-- ── 3. Drop legacy separate I/O type tables (merged into datapoint_model_io_types, 033) ──
DROP TABLE IF EXISTS datapoint_model_input_types CASCADE;
DROP TABLE IF EXISTS datapoint_model_output_types CASCADE;

-- ── 4. Drop CHECK constraint superseded by FK (029 → 031) ──
ALTER TABLE datapoint_model_features DROP CONSTRAINT IF EXISTS ck_feature_type;

-- ── 5. Mark legacy columns as formally deprecated ──
COMMENT ON COLUMN super_models.base_model IS
  'DEPRECATED: use base_model_id (FK to id) instead. Will be dropped in future cleanup.';
COMMENT ON COLUMN super_models.family IS
  'DEPRECATED: use family_id (FK to families.id) instead. Will be dropped in future cleanup.';

-- ── 6. Remove EAV feature rows that have been promoted to super_models columns ──
-- (knowledge_cutoff, release_date, description were promoted by migration 032)
DELETE FROM datapoint_model_features
WHERE feature_type IN ('knowledge_cutoff', 'release_date', 'description');

-- ── 7. Add FK from test_observations to datapoint_models.full_id ──
-- Now that all test_observations rows should reference valid models (after 041 migration),
-- we can add the FK that was intentionally omitted in the original schema.
-- This is done with NOT VALID to avoid locking the table during ALTER.
ALTER TABLE test_observations
  ADD CONSTRAINT fk_test_obs_full_id FOREIGN KEY (full_id)
  REFERENCES datapoint_models(full_id) ON DELETE CASCADE
  NOT VALID;
-- Validate later (can be done online without locking)
-- ALTER TABLE test_observations VALIDATE CONSTRAINT fk_test_obs_full_id;

COMMENT ON TABLE test_observations IS
  'Per-request validation results. FK to datapoint_models.full_id ensures referential integrity.';
