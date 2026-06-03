---
name: neon-ops
description: Use for Neon serverless Postgres operations: connectivity checks, schema queries, data export, branch management. Triggers: "check DB", "export models", "Neon branch", "ping database", "Neon schema".
---

# Neon Ops

## Connection

- Primary: `DATABASE_URL` env var (Neon pooler endpoint). Falls back to individual `PG*` env vars.
- `npm run db:ping` — verify connectivity.
- `server/db.js` — shared DB module (pg Pool). `getDb()` returns a query helper.
- Pool config: `ssl: { rejectUnauthorized: false }` (Neon requires SSL).

## Schema & Queries

- Schema file: `db/schema.sql` — v2 (super_models + datapoint_providers + datapoint_models).
- `schema-v2` skill — DB schema details.
- `scripts/load-models.js` — shared module for building full models data from PG.
- `scripts/health-check.js` — integrity: slug uniqueness, author coverage, orphans.

## Data Export

- `npm run db:export` → exports Neon → `available-models.json` (git history snapshot).
- `scripts/export-from-pg.js` — use `ownPool` flag for pool cleanup.

## Common Queries

```sql
-- Model counts
SELECT COUNT(*) FROM super_models;
SELECT COUNT(*) FROM datapoint_models WHERE NOT is_removed;
SELECT datapoint_provider_id, COUNT(*) FROM datapoint_models GROUP BY datapoint_provider_id;

-- Status overview
SELECT status_result, COUNT(*) FROM datapoint_models GROUP BY status_result;

-- Metadata (rankings, known issues)
SELECT key, value FROM metadata WHERE key LIKE '%ranking%' OR key LIKE '%issue%';
```

## Maintenance Scripts

| Script | Purpose |
|--------|---------|
| `sync-models.js` | Fetch from providers, diff against DB. `--apply` inserts new + flags removed |
| `validate-free-models.js` | Test models against APIs, auto re-ranks on `--apply` |
| `rank-models.js` | Rebuilds `_role_rankings` via tag+ctx scoring |
| `backfill-context.js` | Fetches `context_length` from OpenRouter catalog |
| `backfill-metadata.js` | Backfills `supports_tools` + populates `stable` ranking |
| `nightly-maintenance.js` | Full pipeline: validate → rank → commit |

## Gotchas

- Neon is **single source of truth**. Local JSON files are export-only snapshots.
- `pg` driver auto-parses JSONB — no `JSON.parse` needed for metadata queries.
- `role "gfm" does not exist` errors on import are expected/harmless (Neon doesn't create roles).
