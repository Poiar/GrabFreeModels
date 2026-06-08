---
name: validate-free-models
description: Use when testing or updating free model statuses. Triggers: "validate models", "re-test models", "check if model works", "test model status".
---

# Validate Free Models

**Critical:** DB `full_id` uses `provider/remoteId` format, but APIs expect different formats. Always resolve via `getApiModelId()` — never send raw `full_id` to a provider API.

`full_id` = `providerSlug/remoteId`. Everything before the first `/` is the provider slug; the rest is the remote ID (which may contain additional slashes, e.g. `openrouter/meta-llama/llama-4`).

## API Model ID Resolution

| Provider    | Resolution                                                         |
| ----------- | ------------------------------------------------------------------ |
| OpenRouter  | Strip `openrouter/`, try bare ID, then try with `:free` suffix     |
| NVIDIA      | Strip `nvidia/`, but retry with `nvidia/` prefix if bare fails     |
| HuggingFace | Strip `huggingface/`, keep remainder (may contain `org/model`)     |
| Google      | Strip `google/` and `models/` prefix from API responses            |
| Others      | Strip `provider/`                                                  |

## Edge Cases

- **Nested slashes:** OpenRouter and HuggingFace have `org/model` in remote_id. Only the first `/` separates provider from remote.
- **`:free` suffix:** OpenRouter free models use `:free` in the API but NOT in `full_id`. Added at API call time.
- **Google prefix:** Google returns `models/gemini-2.5-flash` — strip `models/` before storing as remote_id.
- **OpenRouter special models:** `openrouter/owl-alpha` and `openrouter/openrouter/free` are exempt from removal detection (`metadata._skip_removal_check`).

## Common Mistakes

- Sending raw `full_id` to a provider API without resolving first → 404s
- Forgetting `:free` suffix on OpenRouter API calls
- Double-stripping (removing both provider AND org prefix)
- Wrong casing — slugs are lowercase hyphenated, no underscores

## Test Protocol

6 requests per model: 3 burst + 3 delayed.

| Phase   | Sleep         | Purpose |
| --------| ------------- | ------- |
| Burst   | 300ms         | Catches providers that throttle after first request |
| Delayed | 5s            | Catches providers with minute-level rate buckets |

**Execution:** `Promise.all` across endpoints, sequential within each — prevents provider-wide 429s.

**Status determination** (6 total requests):
- All 6 OK → `working`
- 0 OK, all 429 → `rate_limited`
- 0 OK, mixed errors → `broken`
- 4-5 OK → `working` (intermittent)
- 1-3 OK → `rate_limited` (sporadic)

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
