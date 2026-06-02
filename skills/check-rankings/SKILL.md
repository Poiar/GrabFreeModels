---
name: check-rankings
description: Use for sanity-checking _role_rankings integrity. Triggers: "check rankings", "validate rankings", "ranking integrity", "verify role rankings".
---

# Check Rankings

Validates `_role_rankings` in `available-models.json`. See `rank-models` skill for the ranking algorithm and eligibility criteria.

## What It Checks

- All ranked IDs exist in the models array
- No duplicate entries per role
- No `opencode/` models (can't be validated)
- No models from providers in `_provider_usage` for the current month
- All models are eligible per `rank-models` criteria: `is_free=true`, not removed, `status=working`, `supports_tools=true`

## Run

```bash
node scripts/check-rankings.js
```

Exits 0 if all rankings are valid, 1 otherwise. Run after `rank-models --apply`.
