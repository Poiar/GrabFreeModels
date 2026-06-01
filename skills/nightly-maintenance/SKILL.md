---
name: nightly-maintenance
description: Use for running or debugging the nightly validation pipeline. Triggers: "run nightly", "nightly maintenance", "validate and sync all models", "full pipeline run", scheduled task failure.
---

# Nightly Maintenance Pipeline

Runs the full validation pipeline: prune → validate → rank-check → prune → summarize → commit → push.

## Quick Run

```bash
node scripts/nightly-maintenance.js        # full run
node scripts/nightly-maintenance.js --dry-run  # no commit/push/alerts
```

## Flags

| Flag | Purpose |
|------|---------|
| `--dry-run` | Run validation and ranking checks without committing, pushing, or sending alerts. |

The script reads webhook URLs from the `WEBHOOK_URL` env var, or a JSON blob in `GRAB_FREE_MODELS_ALERTS` (with optional `webhook`, `slack`, `teams`, `email` keys).

## Pipeline Steps

0. Saves `available-models.json` to `snapshots/available-models-YYYY-MM-DD.json` (gitignored)
0.5. Prunes `opencode/` models from role rankings (can't be validated via HTTPS)
1. `validate-free-models.js --apply` — re-tests `rate_limited` and `untested` models, updates statuses
2.5. Prunes stale non-working models from rankings (7-day burn-in: only removes models that have been non-working for >7 days)
2. `check-rankings.js` — sanity-checks `_role_rankings` (runs after pruning so rankings are clean)
3. `model-summary.js` — writes `nightly-summary.log` (gitignored)
4. `git add available-models.json` → commit with change counts → push (only if changes detected)
5. Auto-rollback: if the working model count decreased vs the snapshot, or (with no snapshot) health is below 70%, restores `available-models.json` from the snapshot and commits the rollback
6. Sends webhook alerts for recovered models

## Scheduled Task

Set up a Windows Scheduled Task to run `node scripts/nightly-maintenance.js` daily (e.g., 02:00 AM). An XML template is provided at `scripts/nightly-task.xml` — import it via Task Scheduler or `schtasks`. See `OPERATIONS.md` §1 for webhook and log configuration.

## Related Skills

- `sync-models` — fetch new free models from providers (run before nightly)
- `validate-free-models` — individual model validation
