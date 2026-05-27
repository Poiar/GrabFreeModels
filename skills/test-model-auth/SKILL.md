---
name: test-model-auth
description: Use for testing model providers via direct API calls (OpenRouter, Cerebras, NVIDIA, HuggingFace, LLM Gateway). Reads auth keys from auth.json. Also use when adding, rotating, or managing provider API keys.
---

# Model Provider Keys

API keys for all model providers are stored in a single auth file.

## Auth File Location

`C:\Users\pc\.local\share\opencode\auth.json`

## Auth File Format

```json
{
  "openrouter": {
    "type": "api",
    "key": "sk-or-v1-..."
  },
  "llmgateway": {
    "type": "api",
    "key": "llmgtwy_..."
  },
  "cerebras": {
    "type": "api",
    "key": "csk-..."
  },
  "nvidia": {
    "type": "api",
    "key": "nvapi-..."
  },
  "huggingface": {
    "type": "api",
    "key": "hf_..."
  },
  "deepseek": {
    "type": "api",
    "key": "sk-..."
  }
}
```

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

## Testing a Model via Direct API Call

When opencode CLI is unavailable or you need to bypass it, use a direct REST call:

```powershell
$auth = Get-Content 'C:\Users\pc\.local\share\opencode\auth.json' | ConvertFrom-Json
$headers = @{
    'Content-Type' = 'application/json'
    'Authorization' = 'Bearer ' + $auth.openrouter.key
    'HTTP-Referer' = 'https://opencode.ai'
    'X-Title' = 'opencode'
}
$body = @{
    model = 'provider/model-id'
    messages = @(@{ role = 'user'; content = 'test' })
    max_tokens = 50
} | ConvertTo-Json
$response = Invoke-RestMethod -Uri 'https://openrouter.ai/api/v1/chat/completions' -Method POST -Headers $headers -Body $body
$response.choices[0].message.content
```

## Updating Keys

To add or rotate a key, read the file, update the relevant provider's `key` value, and write it back. The file uses a flat structure — do not nest providers under a parent key.

## Available Models Reference

For a full list of available models, their status (working/broken/rate-limited), and role-based rankings, see:

`available-models.json`

The `_test_summary` section contains the latest test results. The `_role_rankings` section contains ranked model recommendations for each role (model, small_model, build, general, explore), excluding rate-limited and broken models. The `_known_issues` section tracks non-fatal issues (schema problems, deprecation warnings) with severity and workarounds.
