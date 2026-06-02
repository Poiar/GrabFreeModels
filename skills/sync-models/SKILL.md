---
name: sync-models
description: Use for fetching latest free models from providers and syncing to available-models.json. Trigger on periodic checks or new free model announcements.
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

Adds new models with `status: { result: "untested" }`.

### Step 3: Test

```bash
node scripts/validate-free-models.js --apply
```

This re-tests all models with `status.result === "untested"` (i.e. newly added models from Step 2).

### Step 4: Snapshot (recommended)

Save a pre-validation copy so you can roll back if validation goes wrong:

```bash
Copy-Item available-models.json available-models.snapshot.json
```

If needed, restore with `Copy-Item available-models.snapshot.json available-models.json`.

Provider details in `docs/provider-details.md`. Note: some models may be listed as free by providers but always return rate-limited — track these as `rate_limited`.