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
- **Model recommendations**: Before suggesting any model, check `supports_tools` in `datapoint_models` (or via `GET /api/data`). If `false`, do NOT recommend. Refer to `best_for` field for role-fit. If unfamiliar, say "I need to verify tool calling support first".
- `parallel-todos` — use for independent parallel subagent tasks
- `validate-free-models` — test and validate free model statuses
- `sync-models` — fetch latest free models from providers, sync to DB
- `import-modelsdev` — import models.dev data into super_models + datapoint_models (see also `extract-modelsdev`)
- `extract-modelsdev` — scrape models.dev via Playwright → `modelsdev-free-models.json`
- `validate-jsonc` — validate opencode.jsonc syntax before session end
- `secret-scanning` — run Gitleaks locally, update allowlist, validate config, handle CI failures
- `vue-gotchas` — Vue 3 + Pinia framework gotchas
- `playwright-test` — test/screenshot the Vue frontend at localhost:5173
- `nightly-maintenance` — full nightly validation pipeline
- `metrics-exporter` — Prometheus metrics endpoint / service installer
- `rank-models` — rebuild `_role_rankings` using deterministic scoring algorithm
- `schema-v2` — DB schema documentation (super_models + datapoint_providers + datapoint_models)

## Agent Team

12 specialized senior agents in `.claude/agents/` covering all major engineering disciplines. Each agent runs on Sonnet and has persistent memory in `.claude/agent-memory/<name>/`.

### Engineering Roles

| Agent | Role | Triggers |
|-------|------|----------|
| `architect` | Staff Engineer — system design, trade-off analysis, task decomposition, cross-cutting architecture | Architecture, design, trade-off, how should we, module boundary |
| `backend-engineer` | API & server — Express routes, middleware, error handling, script module architecture | API, Express, server, route, middleware, endpoint, backend |
| `data-engineer` | Database & pipelines — PostgreSQL schema, migrations, query optimization, data integrity | Schema, migration, SQL, database, data model, pipeline, index |
| `devops-engineer` | DevOps & SRE — CI/CD, deployment, monitoring, Windows Service, infrastructure | Deploy, CI/CD, monitoring, Prometheus, service, infrastructure |
| `ui-ux-reviewer` | UI/UX design — accessibility, responsive design, visual consistency, design system | UI changes, design feedback, component review |
| `performance` | Performance — DB queries, API latency, bundle size, Web Vitals, memory | Slow, latency, bundle size, optimization, memory leak |
| `scraping` | Web scraping — Playwright, bot bypass, rate limiting, data extraction | Scrape, extract, crawl, sync providers |
| `security` | AppSec — OWASP, secrets detection, dependency audit, SQL injection, auth | Security review, vulnerability, secret scanning |
| `qa` | QA — test planning, edge cases, regression analysis, manual test scripts | Test plan, QA, regression, edge cases |
| `code-quality` | Code quality — structure, DRY, naming, conventions, dead code, refactoring | Code review, refactor, code smell, DRY |

### System Roles

| Agent | Role | Triggers |
|-------|------|----------|
| `memory-management` | Memory curator — quality audits, deduplication, staleness detection, index maintenance | Memory, MEMORY.md, stale memory, remember |
| `skill-management` | Skill ecosystem — create/update/audit skills, skill index, lean files policy | Skill, SKILL.md, create skill, skill audit |

### When to Delegate

- **Cross-cutting architecture / complex design** → `architect` agent
- **API / server / backend changes** → `backend-engineer` agent
- **Database / schema / pipeline changes** → `data-engineer` agent
- **Deployment / CI/CD / monitoring** → `devops-engineer` agent
- **UI/UX feedback** → `ui-ux-reviewer` agent (proactive on any UI change)
- **Performance investigation** → `performance` agent
- **Scraping/playwright tasks** → `scraping` agent
- **Security-sensitive changes** → `security` agent
- **Test planning for complex changes** → `qa` agent
- **Code smell detection / refactoring** → `code-quality` agent
- **Memory system maintenance** → `memory-management` agent
- **Skill creation or auditing** → `skill-management` agent

## Lean Files Policy

- **One source of truth**: Each fact lives in exactly one file. Point to it, don't duplicate it.
- **No stale snapshots**: Never hardcode point-in-time data (counts, "as of" dates, "currently" lists). Reference the live source instead.
- **Skills own their domain**: AGENTS.md points to skills; skills contain the details. No content overlap.
- **Code examples must earn their place**: If the pattern is already taught elsewhere or is self-evident from the rules, don't include it.
- **Frontmatter stays concise**: Skill descriptions mention *what* triggers them, not implementation details.

## PostgreSQL Database

- The primary data store is Neon Serverless Postgres, accessed via an Express API on port 3001.
- Connection via `DATABASE_URL` (pooler endpoint) loaded from `.env` — see `.env.example` for template.
- Schema: `db/schema.sql` — v2 (super_models + datapoint_providers + datapoint_models). See `schema-v2` skill.
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

### Rebuilding / Restarting the Dev Server

**Never rebuild or restart the dev server yourself.** If code changes are not being picked up:

1. First check if the issue is HMR not picking up `.vue` file changes — this happens specifically with `RecycleScroller`/`DynamicScroller` component swaps and structural template changes.
2. Tell the user: "The Vite dev server needs a restart to pick up the changes. Can you restart it with `cd vue-model-manager && npm run dev`?"
3. If the dev server was killed, the user needs to restart it manually — you cannot reliably restart background processes from the agent.

**⚠️ Known issue:** Vite HMR sometimes fails silently for `.vue` file changes involving virtual scroller component swaps (`RecycleScroller` → `DynamicScroller`), structural template changes to scoped styles, or changes to `<script setup>` imports. A full dev server restart is required in these cases.

**Do NOT:**
- Run `npm run build` to "fix" a dev issue — that only checks production output
- Kill/restart Vite processes yourself — ask the user
- Assume HMR picked up your changes — verify with a test first

## Scripts

All scripts live in `scripts/`. Some have corresponding skills with additional workflow guidance — see the skill for details.

| Script | Purpose |
|--------|---------|
| `health-check.js` | DB integrity: slug uniqueness, author coverage, modelsdev coverage, orphan check |
| `load-models.js` | Shared module: builds full models data from PG (same shape as `/api/data`) |
| `export-from-pg.js` | Export PostgreSQL → `available-models.json` (for git history snapshots) |
| `import-modelsdev.js` | Import models.dev → super_models + datapoint_models (see `import-modelsdev` skill) |
| `import-modelsdev-backfill.js` | Fuzzy-match remaining supers to modelsdev by remote_id normalization |
| `sync-models.js` | Fetch latest free models from providers (OpenRouter, Cerebras, NVIDIA, HuggingFace, Google, DeepSeek, Groq), diff against DB. `--apply` inserts new + flags removed |
| `validate-free-models.js` | Read/write DB. Tests models against APIs, auto re-ranks on `--apply` |
| `rank-models.js` | Read/write DB metadata. Rebuilds `_role_rankings` via tag+ctx scoring |
| `backfill-context.js` | Read/write DB. Fetches `context_length` for null entries from OpenRouter catalog |
| `backfill-metadata.js` | Read/write DB. Backfills `supports_tools` + populates `stable` ranking |
| `backfill-from-openrouter.js` | Enrich `supports_tools` from OpenRouter API `supported_parameters` for accurate tool-support detection |
| `check-rankings.js` | Sanity-check `_role_rankings` integrity (reads from DB) |
| `nightly-maintenance.js` | Full nightly pipeline (validate → rank → commit) |
| `generate-dashboard.js` | Generate HTML dashboard of provider health and rankings (reads from DB) |
| `health-badge.js` | Generate Shields.io health badge JSON (reads from DB) |
| `model-summary.js` | Text overview of model statuses and ranking sizes (reads from DB) |
| `metrics-exporter.js` | Serve Prometheus metrics (reads from DB) |
| `extract-modelsdev.js` | Scrape models.dev via Playwright → `modelsdev-free-models.json` |
| `extract-groq.js` | Scrape Groq docs via Playwright → `groq-models.json` |
| `extract-openrouter-categories.js` | Scrape OpenRouter model categories/rankings → `data/openrouter-categories.json` |
| `snapshot-openrouter-catalog.js` | Snapshot full OpenRouter model catalog (344+ models) to `data/openrouter-catalog.json` |
| `import-openrouter-categories.js` | Import `data/openrouter-categories.json` → `datapoint_model_features.best_for` |
| `import-groq.js` | Import groq-models.json → super_models + datapoint_models |
| `kill-port.js` | Kill process on a given port |
| `validate-jsonc.js` | Validate opencode.jsonc JSONC syntax |
| `get-auth-key.js` | Read a provider API key from auth.json |
| `sync-auth-keys.js` | Sync API keys from auth.json into opencode.jsonc |
| `cleanup-snapshots.js` | Rotate old model snapshots |
| `migrate-v1-to-v2.js` | Migrate v1 schema → v2 |
| `install-metrics-service.js` | Install metrics exporter as a Windows service |
