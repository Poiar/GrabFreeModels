---
name: backfill-metadata
description: Use for backfilling supports_tools field and stabilizing role rankings. Triggers: "backfill metadata", "populate supports_tools", "fill missing fields", "tag models with tool support".
---

# Backfill Metadata

Backfills `supports_tools` on free models and populates the `stable` role ranking.

## supports_tools Logic

- `true` — model supports OpenAI-style tool calling (default for modern models)
- `false` — model is verified to NOT support tool calling
- Paid models are skipped

Known-false patterns: qwen3 base (not coder), llama3.*, codellama, deepseek-coder (old), mistral-7b, phi-4.

Everything else defaults to `true` — most modern LLMs support tool calling.

## Stable Role

Models that are `free`, `working`, and have a `status.tested` date ≥30 days ago.

## Run

```bash
node scripts/backfill-metadata.js         # dry-run
node scripts/backfill-metadata.js --apply # write changes
```

Rerun after `sync-models.js --apply` and after adding new providers.

## Related Scripts

| Script | Purpose |
|--------|---------|
| `backfill-metadata.js` | Backfill `supports_tools` + `stable` ranking |
| `get-auth-key.js` | Read a provider API key from auth.json |
| `sync-auth-keys.js` | Sync API keys from auth.json into opencode.jsonc |
| `kill-port.js` | Kill process on a given port |
