-- Fix: "Ring" is not a company — it's a model line from Inclusion AI
-- (huggingface.co/inclusionAI/Ring-2.6-1T).
-- Two super_models existed for the same model due to different import sources
-- normalizing the creator differently. Merge them under Inclusion AI.

BEGIN;

-- 1. Re-point datapoints from ring-2-6-1t (id=1212) → inclusionai-ring-2-6-1t (id=2402)
UPDATE datapoint_models SET super_model_id = 2402 WHERE super_model_id = 1212;

-- 2. Delete the orphaned duplicate first (frees the unique name constraint)
DELETE FROM super_models WHERE id = 1212;

-- 3. Rename surviving super_model to canonical form (spaces, not dashes)
UPDATE super_models SET name = 'Ring 2.6 1T' WHERE id = 2402;

COMMIT;
