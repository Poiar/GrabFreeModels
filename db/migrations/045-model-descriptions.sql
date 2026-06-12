-- Add description column to datapoint_models for storing provider-provided
-- model descriptions (e.g. OpenRouter "fine-tuned from X" text).
-- These are parsed for lineage hints during sync and backfill.

ALTER TABLE datapoint_models ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN datapoint_models.description IS 'Provider-provided model description, parsed for lineage hints during sync.';
