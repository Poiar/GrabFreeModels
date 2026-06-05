---
name: validate-free-models
description: Use when testing or updating free model statuses. Triggers: "validate models", "re-test models", "check if model works", "test model status".
---

# Validate Free Models

**Critical:** DB `full_id` uses `provider/model` prefix, but APIs expect different formats. Always resolve via `getApiModelId()` in the validation script.

## API Model ID Resolution

| Stored (`full_id`) | API | API model ID |
|---|---|---|
| `openrouter/provider/model:free` | openrouter.ai | `provider/model:free` |
| `openrouter/owl-alpha` | openrouter.ai | `owl-alpha` |
| `nvidia/meta/llama-4-maverick` | integrate.api.nvidia.com | `meta/llama-4-maverick` |
| `huggingface/moonshotai/Kimi-K2` | router.huggingface.co | `moonshotai/Kimi-K2` |
| `deepseek/deepseek-v4-flash` | deepseek.com | `deepseek-v4-flash` |
| `opencode/big-pickle` | opencode.ai/zen/v1 | `big-pickle` |

Strip provider prefix; keep `nvidia/` if the result starts with `nvidia/`. OpenRouter free models: `:free` suffix OR zero pricing.

## Run

```bash
node scripts/validate-free-models.js --apply          # all models
node scripts/validate-free-models.js --coding-only --apply
node scripts/validate-free-models.js --models "id1,id2" --apply
node scripts/validate-free-models.js --force --apply  # skip 7-day cache
```

## Key Rules

- **Pre-validate:** Fetch valid model IDs from provider APIs first. Test only confirmed models; others → `not_found`.
- **Parallel across endpoints, sequential within each** — avoids provider-wide 429s.
- **Rate-limited models:** Skip if tested within 24h. Mark provider-wide restrictions with `"skip_retest": true` in status.
- **404 = `not_found`** — don't keep re-testing.
- Interpretation reference: `docs/test-interpretation-reference.md`.
