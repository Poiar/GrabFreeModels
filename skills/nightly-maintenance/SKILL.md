---
name: nightly-maintenance
description: Use for running or debugging the nightly validation pipeline. Triggers: "run nightly", "nightly maintenance", "validate and sync all models", "full pipeline run", scheduled task failure.
---

# Nightly Maintenance Pipeline

28-step orchestrator in `scripts/nightly-maintenance.js`. 3 critical steps (validate, re-rank, commit-push) — failure on these aborts the pipeline. Non-critical step failures are logged but don't stop execution.

## Quick Run

```bash
npm run nightly          # Full pipeline
npm run nightly:dry      # No DB writes, no commits
# Run a single step:
node scripts/nightly-maintenance.js --step re-rank
# Continue from a step through the rest:
node scripts/nightly-maintenance.js --step re-rank --continue
```

## Pipeline Flow

Snapshot → **validate** (critical) → health checks → backfills (families, derivations, quantization, context) → prune stale → snapshot pre-rank → **re-rank** (critical) → drift detection → sanity check → routing/timeline checks → sync paid → rank paid → import financials → regenerate summary → export JSON → **commit-push** (critical, auto-rollback) → webhook alerts → invalidate cache → summary

## Rollback

Commit-push auto-rollbacks if working model count drops or overall health falls below 70%. Rollback only restores the JSON snapshot, not the PostgreSQL database.

## Trigger

Windows Task Scheduler, daily at 2 AM.
