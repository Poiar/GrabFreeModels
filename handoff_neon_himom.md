# Handoff: Neon PostgreSQL Migration

**Date:** 2026-06-02
**Status:** ✅ Complete — DB migrated, API connected, old Docker postgres removed

---

## What Changed

### Database: Local Docker → Neon Serverless Postgres

| | Before | After |
|---|---|---|
| **Host** | Docker container `grabfreemodels-db` | Neon serverless (eu-central-1) |
| **Version** | Postgres 18-alpine | Neon Postgres 17 |
| **Connection** | `PGHOST=postgres` (Docker network) | `DATABASE_URL` (pooler endpoint) |

### Files Modified

- **`docker-compose.yml`** — Removed `postgres` service entirely. API service now uses `DATABASE_URL` pointing to Neon pooler.
- **`server/db.js`** — Now prefers `DATABASE_URL` (connection string), falls back to individual `PG*` env vars for local dev.
- **`opencode.jsonc`** — Added Neon MCP server (`https://mcp.neon.tech/mcp`).

### Files NOT Modified (no changes needed)

- `server/index.js` — reads `API_PORT` only, no DB awareness
- `server/routes/data.js` — uses `../db` pool, no direct connection logic
- `vue-model-manager/` — proxies `/api` → `localhost:3001`, DB-agnostic
- `db/schema.sql` — unchanged, already imported to Neon
- `scripts/*` — all scripts use `pg` client, work with any connection string

---

## Neon Connection Details

```
Host:     ep-royal-grass-a20az9zk-pooler.eu-central-1.aws.neon.tech
Database:  neondb
Role:      neondb_owner
Password:  npg_DQGxTh9iCR3d
```

**Full connection string:**
```
postgresql://neondb_owner:npg_DQGxTh9iCR3d@ep-royal-grass-a20az9zk-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

> Use the **pooler** host (with `-pooler`), not the direct endpoint. The pooler is required for serverless/short-lived connections.

---

## Current `docker-compose.yml`

```yaml
services:
  api:
    build:
      context: .
      dockerfile: server/Dockerfile
    container_name: grabfreemodels-api
    environment:
      DATABASE_URL: "postgresql://neondb_owner:npg_DQGxTh9iCR3d@ep-royal-grass-a20az9zk-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
      API_PORT: 3001
    ports:
      - "3001:3001"
    volumes:
      - ./server:/app/server
```

---

## Current `server/db.js`

```js
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
  ? new Pool({ connectionString })
  : new Pool({
      host: process.env.PGHOST || 'postgres',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER || 'gfm',
      password: process.env.PGPASSWORD || 'gfm',
      database: process.env.PGDATABASE || 'grabfreemodels',
    });

module.exports = pool;
```

---

## npm Scripts — Important Notes

| Script | Status | Notes |
|--------|--------|-------|
| `db:start` | ⚠️ Misleading | Still runs `docker compose up -d` but there's no postgres service anymore — only starts the API container |
| `db:stop` | ⚠️ Misleading | Runs `docker compose down` — stops API container, not a DB |
| `db:reset` | ⚠️ Misleading | Same issue — no local DB to reset |
| `db:migrate` | ✅ Works | Runs `migrate-to-pg.js`, connects via `DATABASE_URL` or `PG*` env vars |
| `db:setup` | ⚠️ Broken | Calls `db:reset` then `db:migrate` — reset no longer makes sense |
| `api:start` | ✅ Works | Starts Express API, connects to Neon |
| `dev:all` | ⚠️ Partially broken | Calls `db:start` (no-op for DB) + `api:start` + `dev` |

**Recommended:** Update `db:start`/`db:stop`/`db:reset`/`db:setup` scripts to either remove them or repurpose them (e.g., `db:start` could verify Neon connectivity).

---

## Neon MCP Server

Configured in `opencode.jsonc`:
```json
"mcp": {
  "neon": {
    "type": "remote",
    "url": "https://mcp.neon.tech/mcp",
    "enabled": true
  }
}
```

**First use requires OAuth** — opencode will open a browser to authenticate with Neon.

After auth, the MCP server provides tools for:
- Managing projects, branches, databases
- Running SQL queries directly
- Viewing connection strings

---

## Neon Free Tier Limits

- **Storage:** 512 MB
- **Compute:** 0.25 vCPU, 1 GB RAM
- **Branches:** 10 per project
- **Backups:** Daily, 7-day retention
- **Scale-to-zero:** After 5 min inactivity (~5s cold start on first request)

---

## Data Verification

Import was done via `pg_dump` from local Docker → `psql` into Neon. All tables, data, indexes, and sequences were created successfully. `role "gfm" does not exist` errors during import are expected and harmless (Neon uses its own role system).

Confirmed working:
- `GET /api/health` → `{"status":"ok"}`
- `GET /api/data` → full model data returned from Neon

---

## Recommended Next Steps

1. **Update `npm run db:*` scripts** — remove or repurpose since there's no local DB
2. **Move `DATABASE_URL` to `.env`** — avoid hardcoding credentials in `docker-compose.yml` (already gitignored)
3. **Set up Neon branching** — create a test branch for safe `--apply` operations:
   ```bash
   npx neonctl branch create --name test
   ```
4. **Consider automated backups** — Neon's 7-day retention may be enough, but for peace of mind, schedule periodic `pg_dump` → external storage
