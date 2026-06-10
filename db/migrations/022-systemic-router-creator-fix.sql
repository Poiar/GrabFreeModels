-- Systemic replacement for migration 018.
-- Instead of hardcoding router creator names, uses the provider_type column
-- to identify routers and reset any super_model whose creator matches a router's name.
-- This automatically covers new routers added in the future.

-- Fix any existing bad attributions (should be 0 after migration 018, but defense in depth)
UPDATE super_models
SET creator = 'unknown'
WHERE creator IN (
    SELECT name FROM datapoint_providers WHERE provider_type = 'router'
);

-- Also catch humanized variants that might not match the exact provider name
-- (e.g., "LLMGateway" vs "LLM Gateway", "openrouter" vs "OpenRouter")
UPDATE super_models
SET creator = 'unknown'
WHERE lower(regexp_replace(creator, '[^a-zA-Z0-9]', '', 'g')) IN (
    SELECT lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))
    FROM datapoint_providers
    WHERE provider_type = 'router'
)
AND creator != 'unknown';
