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
- `sync-models` — fetch latest free models from providers, diff against JSON
- `validate-jsonc` — validate opencode.jsonc syntax before session end
- `secret-scanning` — run Gitleaks locally, update allowlist, validate config, handle CI failures
- `vue-gotchas` — Vue 3 + Pinia framework gotchas
- `playwright-test` — test/screenshot the Vue frontend at localhost:5173
- `nightly-maintenance` — full validation pipeline (validate → rank → summarize → commit)
- `model-summary` — quick overview of model statuses and ranking sizes
- `generate-dashboard` — generate HTML dashboard of provider health
- `health-badge` — generate Shields.io health badge JSON
- `cleanup-snapshots` — rotate old model snapshots
- `metrics-exporter` — Prometheus metrics endpoint / service installer
- `rank-models` — rebuild `_role-rankings` using deterministic scoring algorithm
- `check-rankings` — sanity-check `_role_rankings` (existence, eligibility, no duplicates)
- `backfill-metadata` — populate `stable` ranking (free + working + tools + tested ≥30 days)
- `backfill-context` — fetch `context_length` for null entries (OpenRouter catalog + known values)

## Lean Files Policy

- **One source of truth**: Each fact lives in exactly one file. Point to it, don't duplicate it.
- **No stale snapshots**: Never hardcode point-in-time data (counts, "as of" dates, "currently" lists). Reference the live source instead.
- **Skills own their domain**: AGENTS.md points to skills; skills contain the details. No content overlap.
- **Code examples must earn their place**: If the pattern is already taught elsewhere or is self-evident from the rules, don't include it.
- **Frontmatter stays concise**: Skill descriptions mention *what* triggers them, not implementation details.

## PostgreSQL Database

- The primary data store is PostgreSQL (Docker), accessed via an Express API on port 3001.
- Schema: `db/schema.sql` (8 tables + metadata).
- Run `npm run db:start` to start PostgreSQL + API, `npm run db:migrate` to load data.

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

All scripts live in `scripts/`. Each script has a corresponding skill — see the skill for usage details.

| Script | Purpose |
|--------|---------|
| `kill-port.js` | Kill process on a given port: `node scripts/kill-port.js --port 5173` |
| `validate-jsonc.js` | Validate opencode.jsonc JSONC syntax: `node scripts/validate-jsonc.js [--short]` |
| `get-auth-key.js` | Read a provider API key from auth.json: `node scripts/get-auth-key.js --provider <name> [--list]` |
| `sync-auth-keys.js` | Sync API keys from auth.json into opencode.jsonc: `node scripts/sync-auth-keys.js [--apply] [--check]` |
| `migrate-to-pg.js` | Load `available-models.json` into PostgreSQL (normalized tables) |
| `export-from-pg.js` | Dump PostgreSQL → `available-models.json` (for git/backward compat) |
