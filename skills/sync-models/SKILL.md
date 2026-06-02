---
name: sync-models
description: Use for fetching latest free models from providers and syncing to the DB. Trigger on periodic checks or new free model announcements.
---

# Sync Models

## Procedure

### Step 1: Dry Run

```bash
node scripts/sync-models.js
```

Review new and potentially removed models.

### Step 2: Apply

```bash
node scripts/sync-models.js --apply
```

Adds new models with `status: { result: "untested" }`. Also exports DB → `available-models.json` for git history.

### Step 3: Test

```bash
node scripts/validate-free-models.js --apply
```

This re-tests all models with `status.result === "untested"` (i.e. newly added models from Step 2).

### Step 4: Export (optional)

If you need a fresh `available-models.json` snapshot beyond what `--apply` steps produce:

```bash
node scripts/export-from-pg.js
```

Provider details in `docs/provider-details.md`. Note: some models may be listed as free by providers but always return rate-limited — track these as `rate_limited`.