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
- `test-model-auth` — test models via direct API calls with auth keys
- `model-recommendations` — ALWAYS consult before suggesting any model
- `parallel-todos` — use for independent parallel subagent tasks
- `validate-free-models` — test and validate free model statuses
- `sync-models` — fetch latest free models from providers, diff against JSON
- `validate-jsonc` — validate opencode.jsonc syntax before session end
- `secret-scanning` — run Gitleaks locally, update allowlist, validate config, handle CI failures
- `vue-gotchas` — Vue 3 + Pinia framework gotchas

## Lean Files Policy

- **One source of truth**: Each fact lives in exactly one file. Point to it, don't duplicate it.
- **No stale snapshots**: Never hardcode point-in-time data (counts, "as of" dates, "currently" lists). Reference the live source instead.
- **Skills own their domain**: AGENTS.md points to skills; skills contain the details. No content overlap.
- **Code examples must earn their place**: If the pattern is already taught elsewhere or is self-evident from the rules, don't include it.
- **Frontmatter stays concise**: Skill descriptions mention *what* triggers them, not implementation details.

## Vue Project

- `vue-model-manager/` — Vue 3 + Vite + Pinia SPA that visualizes `available-models.json`
- `npm run dev` starts dev server at `http://localhost:5173`
- `npm run build` produces production build in `dist/`
- Consult `vue-gotchas` skill when writing or reviewing Vue code

## Scripts

All scripts live in `scripts/`:

| Script | Purpose |
|--------|---------|
| `sync-models.js` | Fetch latest free models from providers, diff against JSON. `--apply` to write changes |
| `validate-free-models.js` | Re-test rate-limited/untested models (burst + delayed). `--apply` to write results |
| `nightly-maintenance.js` | Scheduled validation pipeline — validate, check rankings, generate summary, commit, push, alert. Run via Task Scheduler / cron |
| `check-rankings.js` | Sanity-check `_role_rankings` against actual model statuses |
| `model-summary.js` | Generate human-readable summary of all tracked models |
| `metrics-exporter.js` | Prometheus HTTP metrics exporter for provider health. Default port 9180 |
| `generate-dashboard.js` | Generate HTML dashboard showing provider health and rankings |
| `health-badge.js` | Generate Shields.io health badge JSON |
| `cleanup-snapshots.js` | Rotate old snapshots, keep last 30 days |
| `install-metrics-service.js` | Install metrics exporter as a Windows service |
| `kill-port.js` | Kill any process listening on a given port |
