---
name: extract-modelsdev
description: Scrape free models from https://models.dev/ via Playwright. Triggers: "scrape models.dev", "extract models from models.dev".
---

# Extract Models from models.dev

Scrapes `window.__TABLE_DATA__` from models.dev into `modelsdev-free-models.json`.

```bash
node scripts/extract-modelsdev.js          # free models only
node scripts/extract-modelsdev.js --all    # include paid
```

Requires Playwright (`npx playwright install chromium`). Output is gitignored — always re-scrape before importing, never use stale data.

See `import-modelsdev` skill for the import pipeline and field mapping.
