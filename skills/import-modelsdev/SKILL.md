---
name: import-modelsdev
description: Import models.dev scraped data into PostgreSQL. Triggers: "import modelsdev", "sync models.dev", "backfill modelsdev".
---

# Import Models from models.dev

Requires `modelsdev-free-models.json` from `extract-modelsdev` skill first.

## Pipeline

```bash
node scripts/import-modelsdev.js          # dry-run — match/create super_models + datapoints
node scripts/import-modelsdev.js --apply  # write to DB

node scripts/import-modelsdev-backfill.js          # dry-run — unmatched models
node scripts/import-modelsdev-backfill.js --apply  # write synthetic datapoints
```

Then validate:

```bash
node scripts/export-from-pg.js && node scripts/validate-free-models.js --apply
```

## Field Mapping

| models.dev                    | DB field                                   | Notes                     |
| ----------------------------- | ------------------------------------------ | ------------------------- |
| `providerId`                  | `datapoint_providers.slug`                 | e.g. `openrouter`         |
| `modelId`                     | `datapoint_models.model_instance_key`               | e.g. `openai/gpt-4o-mini` |
| `modelName`                   | `super_models.name`                        | Strip `(free)` suffix     |
| `toolCall`                    | `supports_tools`                           | boolean                   |
| `reasoning`                   | `supports_reasoning`                       | boolean                   |
| `inputCost` / `outputCost`    | `input_price_per_million`                  | 0 for free                |
| `contextLimit`                | `context_length`                           |                           |
| `input` / `output`            | `model_input_types` / `model_output_types` | string[]                  |
| `releaseDate` / `lastUpdated` | `release_date` / `last_updated`            | YYYY-MM-DD                |

## Gotchas

- **Playwright required** — raw HTTP only gets static HTML shell.
- **Free = `inputCost === 0 && outputCost === 0`** — not a `free` flag.
- **Dots vs hyphens** — `claude-haiku-4.5` (provider) vs `claude-haiku-4-5` (models.dev). #1 matching failure.
- **`full_id` = `providerId/modelId`** — namespace included (e.g. `openrouter/openai/gpt-4o-mini`).
- **Synthetic entries** use `{slug}-master` model_instance_key to avoid unique constraint collisions.
- **No author** — `author_id = NULL` for models.dev imports.
