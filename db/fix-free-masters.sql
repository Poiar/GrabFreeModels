-- fix-free-masters.sql
-- Merges "Free"-suffixed duplicate super_models into their canonical counterparts,
-- then normalizes all remaining slugs (spaces→hyphens, strip free suffixes).
--
-- Run: \i db/fix-free-masters.sql   (or paste into psql)
-- Review output, then COMMIT.

BEGIN;

-- Step 1: Update normalize_model_pg to handle bare "-free" / " free" suffixes
CREATE OR REPLACE FUNCTION normalize_model_slug(name TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    result := lower(name);
    -- Strip common prefixes
    result := regexp_replace(result, '^(coding[-_]|xiaomi[-_])', '');
    -- Remove (free), (free tier) suffixes
    result := regexp_replace(result, '\s*\(free\s*(tier)?\)\s*$', '');
    -- Remove trailing " free" or "-free" bare word
    result := regexp_replace(result, '([-\s])free\s*$', '');
    -- Replace spaces and special chars with hyphens
    result := regexp_replace(result, '[^a-z0-9]+', '-', 'g');
    -- Trim leading/trailing hyphens
    result := trim(both '-' from result);
    -- Collapse multiple hyphens
    result := regexp_replace(result, '-{2,}', '-', 'g');
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Merge ALL "free" masters whose normalized slug matches an existing master.
-- Full list (free_master_id → canonical_master_id):
--   Original 8:
--     1044→1130 (DeepSeek V4 Flash Free → DeepSeek V4 Flash)
--     1063→958  (GLM-4.7 Free → GLM-4.7)
--     851→905   (GLM-5 Free → GLM-5)
--     990→1105  (Hy3 preview Free → Hy3 preview)
--     1083→840  (Kimi K2.5 Free → Kimi K2.5)
--     1026→889  (MiniMax M2.5 Free → MiniMax M2.5)
--     1211→1176 (Nemotron 3 Super Free → Nemotron 3 Super)
--     892→1046  (Qwen3.6 Plus Free → Qwen3.6 Plus)
--   Additional 3 (found via slug collision check):
--     1133→868  (MiniMax M3 Free → MiniMax-M3)
--     1036→913  (MiMo V2 Pro Free → MiMo-V2-Pro)
--     1102→1145 (MiMo V2 Omni Free → MiMo-V2-Omni)

DO $$
DECLARE
    r RECORD;
    merged INT := 0;
    skipped INT := 0;
    merge_pairs INT[][] := ARRAY[
        ARRAY[1044, 1130], ARRAY[1063, 958], ARRAY[851, 905],
        ARRAY[990, 1105], ARRAY[1083, 840], ARRAY[1026, 889],
        ARRAY[1211, 1176], ARRAY[892, 1046], ARRAY[1133, 868],
        ARRAY[1036, 913], ARRAY[1102, 1145]
    ];
    free_id INT;
    target_id INT;
BEGIN
    FOR i IN 1..array_length(merge_pairs, 1) LOOP
        free_id := merge_pairs[i][1];
        target_id := merge_pairs[i][2];

        -- Reassign datapoints that won't conflict
        UPDATE datapoint_models dm
        SET super_model_id = target_id,
            updated_at = now()
        WHERE dm.super_model_id = free_id
          AND NOT EXISTS (
              SELECT 1 FROM datapoint_models existing
              WHERE existing.datapoint_provider_id = dm.datapoint_provider_id
                AND existing.remote_id = dm.remote_id
                AND existing.super_model_id = target_id
          );
        merged := merged + 1;

        -- Delete the free master (cascade-safe: datapoints already moved or will be skipped)
        DELETE FROM super_models WHERE id = free_id;
    END LOOP;

    RAISE NOTICE 'Processed % merge pairs', array_length(merge_pairs, 1);
END $$;

-- Step 3: Fix remaining "free" masters that have NO canonical counterpart
-- Strip " Free" from name, normalize slug
-- Affected: 1061 (Kilo Auto Free), 966 (Ling 2.6 Flash Free),
--           999 (MiMo V2 Flash Free), 1017 (MiMo V2.5 Free),
--           864 (MiniMax M2.1 Free), 1212 (Ring 2.6 1T Free)
UPDATE super_models
SET name = regexp_replace(name, '\s+Free$', ''),
    slug = normalize_model_slug(regexp_replace(name, '\s+Free$', ''))
WHERE name LIKE '% Free';

-- Step 4: Normalize ALL slugs that still have spaces or special chars
DO $$
DECLARE
    r RECORD;
    updated INT := 0;
BEGIN
    FOR r IN SELECT id, name, slug
             FROM super_models
             WHERE slug LIKE '% %'
                OR slug LIKE '%(%'
                OR slug LIKE '%)%'
                OR slug LIKE '%:%'
                OR slug LIKE '%+%'
    LOOP
        UPDATE super_models SET slug = normalize_model_slug(r.name) WHERE id = r.id;
        updated := updated + 1;
    END LOOP;
    RAISE NOTICE 'Normalized % slugs', updated;
END $$;

-- Step 5: Resolve any duplicate slugs created by normalization
DO $$
DECLARE
    r RECORD;
    dup_count INT := 0;
    i INT;
BEGIN
    FOR r IN
        SELECT slug, array_agg(id ORDER BY id) AS ids
        FROM super_models
        GROUP BY slug
        HAVING COUNT(*) > 1
    LOOP
        FOR i IN 2..array_length(r.ids, 1) LOOP
            UPDATE super_models
            SET slug = r.slug || '-' || (i - 1)
            WHERE id = r.ids[i];
            dup_count := dup_count + 1;
        END LOOP;
    END LOOP;
    RAISE NOTICE 'Resolved % duplicate slugs', dup_count;
END $$;

COMMIT;
