---
name: schema-v2
description: Use when modifying the PostgreSQL schema, writing migrations, or understanding super-model + datapoint-provider data model. Triggers: "schema change", "DB migration", "new table", "datapoint model".
---

# Schema v2

**Concept:** One `super_models` row per abstract model identity, many `datapoint_models` rows for provider-specific instances. Joined via `datapoint_providers`.

## Tables

**`super_models`** — Canonical identity (`id` SERIAL PK, `name`, `slug` UNIQUE, `author`, `created_at`)
- Slug normalization: lowercase, strip `(free)`/`coding-`/`xiaomi-` prefixes, collapse hyphens

**`datapoint_providers`** — Data sources (`id` SERIAL PK, `slug` UNIQUE, `name`, `base_url`)
- 18 providers seeded: modelsdev, openrouter, nvidia, cerebras, huggingface, deepseek, google, opencode-zen, llm-gateway, github-models, vercel, groq, mistral, together, fireworks, cloudflare, anthropic, openai

**`datapoint_models`** — Per-provider instance (`super_model_id`, `datapoint_provider_id`, `model_instance_key`, `full_id` UNIQUE, `context_length`, `input/output_price_per_million`, `is_free`, `supports_tools`, `is_removed`, `model_status`, `status_result`, `status_tested`, `status_detail`, `last_success`)
- `full_id` = `providerSlug/modelInstanceKey` (composite key, e.g. `openrouter/owl-alpha`)
- `model_status` enum: `working`, `broken`, `rate_limited`, `untested`, `not_found`
- CASCADE: DELETE on super_model or provider removes datapoints

**`datapoint_model_features`** — EAV for flexible metadata (`feature_type` VARCHAR 32, `value` VARCHAR 256 per datapoint)
- Known types: `best_for`, `tag`, `supports_reasoning`, `output_limit`, `temperature`, `open_weights`, `family`, `knowledge_cutoff`, `release_date`, `last_updated`
- Unknown feature_types bucket into `tag`

**`datapoint_model_input_types` / `datapoint_model_output_types`** — Multimodal I/O types per datapoint

**`metadata`** — JSONB key-value store (`key` VARCHAR PK, `value` JSONB, `updated_at`)
- Stores: `_role_rankings`, `_test_summary`, `_known_issues`, `_provider_usage`, `_validation_method`, `_skip_removal_check`

## Data builder

`scripts/build-models-data.js` is the single source of truth for constructing the full `ModelsData` object. Used by both the API and every script. Joins all tables, applies author normalization (30+ overrides like "google llc" → "google"), computes `priority_score`, builds hierarchical `creators → models → providers` structure.

## Duplicate Merging

When same model gets multiple `super_models` rows:

1. Drop unique constraint first: `ALTER TABLE super_models DROP CONSTRAINT super_models_slug_key`
2. Normalize slugs, reassign datapoints to super with most datapoints (lowest ID wins ties)
3. Delete duplicates, re-add constraint

**Why drop constraint first:** Postgres checks uniqueness per-row during UPDATE, not at end of statement. Full script: `db/merge-super-duplicates.sql`.

## Files

- DDL: `db/schema.sql`
- Migration v1→v2: `scripts/migrate-v1-to-v2.js` (idempotent)
- Merge duplicates: `db/merge-super-duplicates.sql`
