---
name: validate-free-models
description: Use when testing or updating free model statuses. Trigger when adding models, re-testing rate-limited models, or answering availability questions.
---

# Validate Free Models

## Key Lessons

- Single call is insufficient: models may succeed first then 429 on subsequent requests
- Parallel load causes false 429s: run burst phase (3 requests, 300ms apart) first, then delayed phase (3 requests, 5s apart) — never fire all 6 at once
- Model ID format matters: OpenRouter API calls should NOT use the `openrouter/` prefix
- Top-level async IIFE must have `.catch()`: `(async () => { ... })().catch(e => { console.error(e.message); process.exit(1); })` — otherwise unhandled rejections fail silently

## Procedure

Default: tests only `rate_limited` and `untested` models (not `working` — avoids unnecessary API calls).

```bash
node scripts/validate-free-models.js --apply
```

### Flags

| Flag | Purpose |
|------|---------|
| `--apply` | Write results to `available-models.json` (default: report only) |
| `--force` | Re-test all models, skipping the 7-day working model cache |
| `--models id1,id2` | Test specific model IDs only |
| `--coding-only` | Only test models tagged with coding/programming/reasoning/agent keywords |

Test interpretation patterns in `docs/test-interpretation-reference.md`.

Manual testing: read auth keys from `auth.json` (see `test-model-auth` skill), run 3 burst (300ms apart) + 3 delayed (5s apart) requests per model.