---
name: import-modelsdev
description: Use when importing free models from models.dev into the database, or when a new free model appears on models.dev. Triggers: "import modelsdev", "sync models.dev", "new model on models.dev", "models.dev import", "backfill modelsdev".
---

# Import Models from models.dev

models.dev is the canonical source for which models exist. Every `super_models` row should have a `datapoint_models` entry from the `modelsdev` provider.

## Quick Reference

| Script | Purpose |
|--------|---------|
| `extract-modelsdev.js` | Scrape models.dev → `modelsdev-free-models.json` |
| `import-modelsdev.js` | Import into DB: upsert super_models + create modelsdev datapoints |
| `import-modelsdev-backfill.js` | Match remaining supers by fuzzy remote_id normalization |

## Workflow

### Step 1: Scrape

```bash
node scripts/extract-modelsdev.js
```

Requires Playwright (`npx playwright install chromium`). Outputs `modelsdev-free-models.json` (gitignored).

### Step 2: Import (first pass)

```bash
node scripts/import-modelsdev.js          # dry-run
node scripts/import-modelsdev.js --apply  # write to DB
```

For each model in models.dev data:
1. Normalize name (strip `(free)`, `(free tier)`, `coding-`, `xiaomi-` prefixes)
2. Find or create matching `super_models` row (by slug + normalized name)
3. Create `datapoint_models` row with `provider='modelsdev'`
4. Copy features (family, release_date, reasoning support, etc.)

### Step 3: Backfill (second pass)

```bash
node scripts/import-modelsdev-backfill.js          # dry-run
node scripts/import-modelsdev-backfill.js --apply  # write to DB
```

For models that didn't match in Step 2:
1. Normalize datapoint `remote_id` (strip provider prefix, dots→hyphens, strip `-free`/`:free`, strip common suffixes)
2. Try matching against models.dev `modelId` values
3. Try matching by `super_models.name` vs models.dev `modelName`
4. For remaining unmatched: create synthetic `modelsdev/{slug}-master` datapoint

### Step 4: Verify

```bash
node -e "require('dotenv').config(); const {Pool} = require('pg'); ..."  # or use load-models
```

Check: all `super_models` should have a `modelsdev` datapoint.

## Matching Strategy

```
Provider remote_id: anthropic/claude-haiku-4.5
  ↓ strip prefix → claude-haiku-4.5
  ↓ dots→hyphens → claude-haiku-4-5
  ↓ matches models.dev modelId: claude-haiku-4-5 ✓
```

## Gotchas

- **modelsdev-free-models.json is gitignored** — generated artifact, re-scrape when needed
- **Synthetic entries** use `{slug}-master` as remote_id to avoid unique constraint collisions
- **Dots vs hyphens** is the #1 matching failure cause — `claude-haiku-4.5` (provider) vs `claude-haiku-4-5` (models.dev)
- **run extract + import together** — don't import stale JSON data
