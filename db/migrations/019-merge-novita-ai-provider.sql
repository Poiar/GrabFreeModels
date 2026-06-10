-- Merge novita-ai provider into novitaai (same API platform: Novita AI)
-- novita-ai was a duplicate datapoint_providers entry with no models.
-- All actual data lives under the novitaai slug.

-- Step 1: Reassign any datapoint_models that might still reference novita-ai
UPDATE datapoint_models
SET datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'novitaai')
WHERE datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'novita-ai');

-- Step 2: Remove the duplicate provider row
DELETE FROM datapoint_providers WHERE slug = 'novita-ai';
