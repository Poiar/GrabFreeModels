---
name: schema-v2
description: Use when modifying the PostgreSQL schema, writing migrations, or understanding super-model + datapoint-provider data model. Triggers: "schema change", "DB migration", "new table", "datapoint model".
---

# Schema v2

**Concept:** One `super_models` row per abstract model identity, many `datapoint_models` rows for provider-specific instances. Joined via `datapoint_providers`.

## Tables

**`super_models`** — Canonical identity (`id` SERIAL PK, `name`, `slug` UNIQUE, `creator`, `base_creator`, `family`, `base_model`, `derivation_method`, `knowledge_cutoff`, `release_date`, `description`, `is_removed`)

- Slug normalization: lowercase, strip `(free)`/`coding-`/`xiaomi-` prefixes, collapse hyphens

**`datapoint_providers`** — Data sources (`id` SERIAL PK, `slug` UNIQUE, `name`, `base_url`, `provider_type`, `hardware`, etc.)

**`datapoint_models`** — Per-provider instance (`super_model_id`, `datapoint_provider_id`, `model_instance_key`, `full_id` UNIQUE, `context_length`, `input_price_per_million`, `output_price_per_million`, `is_free`, `supports_tools`, `is_removed`, `status_result`, `status_tested`, `status_detail`, `last_success`, `failure_category`, `deprecated_at`)

- `full_id` = `providerSlug/modelInstanceKey` (composite key, e.g. `openrouter/meta-llama/llama-4`)
- `status_result` type `model_status` enum: `working`, `broken`, `rate_limited`, `untested`, `not_found`
- CASCADE: DELETE on super_model or provider removes datapoints

**`test_observations`** — Per-request test log (`datapoint_model_id`, `full_id`, `provider`, `model_name`, `status`, `latency_ms`, `error_type`, `tested_at`)

**`datapoint_model_features`** — EAV for flexible metadata per datapoint (`feature_type`, `value`, plus a `feature_types` lookup table)

**`datapoint_model_input_types` / `datapoint_model_output_types`** — Multimodal I/O types per datapoint

**`metadata`** — JSONB key-value store (`key` VARCHAR PK, `value` JSONB, `updated_at`)

- Stores: `_role_rankings`, `_role_rankings_paid`, `_test_summary`, `_test_summary_previous`, `_known_issues`, `_provider_usage`, `_validation_method`, `_company_financials`, `_company_financials_history`, `_key_health`, and more

## Data builder

`scripts/build-models-data.js` delegates to `scripts/builders/index.js` which orchestrates 10 builder modules. Joins all tables, computes `priority_score`, builds hierarchical `creators → models → providers` structure.

## Duplicate Merging

When same model gets multiple `super_models` rows:

1. Drop unique constraint first: `ALTER TABLE super_models DROP CONSTRAINT super_models_slug_key`
2. Normalize slugs, reassign datapoints to super with most datapoints (lowest ID wins ties)
3. Delete duplicates, re-add constraint

**Why drop constraint first:** Postgres checks uniqueness per-row during UPDATE, not at end of statement.

## Files

- DDL: `db/schema.sql`
- Migrations: `db/migrations/` (ordered, sequential)
- Merge duplicates: `scripts/deduplicate-super-models.js`, `scripts/merge-duplicate-supers.js`
