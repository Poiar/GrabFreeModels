---
name: validate-free-models
description: Use when testing or updating free model statuses. Trigger when adding models, re-testing rate-limited models, or answering availability questions.
---

# Validate Free Models

## Model Naming Conventions (CRITICAL)

Model IDs in `available-models.json` use a provider prefix, but **APIs expect different formats**. Always resolve via `getApiModelId()` and pre-validate against provider APIs.

| Stored ID format | API | API model ID |
|---|---|---|
| `openrouter/provider/model:free` | `openrouter.ai` | `provider/model:free` (strip `openrouter/`) |
| `openrouter/owl-alpha` | `openrouter.ai` | `owl-alpha` (strip `openrouter/`, no `:free` needed — zero-priced) |
| `zai-glm-4.7` (bare, has `/`) | `openrouter.ai` | `zai-glm-4.7` (use as-is) |
| `nvidia/meta/llama-4-maverick` | `integrate.api.nvidia.com` | `meta/llama-4-maverick` (strip `nvidia/`) |
| `nvidia/nemotron-...` (NVIDIA-native) | `integrate.api.nvidia.com` | `nvidia/nemotron-...` (keep `nvidia/` — strip first prefix, result still starts with `nvidia/`) |
| `cerebras/llama3.1-8b` | `cerebras.ai` | `llama3.1-8b` (strip `cerebras/`) |
| `huggingface/moonshotai/Kimi-K2` | `router.huggingface.co` | `moonshotai/Kimi-K2` (strip `huggingface/`) |
| `llmgateway/glm-4.7-flash` | `llmgateway.io` | `glm-4.7-flash` (strip `llmgateway/`) |
| `deepseek/deepseek-v4-flash` | `deepseek.com` | `deepseek-v4-flash` (strip `deepseek/`) |
| `opencode/deepseek-v4-flash-free` | `opencode.ai/zen/v1` | `deepseek-v4-flash-free` (strip `opencode/`) |
| `opencode/big-pickle` | `opencode.ai/zen/v1` | `big-pickle` (strip `opencode/`) |
| `opencode/nemotron-3-super-free` | `opencode.ai/zen/v1` | `nemotron-3-super-free` (strip `opencode/`) |

### OpenRouter Free Model Detection
Free models either have `:free` suffix OR zero pricing (`prompt=0, completion=0`). Filter must check both. `openrouter/owl-alpha` is the key example — free but no `:free` suffix.

## Validation Procedure

**Pre-validation (always):** Fetch valid model IDs from provider APIs at startup. Only test models confirmed to exist. Models not found in API → mark `not_found` immediately, don't waste test cycles.

**Test parallelization:** Endpoints run in parallel (different API keys), but models within each endpoint run **sequently** to avoid provider-wide rate limits.

```bash
# Coding/agentic models only
node scripts/validate-free-models.js --coding-only --apply

# All models
node scripts/validate-free-models.js --apply

# Specific models
node scripts/validate-free-models.js --models "openrouter/owl-alpha,deepseek/deepseek-v4-flash" --apply

# Force re-test everything (ignore 7-day cache)
node scripts/validate-free-models.js --force --apply
```

### Flags

| Flag | Purpose |
|------|---------|
| `--apply` | Write results to `available-models.json` (default: report only) |
| `--force` | Re-test all models, skipping the 7-day working model cache |
| `--models id1,id2` | Test specific model IDs only |
| `--coding-only` | Only test models with cod/programm/agentic/reasoning/tool use/fast/lightweight keywords |
| `--coding-only` | Only test models with cod/programm/agentic/reasoning/tool use/fast/lightweight keywords. Excludes models whose `best_for` only has general tags like "Reasoning" or "Thinking" |

### Rate-Limited Retest Throttling

Rate-limited models are always candidates for re-test, but models tested within the last 24 hours are skipped to avoid wasting API calls on freshly rate-limited endpoints. Use `--force` to override.

### Permanently Rate-Limited Models (`skip_retest`)

If a model is rate-limited due to a provider-wide restriction (e.g. HuggingFace Router's very low free-tier limits), add `"skip_retest": true` to its `status` object. This prevents the validation script from wasting API calls on models that won't recover between retests. Still overridable with `--force`.

Pattern:
```json
"status": {
  "result": "rate_limited",
  "detail": "...",
  "skip_retest": true
}
```

## Test Interpretation

- **6/6 OK** → `working`
- **4-5/6 OK** → `working` (intermittent 429s, still reliable sequentially)
- **1-3/6 OK** → `rate_limited`
- **0/6 OK, all 429** → `rate_limited`
- **0/6 OK, all 4xx/ERR** → `broken`
- **Pre-validation: not in provider API** → `not_found`

## Key Lessons

- **Pre-validation is essential** — never test a model whose name doesn't exist in the provider API. Wrong names cause false 404s that look like model failures.
- **Sequential within endpoint, parallel across endpoints** — avoids provider-wide 429s while still being fast (7 endpoints in parallel).
- **`opencode/` models** use `https://opencode.ai/zen/v1` with `@ai-sdk/openai-compatible`. Testable via raw HTTPS — no longer need to skip.
- **Burst + delayed phases run in parallel per model** (`Promise.all`) — each phase's 3 requests are sequential within the phase.
- 404 during test = model genuinely gone from provider. Mark `not_found`, don't keep re-testing.
