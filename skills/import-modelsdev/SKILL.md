---
name: import-modelsdev
description: Use when scraping, importing, or backfilling free models from models.dev. Triggers: "scrape models.dev", "fetch models.dev", "import modelsdev", "sync models.dev", "modelsdev import", "backfill modelsdev", "new model on models.dev".
---

# Import Models from models.dev

models.dev is the canonical source for which models exist. Every `super_models` row should have a `datapoint_models` entry from the `modelsdev` provider.

## Source

[models.dev](https://models.dev/) renders model data client-side via `window.__TABLE_DATA__` — raw HTTP returns only a static shell, so **Playwright is required**.

## Data Fields Mapping

| models.dev field | DB / JSON field | Type | Notes |
|---|---|---|---|
| `providerId` | `providers.slug` | string | e.g. `openrouter`, `nvidia` |
| `providerName` | `providers.name` | string | e.g. `OpenRouter`, `NVIDIA` |
| `modelId` | `provider_models.remote_id` | string | e.g. `openai/gpt-4o-mini` |
| `modelName` | `models.name` | string | Strip `(free)` suffix if present |
| `family` | `models.family` | string | Model family |
| `toolCall` | `models.supports_tools` | boolean | |
| `reasoning` | `models.supports_reasoning` | boolean | |
| `input` | `model_input_types` | string[] | e.g. `["text", "image"]` |
| `output` | `model_output_types` | string[] | e.g. `["text"]` |
| `inputCost` | `models.input_price_per_million` | number | 0 for free |
| `outputCost` | `models.output_price_per_million` | number | 0 for free |
| `contextLimit` | `models.context_length` | number | |
| `outputLimit` | `models.output_limit` | number | |
| `releaseDate` | `models.release_date` | date | YYYY-MM-DD |
| `lastUpdated` | `models.last_updated` | date | YYYY-MM-DD |
| `temperature` | `models.temperature` | boolean | Supports temperature param |
| `openWeights` | `models.open_weights` | boolean | |
| `structuredOutput` | — | boolean | Not in schema |
| `providerLogoSvg` | — | string | Skip — not relevant |

## Pipeline

### Step 1: Scrape

```bash
node scripts/extract-modelsdev.js          # free models only
node scripts/extract-modelsdev.js --all    # include paid
```

Requires Playwright (`npx playwright install chromium`). Outputs `modelsdev-free-models.json` (gitignored).

### Step 2: Import (first pass)

```bash
node scripts/import-modelsdev.js          # dry-run
node scripts/import-modelsdev.js --apply  # write to DB
```

For each model: normalize name, find/create matching `super_models` row, create `datapoint_models` row with `provider='modelsdev'`, copy features.

### Step 3: Backfill (second pass)

```bash
node scripts/import-modelsdev-backfill.js          # dry-run
node scripts/import-modelsdev-backfill.js --apply  # write to DB
```

For models not matched in Step 2: normalize `remote_id`, try matching against models.dev `modelId` and `super_models.name`. Unmatched models get synthetic `modelsdev/{slug}-master` datapoint.

### Step 4: Verify

All `super_models` should have a `modelsdev` datapoint.

### Step 5: Export + Validate

```bash
node scripts/export-from-pg.js                              # DB snapshot
node scripts/validate-free-models.js --apply                # test new models
node scripts/validate-free-models.js --coding-only --apply  # coding models only
```

## Architecture

```
models.dev ──(Playwright)──▶ modelsdev-free-models.json
                                    │
                             import-modelsdev.js (--apply)
                             import-modelsdev-backfill.js (--apply)
                                    │
                                    ▼
                              PostgreSQL (source='curated'|'models.dev')
                                    │
                             export-from-pg.js
                                    │
                                    ▼
                      available-models.json (git history)
```

## Matching Strategy

```
Provider remote_id: anthropic/claude-haiku-4.5
  ↓ strip prefix → claude-haiku-4.5
  ↓ dots→hyphens → claude-haiku-4-5
  ↓ matches models.dev modelId: claude-haiku-4-5 ✓
```

## Gotchas

- **Must use Playwright** — `webfetch`/raw HTTP only get the static shell.
- **`window.__TABLE_DATA__`** — variable name could change. If extraction fails, inspect page source.
- **Free = `inputCost === 0 && outputCost === 0`** — some models listed as free have non-zero cost at certain providers. Script filters by cost, not a `free` flag.
- **`(free)` suffix** — some `modelName` values include `(free)`. Strip when creating canonical names.
- **Dots vs hyphens** — #1 matching failure cause. `claude-haiku-4.5` (provider) vs `claude-haiku-4-5` (models.dev).
- **Synthetic entries** use `{slug}-master` as remote_id to avoid unique constraint collisions.
- **No author field** — `author_id = NULL` for models.dev imports.
- **Model ID format** — models.dev `modelId` may include namespace (e.g. `openai/gpt-4o-mini`). DB `full_id` = `providerId/modelId`.
- **run extract + import together** — don't import stale JSON data.
- **modelsdev-free-models.json is gitignored** — re-scrape when needed.
