-- Add CHECK constraints to columns that currently have no enforcement.
-- Applied after migration 028 (tracking table).

-- derivation_method: explicitly listed in the schema comment
ALTER TABLE super_models
  ADD CONSTRAINT ck_derivation_method CHECK (
    derivation_method IS NULL OR
    derivation_method IN (
      'finetune', 'merge', 'distillation', 'dpo', 'continued_pretraining',
      'lora_adapter', 'quantization', 'foundation', 'unknown'
    )
  );

-- quantization: enumerated in the schema comment
ALTER TABLE datapoint_models
  ADD CONSTRAINT ck_quantization CHECK (
    quantization IS NULL OR
    quantization IN (
      'fp32', 'fp16', 'bf16', 'fp8', 'fp4',
      'int8', 'int4',
      'gguf', 'gptq', 'awq', 'bnb'
    )
  );

-- failure_category: values defined in migration 027
ALTER TABLE datapoint_models
  ADD CONSTRAINT ck_failure_category CHECK (
    failure_category IS NULL OR
    failure_category IN (
      'timeout', 'not_found', 'auth_error', 'rate_limited',
      'server_error', 'network_error', 'unknown'
    )
  );

-- feature_type: enumerate all known types from the codebase
-- (family and base_model are excluded — they were promoted to columns)
ALTER TABLE datapoint_model_features
  ADD CONSTRAINT ck_feature_type CHECK (
    feature_type IN (
      'best_for', 'tag',
      'supports_reasoning', 'supports_attachment', 'supports_structured_output',
      'open_weights',
      'output_limit', 'temperature',
      'description',
      'model_tier', 'model_variant',
      'param_count_b', 'active_param_count_b', 'expert_count',
      'thinking_variant', 'model_version', 'release_stage',
      'coding_specialized',
      'modality_vision', 'modality_video', 'modality_audio',
      'knowledge_cutoff', 'release_date', 'last_updated',
      'weights'
    )
  );

-- is_free must be consistent with pricing
ALTER TABLE datapoint_models
  ADD CONSTRAINT ck_is_free_pricing CHECK (
    is_free = true OR input_price_per_million > 0 OR output_price_per_million > 0
  );

-- status_result CHECK (ensure it's a valid enum value)
-- The model_status enum already enforces this at the type level,
-- but some older rows may have invalid values from before the enum existed.
-- This is a no-op if all values are valid; added for documentation.
-- (model_status enum values: 'working', 'broken', 'rate_limited', 'untested', 'not_found')
