-- Fix base_model FK to reference super_models.id instead of slug.
-- The existing FK (migration 008) references super_models.slug, which is
-- fragile — renaming a model breaks all derivative links.
--
-- Strategy:
--   1. Add base_model_id column (FK to id)
--   2. Backfill from base_model slug values
--   3. Keep base_model (VARCHAR) as deprecated — scripts still read it

-- Step 1: Add the new column
ALTER TABLE super_models
  ADD COLUMN base_model_id INTEGER REFERENCES super_models(id) ON DELETE SET NULL;

-- Step 2: Backfill from existing slug references
UPDATE super_models sm
SET base_model_id = parent.id
FROM super_models parent
WHERE sm.base_model IS NOT NULL
  AND sm.base_model = parent.slug;

-- Step 3: Add comment marking base_model as deprecated
COMMENT ON COLUMN super_models.base_model IS
  'DEPRECATED: use base_model_id instead. Kept for read compatibility during migration.';

COMMENT ON COLUMN super_models.base_model_id IS
  'FK to super_models(id) — the canonical parent model reference. Replaces base_model (slug FK).';
