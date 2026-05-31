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

## Playing with Playwright (headed browser)

When you need to visually inspect the Vue app at `http://localhost:5173`:

```powershell
cd C:\OC\GrabFreeModels\vue-model-manager
# Quick: get rendered text
node -e "const {chromium} = require('playwright'); (async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://localhost:5173/#/models', {timeout: 15000}); await p.waitForTimeout(5000); const t = await p.innerText('body'); console.log(t.substring(0, 5000)); await b.close(); })().catch(e => console.error(e.message));"
# Screenshot: replace the body-getter with p.screenshot({path:'path/to/shot.png', fullPage:false})
```

- The dev server must be running on port 5173 (`npm run dev`).
- `waitForTimeout(5000)` gives the SPA time to fetch data and render.
- Available as a devDependency (`playwright`) in the vue-model-manager project.
- For a headed (visible browser) view, pass `headless: false` to `chromium.launch()`.

## Vue Project

- `vue-model-manager/` — Vue 3 + Vite + Pinia SPA that visualizes `available-models.json`
- `npm run dev` starts dev server at `http://localhost:5173`
- `npm run build` produces production build in `dist/`
- Consult `vue-gotchas` skill when writing or reviewing Vue code

## Scripts

All scripts live in `scripts/`:

| Script | Purpose |
|--------|---------|
| `sync-models.js` | Fetch latest free models from providers |
| `validate-free-models.js` | Re-test rate-limited/untested models |
| `nightly-maintenance.js` | Scheduled validation pipeline |
| `check-rankings.js` | Sanity-check `_role_rankings` against statuses |
| `model-summary.js` | Generate human-readable model summary |
| `metrics-exporter.js` | Prometheus HTTP metrics exporter |
| `generate-dashboard.js` | Generate HTML dashboard |
| `health-badge.js` | Generate Shields.io health badge |
| `cleanup-snapshots.js` | Rotate old snapshots |
| `install-metrics-service.js` | Install metrics exporter service |
| `kill-port.js` | Kill process on a given port |
