---
name: test-model-auth
description: Use for testing model providers via direct API calls (OpenRouter, Cerebras, NVIDIA, HuggingFace, LLM Gateway). Reads auth keys from auth.json. Also use when adding, rotating, or managing provider API keys.
---

# Model Provider Keys

API keys for all model providers are stored in a single auth file.

## Auth File Location

`C:\Users\pc\.local\share\opencode\auth.json`

## Auth Storage

API keys exist in two locations — keep them in sync:

| File | Role |
|------|------|
| `C:\Users\pc\.local\share\opencode\auth.json` | Managed by Desktop app (source of truth) |
| `C:\Users\pc\.config\opencode\opencode.jsonc` | Inline `apiKey` under each provider (required by CLI) |

The CLI reads keys from `opencode.jsonc`, not `auth.json`. When the Desktop app updates `auth.json`, you must also update `opencode.jsonc` manually.

## Providers

| Provider | Auth Header | Notes |
|----------|------------|-------|
| OpenRouter | `Authorization: Bearer <key>` | Also set `HTTP-Referer` and `X-Title` headers |
| LLM Gateway | `Authorization: Bearer <key>` | Base URL: `https://api.llmgateway.io/v1` |
| Cerebras | `Authorization: Bearer <key>` | Uses `@ai-sdk/cerebras` provider |
| NVIDIA | `Authorization: Bearer <key>` | Base URL: `https://integrate.api.nvidia.com/v1` |
| HuggingFace | `Authorization: Bearer <key>` | Base URL: `https://router.huggingface.co/v1` |
| DeepSeek | `Authorization: Bearer <key>` | Direct DeepSeek API. No DeepSeek models currently tracked or keys verified. |

## Reading Keys

To read a key for use in API calls:

```powershell
$auth = Get-Content 'C:\Users\pc\.local\share\opencode\auth.json' | ConvertFrom-Json
$key = $auth.openrouter.key
```
