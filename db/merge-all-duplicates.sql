-- merge-all-duplicates.sql
-- Comprehensive duplicate super merge.
-- Strategy: normalize all slugs, group by normalized slug, keep the super
-- with the most datapoints (or lowest ID as tiebreaker), merge the rest.
-- Then reassign all datapoints and delete duplicates.

BEGIN;

-- Step 1: Normalize all super slugs
UPDATE super_models SET slug = normalize_model_slug(name);

-- Step 2: Find groups with the same normalized slug
-- For each group, keep the super with most datapoints (lowest ID wins ties)
WITH ranked AS (
  SELECT
    mm.id,
    mm.slug,
    COUNT(dm.id) AS dp_count,
    ROW_NUMBER() OVER (
      PARTITION BY mm.slug
      ORDER BY COUNT(dm.id) DESC, mm.id ASC
    ) AS rn
  FROM super_models mm
  LEFT JOIN datapoint_models dm ON dm.super_model_id = mm.id
  GROUP BY mm.id, mm.slug
),
-- Map each duplicate to its canonical super
dupes AS (
  SELECT d.id AS dupe_id, k.id AS keep_id
  FROM ranked d
  JOIN ranked k ON k.slug = d.slug AND k.rn = 1
  WHERE d.rn > 1
)
-- Step 3: Reassign datapoints from duplicates to canonical super
-- Skip if same provider+remote_id already exists under canonical
UPDATE datapoint_models dm
SET super_model_id = dupes.keep_id,
    updated_at = now()
FROM dupes
WHERE dm.super_model_id = dupes.dupe_id
  AND NOT EXISTS (
    SELECT 1 FROM datapoint_models existing
    WHERE existing.datapoint_provider_id = dm.datapoint_provider_id
      AND existing.remote_id = dm.remote_id
      AND existing.super_model_id = dupes.keep_id
  );

-- Step 4: Delete any datapoint_models still pointing to a duplicate super
-- (these are conflicts — same provider+remote_id already under canonical)
WITH ranked AS (
  SELECT mm.id, mm.slug,
    ROW_NUMBER() OVER (PARTITION BY mm.slug ORDER BY COUNT(dm.id) DESC, mm.id ASC) AS rn
  FROM super_models mm
  LEFT JOIN datapoint_models dm ON dm.super_model_id = mm.id
  GROUP BY mm.id, mm.slug
)
DELETE FROM datapoint_models dm
WHERE super_model_id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 5: Delete duplicate supers
WITH ranked AS (
  SELECT mm.id, mm.slug,
    ROW_NUMBER() OVER (PARTITION BY mm.slug ORDER BY COUNT(dm.id) DESC, mm.id ASC) AS rn
  FROM super_models mm
  LEFT JOIN datapoint_models dm ON dm.super_model_id = mm.id
  GROUP BY mm.id, mm.slug
)
DELETE FROM super_models WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 6: Validate
DO $$
DECLARE
    dup_count INT;
    orphan_count INT;
BEGIN
    -- Check for remaining slug duplicates
    SELECT COUNT(*) INTO dup_count FROM (
      SELECT slug FROM super_models GROUP BY slug HAVING COUNT(*) > 1
    ) d;
    RAISE NOTICE 'Remaining slug duplicates: %', dup_count;

    -- Check for orphaned datapoints
    SELECT COUNT(*) INTO orphan_count
    FROM datapoint_models dm
    WHERE NOT EXISTS (SELECT 1 FROM super_models mm WHERE mm.id = dm.super_model_id);
    RAISE NOTICE 'Orphaned datapoints: %', orphan_count;

    -- Summary
    RAISE NOTICE 'Total super_models: %', (SELECT COUNT(*) FROM super_models);
    RAISE NOTICE 'Total datapoints: %', (SELECT COUNT(*) FROM datapoint_models);
END $$;

COMMIT;
