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

## Reading Keys

```powershell
$auth = Get-Content 'C:\Users\pc\.local\share\opencode\auth.json' | ConvertFrom-Json
$key = $auth.openrouter.key
```

See `docs/provider-details.md` for endpoints.
