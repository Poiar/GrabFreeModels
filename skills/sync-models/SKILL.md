---
name: sync-models
description: Use when fetching latest free models from providers (OpenRouter, Cerebras, NVIDIA, HuggingFace, LLM Gateway) and syncing them into available-models.json. Trigger when adding new providers, running periodic syncs, or when the user asks about new free models available.
---

# Sync Models

Discovers free models from provider APIs and syncs them into `available-models.json`.

## When to Use

- Periodic check for newly-added free models
- After a provider announces new free tier models
- When the user asks "are there any new free models?"
- When onboarding a new provider

## Provider Notes

### OpenRouter
- Returns `:free` tagged models — filter by `$_.id -like "*:free"` or `$_.pricing -eq "0"`
- **Do NOT use `openrouter/` prefix in API IDs** — the returned IDs already include the provider prefix (e.g. `qwen/qwen3-coder:free`)
- Store in JSON as `openrouter/<id>`

### Cerebras
- Uses authenticated endpoint: `https://api.cerebras.ai/v1/models`
- Small free tier
- **Deprecated** — models still functional but may be removed.

### NVIDIA
- Free tier is huge (~117 models) but very noisy — most are embed, safety, reward, or VLMs
- **Filter to chat/LLM only**: exclude models matching `embed|reward|detector|translate|clip|neva|vila|kosmos|riva|gliner|ising|calibration|nemoguard|nemoretriever|content-safety|parse`
- Use `https://integrate.api.nvidia.com/v1/models`

### HuggingFace Router
- **No zero-cost pricing flag** in the API — free models must be tested manually
- Base URL: `https://router.huggingface.co/v1/models`
- Do not attempt to auto-discover free models; test manually

### LLM Gateway
- No public model listing API — add manually
- Base URL: `https://api.llmgateway.io/v1`

## Sync Procedure

### Step 1: Dry Run

```bash
node scripts/sync-models.js
```

Review the output:
- **New models** — not yet in `available-models.json`
- **Potentially removed** — in JSON but no longer returned by provider
- Validate counts look reasonable before applying

### Step 2: Apply

```bash
node scripts/sync-models.js --apply
```

This adds new models with `status: { result: "untested" }` and flags potentially removed models for re-check.

### Step 3: Test New Models

Always test newly-added models before promoting to `working`:

```bash
# Test specific new models
node scripts/validate-free-models.js --models "openrouter/provider/model:free" --apply
```

Or use the `validate-free-models` skill for the full burst+delayed procedure.

## Edge Cases

- **OpenRouter Gemma 4 26B/31B** — returned by OpenRouter API as free but always 429. Still tracked as `rate_limited`, not removed.
- **Cerebras deprecation** — deprecated models still function. Track in `_known_issues`, don't remove.
- **Duplicate models** — some models appear in both OpenRouter and NVIDIA. Prefer the OpenRouter entry unless testing shows it's unreliable.
