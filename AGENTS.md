# AGENTS.md - GrabFreeModels workspace

## About

GrabFreeModels is for discovering, testing, ranking, and syncing free LLM models across providers. It tracks verified free models, tests them for reliability, and keeps configuration up to date.

## Config

### opencode
- Global config: `C:\Users\pc\.config\opencode\opencode.jsonc` (NOT `.json`, NOT `.encode/opencode.json`)
- Auth file: `C:\Users\pc\.local\share\opencode\auth.json`
- Desktop app manages auth.json — source of truth for API keys

## Skills

All skills live in `C:\OC\GrabFreeModels\skills\`.

### Available Skills
- `test-model-auth` — manage provider API keys, read from auth.json
- `model-recommendations` — ALWAYS consult before suggesting any model
- `parallel-todos` — use for independent parallel subagent tasks
- `validate-free-models` — test and validate free model statuses
- `sync-models` — fetch latest free models from providers, sync to DB + JSON
- `validate-jsonc` — validate opencode.jsonc syntax before session end
- `secret-scanning` — run Gitleaks locally, update allowlist, validate config, handle CI failures
- `vue-gotchas` — Vue 3 + Pinia framework gotchas
- `playwright-test` — test/screenshot the Vue frontend at localhost:5173
- `nightly-maintenance` — full nightly validation pipeline
- `metrics-exporter` — Prometheus metrics endpoint / service installer
- `rank-models` — rebuild `_role-rankings` using deterministic scoring algorithm
- `extract-modelsdev` — scrape models.dev for free model data
- `schema-v2` — DB schema documentation (master_models + datapoint_providers + datapoint_models)

## Lean Files Policy

- **One source of truth**: Each fact lives in exactly one file. Point to it, don't duplicate it.
- **No stale snapshots**: Never hardcode point-in-time data (counts, "as of" dates, "currently" lists). Reference the live source instead.
- **Skills own their domain**: AGENTS.md points to skills; skills contain the details. No content overlap.
- **Code examples must earn their place**: If the pattern is already taught elsewhere or is self-evident from the rules, don't include it.
- **Frontmatter stays concise**: Skill descriptions mention *what* triggers them, not implementation details.

## PostgreSQL Database

- The primary data store is Neon Serverless Postgres, accessed via an Express API on port 3001.
- Connection via `DATABASE_URL` (pooler endpoint) loaded from `.env` — see `.env.example` for template.
- Schema: `db/schema.sql` — v2 (master_models + datapoint_providers + datapoint_models). See `schema-v2` skill.
- Run `npm run db:ping` to verify Neon connectivity.
- Run `npm run db:export` to export Neon → `available-models.json` (git history snapshot).

## API Server

- `server/index.js` — Express app serving `GET /api/data` (full ModelsData) and `GET /api/health`.
- The Vue dev server proxies `/api` → `localhost:3001`.
- The Vue store fetches from `/api/data` instead of the JSON file directly.

## Vue Project

- `vue-model-manager/` — Vue 3 + Vite + Pinia SPA that visualizes model data from the API.
- `npm run dev` starts dev server at `http://localhost:5173` (proxies `/api` to port 3001).
- `npm run dev:all` starts DB + API + Vite together.
- `npm run build` produces production build in `dist/`.
- Consult `vue-gotchas` skill when writing or reviewing Vue code.

## Scripts

All scripts live in `scripts/`. Some have corresponding skills with additional workflow guidance — see the skill for details.

| Script | Purpose |
|--------|---------|
| `kill-port.js` | Kill process on a given port: `node scripts/kill-port.js --port 5173` |
| `validate-jsonc.js` | Validate opencode.jsonc JSONC syntax: `node scripts/validate-jsonc.js [--short]` |
| `get-auth-key.js` | Read a provider API key from auth.json: `node scripts/get-auth-key.js --provider <name> [--list]` |
| `sync-auth-keys.js` | Sync API keys from auth.json into opencode.jsonc: `node scripts/sync-auth-keys.js [--apply] [--check]` |
| `load-models.js` | Shared module: builds full models data from PG (same shape as `/api/data`) |
| `export-from-pg.js` | Export PostgreSQL → `available-models.json` (for git history snapshots) |
| `sync-models.js` | Fetch latest free models from providers, diff against DB. `--apply` inserts new + flags removed |
| `validate-free-models.js` | Read/write DB. Tests models against APIs, auto re-ranks on `--apply` |
| `rank-models.js` | Read/write DB metadata. Rebuilds `_role_rankings` via tag+ctx scoring |
| `backfill-context.js` | Read/write DB. Fetches `context_length` for null entries from OpenRouter catalog |
| `backfill-metadata.js` | Read/write DB. Backfills `supports_tools` + populates `stable` ranking |
| `extract-modelsdev.js` | Scrape models.dev via Playwright → `modelsdev-free-models.json` |
| `check-rankings.js` | Sanity-check `_role_rankings` integrity (reads from DB) |
| `cleanup-snapshots.js` | Rotate old model snapshots: `node scripts/cleanup-snapshots.js --keep 30` |
| `generate-dashboard.js` | Generate HTML dashboard of provider health and rankings (reads from DB) |
| `health-badge.js` | Generate Shields.io health badge JSON (reads from DB) |
| `model-summary.js` | Text overview of model statuses and ranking sizes (reads from DB) |
| `nightly-maintenance.js` | Full nightly pipeline (validate → rank → commit) |
| `migrate-v1-to-v2.js` | Migrate v1 schema → v2 (master_models + datapoint_providers + datapoint_models) |
| `metrics-exporter.js` | Serve Prometheus metrics (reads from DB) |
| `install-metrics-service.js` | Install metrics exporter as a Windows service |
