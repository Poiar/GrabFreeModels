---
name: backfill-context
description: Use for fetching context_length for models where it's null. Triggers: "backfill context", "fill missing context", "fetch context lengths", "update context_length".
---

# Backfill Context

Fetches `context_length` for free + working models where it's currently null.

## Lookup Strategy

1. **OpenRouter API** — queries `openrouter.ai/api/v1/models` (many NVIDIA models route through it)
2. **Local catalog** — falls back to `scripts/data/known-context.json` for values not in OpenRouter's catalog

## Filtering

Only targets models that are: `is_free`, not `_removed`, `status.result === "working"`, and `context_length` is null.

## Run

```bash
node scripts/backfill-context.js          # dry-run
node scripts/backfill-context.js --apply  # write changes
```

Rerun after `sync-models.js --apply` (newly added models often have null context_length).
