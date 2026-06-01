---
name: cleanup-snapshots
description: Use for rotating old model snapshots. Triggers: "cleanup snapshots", "rotate snapshots", "delete old snapshots", "snapshot retention".
---

# Cleanup Snapshots

Retains the most recent N snapshots and deletes older ones.

## Run

```bash
node scripts/cleanup-snapshots.js --keep 30
```

Keeps the 30 most recent `available-models-*.json` files in `snapshots/`. Older files are deleted. The `snapshots/` contents are gitignored (only `.gitkeep` is tracked).
