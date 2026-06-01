---
name: health-badge
description: Use for generating a Shields.io health badge for free model status. Triggers: "health badge", "badge JSON", "shields.io badge", "model health badge".
---

# Health Badge

Generates a Shields.io-compatible JSON badge describing overall free-model health.

## Run

```bash
node scripts/health-badge.js
```

## Output

- `badge/health.json` — schemaVersion 1 badge with `label: "free models"`, message like `"85% working"`, color based on percentage (green ≥80%, yellow ≥50%, red <50%)
