-- Add is_health_trackable flag to datapoint_providers
-- HuggingFace free inference is excluded from health tracking because it's
-- a shared resource with unpredictable availability, not a dedicated API.
ALTER TABLE datapoint_providers ADD COLUMN IF NOT EXISTS is_health_trackable BOOLEAN DEFAULT true;

-- HuggingFace is a model hub, not a reliable inference endpoint
UPDATE datapoint_providers SET is_health_trackable = false WHERE slug = 'huggingface';
