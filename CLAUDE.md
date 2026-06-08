# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GrabFreeModels discovers, tests, ranks, and syncs free LLM models across 18+ providers (OpenRouter, NVIDIA, Cerebras, HuggingFace, Google, DeepSeek, Groq, Mistral, Together, etc.). The primary data store is Neon Serverless Postgres (schema v2), served through an Express API and visualized in a Vue 3 + Pinia SPA.

## Essential commands

```bash
# Development
npm run dev:all          # Start DB API (port 3001) + Vite dev server (port 5173) together
npm run api              # Start Express API only (with --watch, port 3001)
npm run dev              # Start Vue dev server only (port 5173, proxies /api → 3001)
npm run build            # Type-check + production build Vue app → dist/

# Testing
npm test                 # Run all tests (validate-models.js + unit-scripts.js)
npm run test:unit        # Unit tests only (logic isolation, no DB/API needed)
node tests/validate-models.js   # Integration tests (hits /api/data)

# Type checking (Vue project)
cd vue-model-manager && npx vue-tsc --noEmit

# Database
npm run db:ping          # Verify Neon connectivity
npm run db:export        # Export PG → available-models.json (git history snapshot)

# Core pipeline scripts (all read/write DB)
npm run sync             # Dry-run: diff free models from providers vs DB
npm run sync:apply       # Apply: insert new + flag removed models
npm run validate         # Dry-run: test model API endpoints
npm run validate:apply   # Apply: write test results + auto re-rank
npm run rank             # Dry-run: rebuild _role_rankings
npm run rank:apply       # Apply: write rankings to DB metadata
npm run re-rank          # Full re-rank pipeline: backfill context → rank → backfill metadata → check
npm run nightly          # Full nightly: snapshot → validate → backfill → re-rank → check → commit → alert
npm run nightly:dry      # Nightly without DB writes
npm run summary          # Text overview of model counts and ranking sizes
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Neon Serverless Postgres (schema v2)               │
│  ┌──────────────┐  ┌──────────────────┐             │
│  │ super_models  │  │ datapoint_models  │  metadata  │
│  │ (abstract ID) │──│ (per-provider row) │  (JSONB)   │
│  └──────────────┘  └──────────────────┘             │
└───────────────────────┬─────────────────────────────┘
                        │
    ┌───────────────────┼───────────────────┐
    ▼                   ▼                   ▼
┌─────────┐    ┌──────────────┐    ┌──────────────┐
│ Express │    │ scripts/     │    │ metrics-     │
│ API     │    │ (Node.js)    │    │ exporter.js  │
│ :3001   │    │              │    │ :9090        │
└────┬────┘    └──────┬───────┘    └──────┬───────┘
     │                │                   │
     ▼                ▼                   ▼
┌──────────┐   ┌───────────┐      ┌────────────┐
│ Vue 3    │   │ Git       │      │ Prometheus  │
│ SPA      │   │ snapshots │      │ + Grafana   │
│ :5173    │   │ + JSON    │      └────────────┘
└──────────┘   └───────────┘
```

**Data model (v2):** `super_models` holds the canonical identity (name, slug, author). Each provider's specific version lives in `datapoint_models` (model_instance_key, pricing, context_length, status, etc.), joined via `datapoint_providers`. Feature tags (best_for, family, open_weights, etc.) are normalized into `datapoint_model_features` as key-value rows. Role rankings are stored as JSONB in the `metadata` table.

**Shared data builder:** `scripts/build-models-data.js` is the single source of truth for constructing the full `ModelsData` object from PG. Used by both the API (`server/routes/data.js` → `GET /api/data`) and every script. `scripts/load-models.js` wraps it with pool management for CLI use.

**Server:** `server/index.js` — thin Express app with two routes: `GET /api/data` (full models payload) and `GET /api/health`. The DB pool lives in `server/db.js` (Neon-aware: max 3 connections, 60s keepalive pings). CORS is open.

**Vue frontend:** `vue-model-manager/` — Vue 3 + Vite + Pinia + vue-router + vue-virtual-scroller. Hash-mode routing. The Pinia store (`src/store/models.ts`) fetches from `/api/data`, computes derived state (super model grouping, provider health, role rankings, stats). Vite proxies `/api` to `localhost:3001`. Routes: Dashboard, SuperModels, SuperModel detail, All, Free, Paid, Issues, Author, Family.

**Scripts pattern:** Most scripts follow a two-phase pattern: `--dry-run` (default) reads DB and prints a diff, `--apply` writes changes. `scripts/sync-models.js` and `scripts/validate-free-models.js` are the most critical — they keep the DB in sync with provider reality.

**Nightly pipeline:** `scripts/nightly-maintenance.js` orchestrates: validate → re-rank → check rankings → generate dashboard → export JSON → git commit → snapshot. Triggered by Windows Task Scheduler daily at 2 AM.

## Important conventions

- **Module format:** Root `package.json` uses `"type": "commonjs"` (all scripts use `require`/`module.exports`). The Vue project uses `"type": "module"` (ESM/TypeScript).
- **Database access:** Always use parameterized queries. Never interpolate user input into SQL. The pool is exported from `server/db.js` — scripts that need DB access can either `require('../server/db')` or create their own pool from `DATABASE_URL`.
- **Neon connection:** Use the pooler endpoint in `DATABASE_URL`. Set `max: 3` connections for Neon (serverless connection limits). Scripts that create their own pool must append `uselibpqcompat=true` to Neon SSL connection strings.
- **full_id format:** `providerSlug/modelInstanceKey` (e.g., `openrouter/meta-llama/llama-4`). This is the composite key used throughout the codebase for model lookups.
- **Git hooks:** Pre-commit runs Gitleaks via `.githooks/pre-commit`. The `.gitleaks.toml` config file manages false-positive allowlists.
- **Never restart the dev server yourself.** If Vite HMR fails to pick up `.vue` changes (known issue with `RecycleScroller`/`DynamicScroller` swaps and structural template changes), ask the user to restart with `cd vue-model-manager && npm run dev`.
- **Before recommending models:** Check `supports_tools` in the datapoint — if false, don't recommend that model for tasks requiring tool use. Refer to `best_for` field for role-fit guidance.

## Key files

| File                                    | Role                                                  |
| --------------------------------------- | ----------------------------------------------------- |
| `db/schema.sql`                         | Canonical schema + seed data (v2)                     |
| `scripts/build-models-data.js`          | Shared data builder — builds ModelsData from PG       |
| `scripts/sync-models.js`                | Fetch free models from providers, diff against DB     |
| `scripts/validate-free-models.js`       | Test models against live APIs                         |
| `scripts/rank-models.js`                | Deterministic role ranking algorithm                  |
| `scripts/nightly-maintenance.js`        | Full nightly pipeline orchestrator                    |
| `server/db.js`                          | Postgres pool (Neon-aware)                            |
| `server/routes/data.js`                 | API routes (`/api/data`, `/api/health`)               |
| `vue-model-manager/src/store/models.ts` | Pinia store — fetches + derives all model data        |
| `vue-model-manager/src/types.ts`        | TypeScript interfaces matching the API response shape |
| `vue-model-manager/vite.config.ts`      | Vite config with `/api` proxy + port-kill plugin      |
| `package.json`                          | Root scripts — most operations have npm run wrappers  |
