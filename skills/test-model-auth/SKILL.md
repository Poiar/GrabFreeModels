---
name: test-model-auth
description: Use for testing model providers via direct API calls (OpenRouter, Cerebras, NVIDIA, HuggingFace, LLM Gateway). Reads auth keys from auth.json. Also use when adding, rotating, or managing provider API keys.
---

# Model Provider Keys

API keys for all model providers are stored in a single auth file.

## Auth File Location

`C:\\Users\\pc\\.local\\share\\opencode\\auth.json`

## Auth Storage

API keys exist in two locations — keep them in sync:

| File | Role |
|------|------|
| `C:\\Users\\pc\\.local\\share\\opencode\\auth.json` | Managed by Desktop app (source of truth) |
| `C:\\Users\\pc\\.config\\opencode\\opencode.jsonc` | Inline `apiKey` under each provider (required by CLI) |

The CLI reads keys from `opencode.jsonc`, not `auth.json`. When the Desktop app updates `auth.json`, you must also update the matching `apiKey` field in `opencode.jsonc` — the Desktop app does not sync them automatically.

## Reading Keys

```bash
node scripts/get-auth-key.js --provider openrouter
```

List all available providers (one name per line):

```bash
node scripts/get-auth-key.js --list
```

See `docs/provider-details.md` for endpoints.

> Use `node scripts/sync-auth-keys.js` to sync keys from `auth.json` into `opencode.jsonc`. Run with `--apply` to write; it validates JSONC after writing. Use `--check` to verify keys match without writing.
