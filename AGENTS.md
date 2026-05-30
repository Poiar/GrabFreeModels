# AGENTS.md - GrabFreeModels workspace

## About

GrabFreeModels is for discovering, testing, ranking, and syncing free LLM models across providers. It tracks verified free models, tests them for reliability, and keeps configuration up to date.

## Config

### opencode
- Global config: `C:\Users\pc\.config\opencode\opencode.jsonc` (NOT `.json`, NOT `.opencode/opencode.json`)
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

## Model Recommendations

- **ALWAYS** consult `model-recommendations` skill before suggesting models
- **NEVER** suggest models that don't natively support OpenAI-style tool calling

### Verified Cloud (Free) Models
- `opencode/deepseek-v4-flash-free` — small tasks, titling
- `opencode/big-pickle` — general purpose
- `opencode/nemotron-3-super-free` — general purpose, fast
- `openrouter/owl-alpha` — general purpose (current universal default)

### Model Inventory (2026-05-30)
- **52 free models** tracked: 26 working, 10 rate-limited, 2 broken, 14 untested
- **24 paid models** tracked for reference
- **14 untested** remaining — need validation when API keys are available

## Model Database

`available-models.json` at `C:\OC\GrabFreeModels\available-models.json` is the single source of truth for tracked models.

### JSON Structure
- `models[]` — all tracked models with id, name, provider, pricing, status, best_for
- `_test_summary` — latest test results with working/broken/rate_limited/schema_issues lists
- `_role_rankings` — ranked model lists per role (model, build, general, small_model, explore). Excludes models that are broken, rate-limited, **or** from providers listed in `_provider_usage` for the current month.
- `_provider_usage` — tracks providers that are fully consumed (rate-limited/out of quota) for a given month. Format: `{ provider_id: { month: "YYYY-MM", reason: string } }`. When a provider is listed here, all its models are excluded from `_role_rankings` regardless of individual status.
- `_known_issues` — non-fatal issues (schema problems, deprecation warnings) with severity + workaround
- `_validation_method` — testing methodology notes and key findings

### Key Operational Lessons
- **OpenRouter API calls must NOT use `openrouter/` prefix** — use `provider/model:free` format
- **Single API call is insufficient** — models can succeed once then 429 on every subsequent request
- **Parallel load causes false 429s** — run burst and delayed phases concurrently, but models sequentially within each phase
- **NVIDIA free tier is huge but noisy** — 117+ models, many are embed/safety/reward, not general-purpose LLMs. Filter to chat/LLM only
- **Cerebras models deprecated 2026-05-27** — still functional but may be removed; track in `_known_issues`
- **HuggingFace router** — no zero-cost pricing flag in API; free models must be tested manually
- **Groq/Together/Fireworks** — no API keys currently available; can be added when keys exist

## Scripts

All scripts live in `scripts/`:

| Script | Purpose |
|--------|---------|
| `sync-models.ps1` | Fetch latest free models from providers, diff against JSON. `-Apply` to write changes |
| `validate-free-models.ps1` | Re-test rate-limited/untested models (burst + delayed). `-Apply` to write results |
| `nightly-maintenance.ps1` | Scheduled validation pipeline — validate, check rankings, generate summary, commit, push, alert. Run via Task Scheduler |
| `check-rankings.ps1` | Sanity-check `_role_rankings` against actual model statuses |
| `model-summary.ps1` | Generate human-readable summary of all tracked models |
| `metrics-exporter.ps1` | Prometheus HTTP metrics exporter for provider health. Default port 9180 |
| `generate-dashboard.ps1` | Generate HTML dashboard showing provider health and rankings |
| `health-badge.ps1` | Generate SVG health badge for README |
| `cleanup-snapshots.ps1` | Rotate old snapshots, keep last 30 days |
| `install-metrics-service.ps1` | Install metrics exporter as a Windows service |

### Common Patterns
```powershell
# Dry-run sync
.\scripts\sync-models.ps1

# Sync and apply
.\scripts\sync-models.ps1 -Apply

# Re-test all rate-limited models
.\scripts\validate-free-models.ps1 -Apply

# Test specific models
.\scripts\validate-free-models.ps1 -Models "model-id:free" -Apply
```

### After Editing available-models.json
Always validate:
```powershell
node -e "JSON.parse(require('fs').readFileSync('C:/OC/GrabFreeModels/available-models.json','utf8')); console.log('Valid JSON')"
```

