---
name: sync-models
description: Use for fetching latest free models from providers and syncing to available-models.json. Trigger on periodic checks or new free model announcements.
---

# Sync Models

## When to Use

- Periodic check for newly-added free models
- After a provider announces new free tier models
- When the user asks about new free models
- When onboarding a new provider

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
node scripts/validate-free-models.js --models "openrouter/provider/model:free" --apply
```

Provider details in `docs/provider-details.md`. Edge cases: Gemma models returned as free but always 429 (track as `rate_limited`).