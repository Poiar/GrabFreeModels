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
- Small free tier (2 models currently)
- **Deprecated 2026-05-27** — models still functional but may be removed
- Do not add `cerebras/` prefix to IDs

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

### OpenCode Zen
- Built-in models, no API discovery needed
- Currently: `opencode/deepseek-v4-flash-free`, `opencode/big-pickle`, `opencode/nemotron-3-super-free`

### Groq / Together / Fireworks
- No API keys currently available
- Can be added when keys exist

## Sync Procedure

### Step 1: Dry Run

```powershell
.\scripts\sync-models.ps1
```

Review the output:
- **New models** — not yet in `available-models.json`
- **Potentially removed** — in JSON but no longer returned by provider
- Validate counts look reasonable before applying

### Step 2: Apply

```powershell
.\scripts\sync-models.ps1 -Apply
```

This adds new models with `status: { result: "untested" }` and flags potentially removed models for re-check.

### Step 3: Validate JSON

```powershell
node -e "JSON.parse(require('fs').readFileSync('C:/OC/GrabFreeModels/available-models.json','utf8')); console.log('Valid JSON')"
```

### Step 4: Test New Models

Always test newly-added models before promoting to `working`:

```powershell
# Test specific new models
.\scripts\validate-free-models.ps1 -Models "openrouter/provider/model:free" -Apply
```

Or use the `validate-free-models` skill for the full burst+delayed procedure.

## Interpreting Results

| Scenario | Action |
|----------|--------|
| New models found | Add with `untested` status, then validate |
| Models no longer in provider API | Flag as `untested` for re-check; don't delete immediately |
| Provider API error | Skip that provider; don't let one failure block others |
| NVIDIA returns 100+ models | Verify filter is excluding non-LLM models; adjust regex if needed |

## Edge Cases

- **OpenRouter Gemma 4 26B/31B** — returned by OpenRouter API as free but always 429. Still tracked as `rate_limited`, not removed.
- **Cerebras deprecation** — deprecated models still function. Track in `_known_issues`, don't remove.
- **Duplicate models** — some models appear in both OpenRouter and NVIDIA. Prefer the OpenRouter entry unless testing shows it's unreliable.
