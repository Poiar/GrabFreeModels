---
name: model-summary
description: Use for generating a quick overview of free model statuses and ranking sizes. Triggers: "model summary", "how many models", "status overview", "health check", "show model stats".
---

# Model Summary

Quick overview of free model statuses and role ranking sizes.

## Run

```bash
node scripts/model-summary.js
```

## Output

- Total free models, working, rate-limited, broken counts
- Entry counts per role ranking

See `nightly-maintenance` skill for the full scheduled pipeline that also generates and logs this summary.

## See Also

- `generate-dashboard` — visual HTML dashboard of the same stats
- `health-badge` — badge.json for the same health data
