---
name: nightly-maintenance
description: Use for running or debugging the nightly validation pipeline. Triggers: "run nightly", "nightly maintenance", "validate and sync all models", "full pipeline run", scheduled task failure.
---

# Nightly Maintenance Pipeline

Runs the full validation pipeline: prune → validate → backfill → re-rank → check → summarize → commit.

## Quick Run

```bash
node scripts/nightly-maintenance.js            # full run
node scripts/nightly-maintenance.js --dry-run  # no commit/push/alerts
```

## Flags

| Flag | Purpose |
|------|---------|
| `--dry-run` | Run validation and ranking checks without committing, pushing, or sending alerts. |

The script reads webhook URLs from the `WEBHOOK_URL` env var, or a JSON blob in `GRAB_FREE_MODELS_ALERTS` (with optional `webhook`, `slack`, `teams`, `email` keys).

## Pipeline Steps

0. **Snapshot** — saves `available-models.json` to `snapshots/available-models-YYYY-MM-DD.json` (gitignored)
0.5. **No opencode prune** — opencode/ models are now included in rankings (managed by rank-models.js)
1. **Validate** — `validate-free-models.js --apply` — re-tests rate_limited and untested models, updates statuses
2.5. **Prune stale non-working** — 7-day burn-in: removes models that have been non-working for >7 days from rankings
2.5. **Backfill context** — `backfill-context.js --apply` — fetches `context_length` for null entries
2.6. **Re-rank** — `rank-models.js --apply` — rebuilds `model`, `build`, `general`, `small_model`, `explore` rankings
2.7. **Populate stable** — `backfill-metadata.js --apply` — populates `stable` ranking (free + working + tools + tested ≥30 days)
2.8. **Check rankings** — `check-rankings.js` — sanity-checks all `_role_rankings`
3. **Regenerate test summary** — rebuilds `_test_summary` from current model data
4. **Generate summary** — `model-summary.js` → writes `nightly-summary.log` (gitignored)
5. **Detect changes** — `git diff` on `available-models.json`
6. **Commit & push** — only if changes detected. Auto-rollback: if working count decreased vs snapshot, or health < 70%, restores from snapshot
7. **Alert** — webhook notifications for recovered models

## Scheduled Task

See `OPERATIONS.md` §1 for setup, webhook, and log configuration.
