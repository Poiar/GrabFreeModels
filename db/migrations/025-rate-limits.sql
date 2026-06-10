-- Parse unstructured limitations JSONB into structured rate-limit columns
-- on datapoint_providers. Makes rate limits comparable and queryable.

ALTER TABLE datapoint_providers ADD COLUMN max_rpm INTEGER;
ALTER TABLE datapoint_providers ADD COLUMN max_tpm INTEGER;
ALTER TABLE datapoint_providers ADD COLUMN max_daily_requests INTEGER;
ALTER TABLE datapoint_providers ADD COLUMN requires_card BOOLEAN DEFAULT false;

-- Parse common rate_limit patterns from the provider-config PROVIDER_LIMITATIONS
-- Format: "30 RPM / 1,000 TPM" or "15 RPM / 1M TPM" or "5,000 requests/day"

-- Cerebras: 30 RPM / 1M TPM
UPDATE datapoint_providers SET max_rpm = 30, max_tpm = 1000000 WHERE slug = 'cerebras';

-- Google: 15 RPM / 1M TPM
UPDATE datapoint_providers SET max_rpm = 15, max_tpm = 1000000, max_daily_requests = 1500 WHERE slug = 'google';

-- Groq: 30 RPM / 7,000 TPM
UPDATE datapoint_providers SET max_rpm = 30, max_tpm = 7000 WHERE slug = 'groq';

-- NVIDIA: 5,000 requests/day
UPDATE datapoint_providers SET max_daily_requests = 5000 WHERE slug = 'nvidia';

-- OpenRouter: 20 RPM / 1,000 TPM (shared across all free models)
UPDATE datapoint_providers SET max_rpm = 20, max_tpm = 1000 WHERE slug = 'openrouter';
