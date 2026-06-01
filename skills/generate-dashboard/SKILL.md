---
name: generate-dashboard
description: Use for generating an HTML dashboard of provider health and model rankings. Triggers: "generate dashboard", "create dashboard", "view dashboard", "provider health HTML".
---

# Generate Dashboard

Creates `dashboard.html` showing provider health and current role rankings.

## Run

```bash
node scripts/generate-dashboard.js
node scripts/generate-dashboard.js --output path/to/dashboard.html
```

## Output

- `dashboard.html` — provider health table + role ranking tables
- Providers listed in `_provider_usage` for the current month are greyed out

Open the generated file in any browser.

## See Also

- `health-badge` — generates a Shields.io badge from the same `available-models.json` data
- `model-summary` — text-based overview of the same stats
