-- Add derivation_method column to super_models
-- Tracks how a model was derived from its base: finetune, merge, distillation, dpo, etc.
ALTER TABLE super_models ADD COLUMN IF NOT EXISTS derivation_method VARCHAR(32);
