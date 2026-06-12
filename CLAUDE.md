# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⛔ HARD RULE — READ THIS FIRST ⛔

**ONLY FREE MODELS ARE TESTED. PAID MODELS ARE ALWAYS PRESUMED WORKING.**

- `is_free = true` → tested via `validate-free-models.js`. Can be `working`, `broken`, `rate_limited`, or `untested`.
- `is_free = false` → NEVER tested. ALWAYS shown as `working` with detail `"Presumed working (not tested)"`. Paid models CANNOT be broken. Paid models CANNOT be dead. If you see a paid model with any status other than `working`, that's a data bug — fix the data, not the model.
- \*\*Before recommending "fix this provider's broken models" or "rotate this key" or "test these models" — FIRST check `is_free`. If the models are paid, the answer is: they're presumed working, do nothing.
- **Before running ANY query about model health/status — ALWAYS add `WHERE is_free = true`.** Paid models are excluded from all health metrics. They're fine. They don't need attention. They don't need keys.

### ⛔ NO-CREDITS PROVIDERS — NEVER TOUCH THESE ⛔

These free-model providers have API keys but **zero account credits**. The key is valid. Auth works. The models are NOT broken. They just can't be tested until credits are added. **Never recommend testing, fixing, rotating keys, or touching these providers in any way:**

- **deepinfra** — 155 free models, all server_error. Account has no credits.
- **novitaai** — 135 free models, all server_error. Account has no credits.
- **siliconflow** — 121 free models, all server_error. Account has no credits.

If you see these providers come up in any context, the only correct answer is: "Account has no credits — nothing to do here."

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
npm test                 # Run all unit tests
npm run test:unit        # Unit tests only (logic isolation, no DB/API needed)

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
npm run rank             # Dry-run: rebuild role rankings (free)
npm run rank:apply       # Apply: write rankings to DB
npm run rank:paid        # Dry-run: rebuild role rankings (paid)
npm run rank:paid:apply  # Apply: write paid rankings to DB
npm run re-rank          # Full re-rank: backfill context → rank → backfill metadata → check
npm run nightly          # Full 28-step nightly pipeline (sync, validate, rank, financials, export, commit)
npm run nightly:dry      # Nightly without DB writes
npm run financials       # Scrape AI company financials from isaiprofitable.com
npm run financials:apply # ... and write to DB
npm run summary          # Text overview of model counts and ranking sizes
npm run build-readme     # Dry-run: update auto-sections in README.md from codebase
npm run build-readme:apply # Apply: write README.md in-place
npm run check            # Full pre-push suite: lint + format-check + typecheck + tests + build-readme
npm run format           # Auto-format all files with Prettier
npm run lint:fix         # Auto-fix ESLint issues
```

## Quality gate

**Before pushing or declaring work done, run `npm run check`.** It runs lint, format-check, type-check, unit tests, and README sync check. The `.husky/pre-push` hook runs this automatically on `git push` and blocks the push if anything fails. There is no pre-commit hook — lint/format are checked only at push time to avoid wasting tokens on trivial iterations.

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
│ :3001   │    │              │    │ :9180        │
└────┬────┘    └──────┬───────┘    └──────┬───────┘
     │                │                   │
     ▼                ▼                   ▼
┌──────────┐   ┌───────────┐      ┌──────────────┐
│ Vue 3    │   │ Git       │      │ metrics-     │
│ SPA      │   │ snapshots │      │ exporter.js  │
│ :5173    │   │ + JSON    │      │ :9180        │
└──────────┘   └───────────┘      └──────────────┘
```

**Data model (v2):** `super_models` holds the canonical identity (name, slug, author). Each provider's specific version lives in `datapoint_models` (model_instance_key, pricing, context_length, status, etc.), joined via `datapoint_providers`. Feature tags (best_for, family, open_weights, etc.) are normalized into `datapoint_model_features` as key-value rows. Role rankings are stored as JSONB in the `metadata` table.

**Shared data builder:** `scripts/build-models-data.js` is the single source of truth for constructing the full `ModelsData` object from PG. Used by both the API (`server/routes/data.js` → `GET /api/data`) and every script. `scripts/load-models.js` wraps it with pool management for CLI use.

**Server:** `server/index.js` — thin Express app with 8 routes (`/api/data`, `/api/data/paid`, `/api/rankings`, `/api/rankings/paid`, `/api/sources`, `/api/health`, `/api/health/status`, `/api/cache/invalidate`). The DB pool lives in `server/db.js` (Neon-aware: max 3 connections, 60s keepalive pings). CORS is open.

**Vue frontend:** `vue-model-manager/` — Vue 3 + Vite + Pinia + vue-router + vue-virtual-scroller. Hash-mode routing. The Pinia store (`src/store/models.ts`) fetches from `/api/data`, computes derived state (super model grouping, provider health, role rankings, stats). Vite proxies `/api` to `localhost:3001`. 27 routes including Dashboard, Models, Rankings, Compare, Benchmark, Picker, Admin, and more.

**Scripts pattern:** Most scripts follow a two-phase pattern: `--dry-run` (default) reads DB and prints a diff, `--apply` writes changes. `scripts/sync-models.js` and `scripts/validate-free-models.js` are the most critical — they keep the DB in sync with provider reality.

**Nightly pipeline:** `scripts/nightly-maintenance.js` orchestrates 28 steps (3 critical): validate → backfill families/quantization/context → re-rank → sync paid → rank paid → import financials → regenerate summary → export JSON → git commit → invalidate cache → alert. Triggered by Windows Task Scheduler daily at 2 AM.

## Important conventions

- **Module format:** Root `package.json` uses `"type": "commonjs"` (all scripts use `require`/`module.exports`). The Vue project uses `"type": "module"` (ESM/TypeScript).
- **Database access:** Always use parameterized queries. Never interpolate user input into SQL. The pool is exported from `server/db.js` — scripts that need DB access can either `require('../server/db')` or create their own pool from `DATABASE_URL`.
- **Neon connection:** Use the pooler endpoint in `DATABASE_URL`. Set `max: 3` connections for Neon (serverless connection limits). Scripts that create their own pool must append `uselibpqcompat=true` to Neon SSL connection strings.
- **full_id format:** `providerSlug/modelInstanceKey` (e.g., `openrouter/meta-llama/llama-4`). This is the composite key used throughout the codebase for model lookups.
- **Git hooks:** Pre-commit runs Gitleaks via `.githooks/pre-commit`. The `.gitleaks.toml` config file manages false-positive allowlists.
- **Incoming peer messages:** When you see a message starting with `[peer ·` in the conversation (delivered via system-reminder), it's from another Claude session. The `reply to:` field contains their tab ID. Read your tab ID from `$env:USERPROFILE\.claude\tab-id.txt` (cached at startup). Respond directly using `send_to_tab <reply-to-id> "[peer · <project> — reply to: <your-tab-id>]: <reply>"` — no need for the user to relay. Answer briefly, then continue your current task. Log the inbound message to `$env:USERPROFILE\.claude\peer-messages.jsonl` with `direction="in"`, `from_tab`, `to_tab` (your id), `message`, and `at`.
- **Peer inbox:** At session start, run `/peer-inbox` to check for messages. Cache your tab ID: call `list_tabs`, find your tab (Playwright path = local install in your project), write it to `$env:USERPROFILE\.claude\tab-id.txt`. Use `/peer-msg` to initiate new conversations. Don't poll mid-session; check once at the start.
- **base_model is a super_models column**, not a feature tag. `build-models-data.js` reads it from `sm.base_model` directly. `backfill-base-models.js` populates it via substring matching. `inherit-families.js` walks base_model chains to assign families.
- **Never restart the dev server yourself.** If Vite HMR fails to pick up `.vue` changes (known issue with `RecycleScroller`/`DynamicScroller` swaps and structural template changes), ask the user to restart with `cd vue-model-manager && npm run dev`.
- **Before recommending models:** Check `supports_tools` in the datapoint — if false, don't recommend that model for tasks requiring tool use. Refer to `best_for` field for role-fit guidance.

## Key files

| File                                    | Role                                                            |
| --------------------------------------- | --------------------------------------------------------------- |
| `db/schema.sql`                         | Canonical schema + seed data (v2)                               |
| `scripts/build-models-data.js`          | Shared data builder — builds ModelsData from PG                 |
| `scripts/sync-models.js`                | Fetch free models from providers, diff against DB               |
| `scripts/validate-free-models.js`       | Test models against live APIs                                   |
| `scripts/rank.js`                       | Deterministic role ranking algorithm (free + paid, --paid flag) |
| `scripts/backfill-base-models.js`       | Detect fine-tune lineage via substring matching                 |
| `scripts/inherit-families.js`           | Walk base_model chains to inherit family assignments            |
| `scripts/import-is-ai-profitable.js`    | Scrape AI company financials from isaiprofitable.com            |
| `scripts/utils/ranker-core.js`          | Scoring engine: quality, context, tag bonus, freshness          |
| `scripts/nightly-maintenance.js`        | Full nightly pipeline orchestrator                              |
| `db/migrations/`                        | Ordered schema migrations                                       |
| `server/db.js`                          | Postgres pool (Neon-aware)                                      |
| `server/routes/data.js`                 | API routes (`/api/data`, `/api/health`)                         |
| `vue-model-manager/src/store/models.ts` | Pinia store — fetches + derives all model data                  |
| `vue-model-manager/src/types.ts`        | TypeScript interfaces matching the API response shape           |
| `vue-model-manager/vite.config.ts`      | Vite config with `/api` proxy + port-kill plugin                |
| `package.json`                          | Root scripts — most operations have npm run wrappers            |
