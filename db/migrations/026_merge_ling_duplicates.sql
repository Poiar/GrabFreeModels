-- Merge duplicate Ling super_models (same underlying Inclusion AI models)
-- Ling-2.6-flash: 966 (4 dps) + 2403 (2 dps) → keep 966
-- Ling-2.6-1T:   1189 (2 dps, creator="unknown") + 2404 (2 dps, correct creator) → keep 2404

BEGIN;

-- Merge 2403 → 966 (Ling-2.6-flash)
UPDATE datapoint_models SET super_model_id = 966 WHERE super_model_id = 2403;
DELETE FROM super_models WHERE id = 2403;
UPDATE super_models SET name = 'Ling 2.6 Flash' WHERE id = 966;

-- Fix creator on 1189 before merging it away
UPDATE super_models SET creator = 'Inclusion AI' WHERE id = 1189;

-- Merge 1189 → 2404 (Ling-2.6-1T; 2404 already has correct creator/slug)
UPDATE datapoint_models SET super_model_id = 2404 WHERE super_model_id = 1189;
DELETE FROM super_models WHERE id = 1189;
UPDATE super_models SET name = 'Ling 2.6 1T' WHERE id = 2404;

COMMIT;
