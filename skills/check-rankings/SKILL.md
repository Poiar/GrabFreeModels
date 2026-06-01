---
name: check-rankings
description: Use for sanity-checking _role_rankings against the models array. Triggers: "check rankings", "validate rankings", "ranking integrity", "verify role rankings".
---

# Check Rankings

Validates `_role_rankings` integrity:
- All IDs exist in the models array
- No duplicate entries per role
- No `opencode/` models (can't be validated)
- No models from used-up providers (current month)
- All models are free (`is_free=true`), not removed, status=`working`, and `supports_tools=true`

See `rank-models` skill for the ranking algorithm and eligibility criteria.

## Run

```bash
node scripts/check-rankings.js
```

Exits 0 if all rankings are valid, 1 otherwise.
