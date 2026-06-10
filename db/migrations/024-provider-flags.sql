-- Sync runtime flags from provider-config.json into datapoint_providers columns.
-- These were previously only available in the JSON config file; moving them to DB
-- makes them queryable by scripts, visible in the API, and inspectable in the UI.

ALTER TABLE datapoint_providers
  ADD COLUMN supports_streaming BOOLEAN DEFAULT true;

ALTER TABLE datapoint_providers
  ADD COLUMN is_openai_compat BOOLEAN DEFAULT true;

ALTER TABLE datapoint_providers
  ADD COLUMN requires_account_id BOOLEAN DEFAULT false;

-- ── Providers NOT OpenAI-compatible ──
-- These require custom client code, not the standard /v1/chat/completions interface.
UPDATE datapoint_providers SET is_openai_compat = false WHERE slug IN (
  'opencode',   -- nonOpenAICompat flag in provider-config.json
  'cloudflare'  -- nonOpenAICompat + requiresAccountId in provider-config.json
);

-- ── Providers requiring an account/organization ID ──
UPDATE datapoint_providers SET requires_account_id = true WHERE slug IN (
  'cloudflare'  -- requiresAccountId flag: true
);

-- ── Providers without streaming support ──
-- Most providers support streaming; only explicitly mark exceptions.
-- (Currently all synced providers support streaming; this column exists
-- to catch future changes and community-imported providers.)
