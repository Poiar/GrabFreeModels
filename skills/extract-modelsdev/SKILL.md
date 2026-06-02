---
name: extract-modelsdev
description: Fetch and import free model data from https://models.dev/. Triggers: "scrape models.dev", "fetch models.dev", "update modelsdev data", "extract models from models.dev".
---

# Extract Models from models.dev

## Source

[models.dev](https://models.dev/) is a community-maintained catalog of AI models across providers. The site renders model data client-side via `window.__TABLE_DATA__` — a raw HTTP fetch returns only a static shell, so **Playwright is required**.

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
| `structuredOutput` | — | boolean | Not in schema |
| `temperature` | `models.temperature` | boolean | Whether temperature param is supported |
| `openWeights` | `models.open_weights` | boolean | |
| `releaseDate` | `models.release_date` | date | YYYY-MM-DD |
| `lastUpdated` | `models.last_updated` | date | YYYY-MM-DD |
| `providerLogoSvg` | — | string | Skip — not relevant |

## Full Pipeline

### Step 1: Scrape

```bash
node scripts/extract-modelsdev.js
```

Writes `modelsdev-free-models.json` (free models only). Use `--all` to include paid models.

### Step 2: Sync into PostgreSQL

```bash
node scripts/sync-models.js --apply
```

Syncs new models into the DB from all providers (including models.dev data). Skips duplicates (matches on `full_id`). New models get `status_result = 'untested'`.

### Step 3: Export to JSON

```bash
node scripts/export-from-pg.js
```

Exports DB → `available-models.json` for git history. Source of truth is PostgreSQL.

### Step 4: Validate (optional)

New models from known providers can be tested immediately:

```bash
node scripts/validate-free-models.js --apply
```

Models from providers without API keys stay `untested` until credentials are added.

## Architecture

```
models.dev ──(Playwright)──▶ modelsdev-free-models.json
                                    │
                             sync-models.js (--apply)
                                    │
                                    ▼
                              PostgreSQL (source='curated'|'models.dev')
                                    │
                             export-from-pg.js
                                    │
                                    ▼
                      available-models.json (git history)
```

## Gotchas

- **Must use Playwright** — `webfetch` and raw HTTP only get the static HTML shell. The model data is injected via JavaScript.
- **`window.__TABLE_DATA__`** — the variable name could change if the site is updated. If extraction fails, inspect the page source for the new data injection method.
- **Free = `inputCost === 0 && outputCost === 0`** — some models list as free on the site but have non-zero costs at certain providers. The script filters by cost, not a `free` flag.
- **`(free)` suffix** — some `modelName` values include `(free)` at the end. Strip this when creating canonical model names.
- **No author field** — models.dev doesn't provide an author/creator field. Canonical models from models.dev are created with `author_id = NULL`. Can be backfilled later.
- **Model ID format** — `modelId` from models.dev may include a namespace prefix (e.g. `openai/gpt-4o-mini`). The `full_id` in our DB is `providerId/modelId` (e.g. `openrouter/openai/gpt-4o-mini`).
- **Canonical dedup** — the migration matches canonical models by lowercased name (authorless). Same model on multiple providers links to the same canonical `models` row.
