---
name: check-rankings
description: Use for sanity-checking _role_rankings against the models array. Triggers: "check rankings", "validate rankings", "ranking integrity", "verify role rankings".
---

# Check Rankings

Verifies that every model ID in `_role_rankings` exists in the models array, checks for duplicates, and flags models from providers listed in `_provider_usage` as used-up.

## Run

```bash
node scripts/check-rankings.js
```

Exits 0 if all rankings are valid, 1 otherwise.
