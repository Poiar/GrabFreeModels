---
name: nightly-maintenance
description: Use for running or debugging the nightly validation pipeline. Triggers: "run nightly", "nightly maintenance", "validate and sync all models", "full pipeline run", scheduled task failure.
---

# Nightly Maintenance Pipeline

Runs the full validation pipeline: validate → rank-check → summarize → commit → push.

## Quick Run

```bash
node scripts/nightly-maintenance.js
```

## Flags

None — the script reads webhook URLs from the `WEBHOOK_URL` env var, or a JSON blob in `GRAB_FREE_MODELS_ALERTS` (with optional `webhook`, `slack`, `teams`, `email` keys).

## Pipeline Steps

0. Saves `available-models.json` to `snapshots/available-models-YYYY-MM-DD.json` (gitignored)
1. `validate-free-models.js --apply` — re-tests all models, updates statuses
2. `check-rankings.js` — sanity-checks `_role_rankings` against model IDs
3. `model-summary.js` — writes `nightly-summary.log`
4. `git add available-models.json` → commit → push (only if changes detected)
5. Auto-rollback: if the working model count decreased vs the snapshot, or (with no snapshot) health is below 70%, restores `available-models.json` from the snapshot and commits the rollback
6. Sends webhook alerts for recovered models

## Scheduled Task

The Windows Scheduled Task (`nightly-task.xml`) runs daily at 02:00 AM. Import it via Task Scheduler.

## Related Skills

- `sync-models` — fetch new free models from providers (run before nightly)
- `validate-free-models` — individual model validation
