---
name: validate-jsonc
description: Use at the end of an editing session to validate opencode.jsonc JSONC syntax is valid. Run once before concluding, not after every edit.
---

# Validate JSONC

## Quick Validation

```bash
node scripts/validate-jsonc.js
```

For CI/machine-readable output (no emoji):

```bash
node scripts/validate-jsonc.js --short
```

## On Failure

If validation fails, immediately inspect `opencode.jsonc` and fix the syntax error. Common issues:

- Missing or extra commas
- Unquoted keys
- Trailing commas in arrays/objects
- Malformed escape sequences
- Unclosed brackets or braces

> **Key sync**: `auth.json` is the source of truth (managed by Desktop app). When it changes, also update `opencode.jsonc`. See `test-model-auth` skill for details.
