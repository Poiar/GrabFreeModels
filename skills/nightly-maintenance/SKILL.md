---
name: nightly-maintenance
description: Use for running or debugging the nightly validation pipeline. Triggers: "run nightly", "nightly maintenance", "validate and sync all models", "full pipeline run", scheduled task failure.
---

# Nightly Maintenance Pipeline

Runs the full validation pipeline. See `scripts/nightly-maintenance.js` for flags and webhook configuration.

## Pipeline Steps

1. **Snapshot** — saves `available-models.json` to `snapshots/`
2. **Validate** — re-tests rate-limited and untested models
3. **Prune stale** — removes models non-working for >7 days
4. **Backfill context** — fetches `context_length` for null entries
5. **Re-rank** — rebuilds all role rankings
6. **Populate stable** — free + working + tools + tested ≥30 days
7. **Check rankings** — sanity-checks all `_role_rankings`
8. **Commit & push** — auto-rollback if health drops
9. **Alert** — webhook notifications for recovered models
