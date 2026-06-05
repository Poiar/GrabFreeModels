---
name: neon-ops
description: Neon serverless Postgres operations: connectivity, schema, export, maintenance. Triggers: "check DB", "export models", "Neon branch", "ping database".
---

# Neon Ops

## Connection

- Primary: `DATABASE_URL` (Neon pooler endpoint). Falls back to `PG*` env vars.
- `npm run db:ping` — verify connectivity.
- `server/db.js` — shared pg Pool (`ssl: { rejectUnauthorized: false }`).
- `scripts/load-models.js` — builds full model data from PG.

## Schema & Export

- DDL: `db/schema.sql` (v2: super_models + datapoint_providers + datapoint_models).
- `npm run db:export` → `available-models.json` (git snapshot, **never source of truth**).
- `scripts/health-check.js` — integrity checks (slug uniqueness, orphans, etc.).

## Common Queries

```sql
SELECT COUNT(*) FROM super_models;
SELECT status_result, COUNT(*) FROM datapoint_models GROUP BY status_result;
SELECT key, value FROM metadata WHERE key LIKE '%ranking%' OR key LIKE '%issue%';
```

## Maintenance Scripts

| Script                    | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `sync-models.js`          | Fetch from providers, diff vs DB. `--apply` to write |
| `validate-free-models.js` | Test APIs, auto re-rank on `--apply`                 |
| `rank-models.js`          | Rebuild `_role_rankings`                             |
| `nightly-maintenance.js`  | Full pipeline: validate → rank → commit              |

## Gotchas

- Neon = single source of truth. JSON files are export-only snapshots.
- `pg` driver auto-parses JSONB — no `JSON.parse` needed.
- `role "gfm" does not exist` on import: expected/harmless.
