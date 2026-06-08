---
name: schema-v2
description: Use when modifying the PostgreSQL schema, writing migrations, or understanding super-model + datapoint-provider data model. Triggers: "schema change", "DB migration", "new table", "datapoint model".
---

# Schema v2

**Concept:** One `super_models` row per abstract model, many `datapoint_models` rows for provider-specific instances.

## Tables

| Table                      | Purpose                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `super_models`             | Abstract identity (`id`, `name`, `slug`)                                                                 |
| `datapoint_providers`      | Sources (`slug`, `name`)                                                                                 |
| `datapoint_models`         | Per-provider instance (`super_model_id`, `datapoint_provider_id`, `model_instance_key`, `full_id`, status fields) |
| `datapoint_model_features` | Tags/best_for as key-value rows                                                                          |
| `test_results`             | Test history                                                                                             |
| `metadata`                 | JSONB key-value store (rankings, etc.)                                                                   |

## Key Decisions

- **`full_id`** = `providerSlug/modelInstanceKey` (e.g. `openrouter/owl-alpha`). Composite key.
- **`is_removed`** on datapoint — provider no longer lists this model.
- Status fields are per-datapoint, not per-super.
- `super_models` slug normalization: lowercase, strip `(free)`/`coding-`/`xiaomi-` prefixes, collapse hyphens.

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
