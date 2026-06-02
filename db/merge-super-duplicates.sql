-- merge-super-duplicates.sql
-- Comprehensive duplicate merge for super_models.
-- Normalizes all slugs, groups by normalized slug, keeps the super with
-- the most datapoints (lowest ID wins ties), merges the rest.

BEGIN;

-- Step 1: Normalize all super model slugs
UPDATE super_models SET slug = normalize_model_slug(name);

-- Step 2: Create a mapping table of duplicate → canonical
CREATE TEMP TABLE dupe_map AS
WITH ranked AS (
  SELECT
    sm.id,
    sm.slug,
    COUNT(dm.id) AS dp_count,
    ROW_NUMBER() OVER (
      PARTITION BY sm.slug
      ORDER BY COUNT(dm.id) DESC, sm.id ASC
    ) AS rn
  FROM super_models sm
  LEFT JOIN datapoint_models dm ON dm.super_model_id = sm.id
  GROUP BY sm.id, sm.slug
)
SELECT d.id AS dupe_id, k.id AS keep_id
FROM ranked d
JOIN ranked k ON k.slug = d.slug AND k.rn = 1
WHERE d.rn > 1;

-- Step 3: Show what will be merged
SELECT
  dupe.slug,
  dupe.name AS dupe_name,
  keep.name AS keep_name,
  (SELECT COUNT(*) FROM datapoint_models WHERE super_model_id = dupe_map.dupe_id) AS dps_to_move
FROM dupe_map
JOIN super_models dupe ON dupe.id = dupe_map.dupe_id
JOIN super_models keep ON keep.id = dupe_map.keep_id
ORDER BY dupe.slug;

-- Step 4: Reassign datapoints (skip conflicts where same provider+remote_id under canonical)
UPDATE datapoint_models dm
SET super_model_id = dm_map.keep_id,
    updated_at = now()
FROM dupe_map dm_map
WHERE dm.super_model_id = dm_map.dupe_id
  AND NOT EXISTS (
    SELECT 1 FROM datapoint_models existing
    WHERE existing.datapoint_provider_id = dm.datapoint_provider_id
      AND existing.remote_id = dm.remote_id
      AND existing.super_model_id = dm_map.keep_id
  );

-- Step 5: Delete orphaned datapoint_models (conflicts — same provider+remote_id under canonical)
DELETE FROM datapoint_models
WHERE super_model_id IN (SELECT dupe_id FROM dupe_map);

-- Step 6: Delete duplicate super_models
DELETE FROM super_models WHERE id IN (SELECT dupe_id FROM dupe_map);

-- Step 7: Clean up
DROP TABLE dupe_map;

-- Step 8: Validate
DO $$
DECLARE
    v_dupes INT;
    v_orphans INT;
    v_supers INT;
    v_datapoints INT;
BEGIN
    SELECT COUNT(*) INTO v_dupes FROM (
      SELECT slug FROM super_models GROUP BY slug HAVING COUNT(*) > 1
    ) d;

    SELECT COUNT(*) INTO v_orphans
    FROM datapoint_models dm
    WHERE NOT EXISTS (SELECT 1 FROM super_models sm WHERE sm.id = dm.super_model_id);

    SELECT COUNT(*) INTO v_supers FROM super_models;
    SELECT COUNT(*) INTO v_datapoints FROM datapoint_models;

    RAISE NOTICE 'Remaining slug duplicates: %', v_dupes;
    RAISE NOTICE 'Orphaned datapoints: %', v_orphans;
    RAISE NOTICE 'Super models: %', v_supers;
    RAISE NOTICE 'Datapoints: %', v_datapoints;
END $$;

COMMIT;
