---
name: validate-free-models
description: Use when testing or updating free model statuses. Trigger when adding models, re-testing rate-limited models, or answering availability questions.
---

# Validate Free Models

## Key Lessons

- Single call is insufficient: models may succeed first then 429 on subsequent requests
- Parallel load causes false 429s: run burst and delayed phases concurrently, NOT all at once
- Model ID format matters: OpenRouter API calls should NOT use the `openrouter/` prefix
- Top-level async IIFE must have `.catch()`: `(async () => { ... })().catch(e => { console.error(e.message); process.exit(1); })` — otherwise unhandled rejections fail silently

## Procedure

```bash
node scripts/validate-free-models.js --apply
```

Test interpretation patterns in `docs/test-interpretation-reference.md`.

Manual testing: read auth keys from `auth.json` (see `test-model-auth` skill), run 3 burst (300ms apart) + 3 delayed (5s apart) requests per model.