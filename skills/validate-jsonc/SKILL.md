---
name: validate-jsonc
description: Use BEFORE stopping/thinking to validate opencode.jsonc JSONC syntax is valid. Run once at end of editing session, not after every edit.
---

# Validate JSONC

Before stopping, run this validation once to ensure `C:\Users\pc\.config\opencode\opencode.jsonc` is still valid JSONC. Do NOT run after every individual edit — only once at the end of your editing session.

## Quick Validation

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('C:\\Users\\pc\\.config\\opencode\\opencode.jsonc','utf8');const s=t.replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/,\s*([}\]])/g,'\$1');JSON.parse(s);console.log('✅ Valid JSONC')" || echo "❌ Invalid JSONC"
```

## Validation Steps

1. Strip single-line comments (`// ...`)
2. Strip block comments (`/* ... */`)
3. Strip trailing commas before `}` and `]`
4. Parse with `JSON.parse()`
5. Report `✅ Valid JSONC` or `❌ Invalid JSONC`

## On Failure

If validation fails, immediately inspect `opencode.jsonc` and fix the syntax error. Common issues:

- Missing or extra commas
- Unquoted keys
- Trailing commas in arrays/objects
- Malformed escape sequences
- Unclosed brackets or braces

## Also Sync Keys to auth.json

`opencode.jsonc` is **not** the source of truth. After editing `opencode.jsonc`, also update `C:\Users\pc\.local\share\opencode\auth.json` to keep them in sync.

| File | Role |
|------|------|
| `C:\Users\pc\.local\share\opencode\auth.json` | Source of truth (Managed by Desktop app) |
| `C:\Users\pc\.config\opencode\opencode.jsonc` | CLI reads from here |

### Key Structure in auth.json

```json
{
  "provider_name": {
    "type": "api",
    "key": "the-api-key"
  }
}
```

### Key Structure in opencode.jsonc

In `opencode.jsonc`, keys live under each provider's `options.apiKey`:

```json
{
  "provider_name": {
    "npm": "@ai-sdk/openai-compatible",
    "options": {
      "apiKey": "the-api-key"
    },
    "models": { ... }
  }
}
```
