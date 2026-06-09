-- Merge zai provider into zhipuai (same company: ZhipuAI = Z.AI = z.ai)
-- zai models came from models.dev imports; zhipuai models from direct API sync.

-- Step 1: Delete overlapping datapoints (keep zhipuai versions)
DELETE FROM datapoint_models
WHERE datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'zai')
AND model_instance_key IN (
  SELECT dm.model_instance_key FROM datapoint_models dm
  WHERE dm.datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'zhipuai')
);

-- Step 2: Reassign remaining zai-only datapoints to zhipuai
UPDATE datapoint_models
SET datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'zhipuai')
WHERE datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'zai');

-- Step 3: Remove duplicate zai provider row
DELETE FROM datapoint_providers WHERE slug = 'zai';

-- Step 4: Delete overlapping coding-plan datapoints (keep zhipuai-coding-plan versions)
DELETE FROM datapoint_models
WHERE datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'zai-coding-plan')
AND model_instance_key IN (
  SELECT dm.model_instance_key FROM datapoint_models dm
  WHERE dm.datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'zhipuai-coding-plan')
);

-- Step 5: Reassign remaining zai-coding-plan datapoints
UPDATE datapoint_models
SET datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'zhipuai-coding-plan')
WHERE datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'zai-coding-plan');

-- Step 6: Remove duplicate zai-coding-plan provider row
DELETE FROM datapoint_providers WHERE slug = 'zai-coding-plan';
