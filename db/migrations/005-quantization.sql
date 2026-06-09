-- Add quantization column to datapoint_models
-- Tracks weight precision/format: fp32, fp16, bf16, fp8, fp4, int8, int4, gguf, gptq, awq, bnb
ALTER TABLE datapoint_models ADD COLUMN IF NOT EXISTS quantization VARCHAR(32);
