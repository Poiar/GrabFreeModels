# GrabFreeModels

Discovers, tests, ranks, and syncs free LLM models across 18+ providers. Powers [models.dev](https://models.dev) data ingestion and exposes a live Vue 3 dashboard at `:5173`.

Key data sources: direct provider API scraping, [models.dev](https://github.com/anomalyco/models.dev) (the open-source AI model catalog), HuggingFace Hub, OpenRouter categories, and the Open LLM Leaderboard.

## How it works

```
Provider APIs ──┐
models.dev ─────┤
HF Hub ─────────┼── sync ──→ Postgres ──→ Express API ──→ Vue 3 SPA
Mastra ─────────┤              │  ▲            :3001           :5173
Leaderboards ───┘              │  │
                               ▼  │
                          validate ──→ rank ──→ export ──→ git snapshot
                               │
                          import-external-models
                          (3-pass slug match +
                           creator extraction +
                           source provenance links)
```

Every free model gets a `super_model` (canonical identity) with per-provider `datapoint_model` rows. The nightly pipeline validates endpoints, re-ranks by role, snapshots the DB, and optionally alerts on changes.

## Data Model

```
super_models                    datapoint_models
┌──────────────────────┐       ┌─────────────────────────┐
│ id                   │◄──────│ super_model_id           │
│ name (clean, no org) │       │ full_id (provider/remote)│
│ slug                 │       │ context_length           │
│ creator              │       │ supports_tools           │
│ base_creator         │       │ status_result            │
└──────────────────────┘       │ is_free                  │
                               └──────────┬──────────────┘
                                          │
                               ┌──────────▼──────────────┐
                               │ datapoint_model_sources  │
                               │ (provenance: which       │
                               │  registry/provider       │
                               │  supplied this instance) │
                               └─────────────────────────┘
```

- **Creator**: organization that built the model (e.g., Meta, Google, DeepSeek). Normalized via a 100+ entry alias map in `build-models-data.js`.
- **Base creator**: original model maker for derived/fine-tuned models, traced from HuggingFace architecture families.
- **Source provenance**: every datapoint tracks which sources (API providers, community lists, HF Hub, leaderboards) contributed it via `datapoint_model_sources`.
- **Import pipeline**: 3-pass slug matching (direct → provider-stripped → routing-prefix-stripped) in `import-external-models.js`, with creator extraction and org-prefix stripping.

## Quick Start

```bash
npm run dev:all                        # DB API + Vite dev server
npm run build                          # Type-check + production build

# Pipeline scripts (all support --dry-run default, --apply to write)
node scripts/sync-models.js            # Fetch from providers + models.dev, diff vs DB
node scripts/validate-free-models.js   # Test model endpoints against live APIs
node scripts/rank-models.js            # Rebuild _role_rankings
node scripts/re-rank.js                # Full re-rank: backfill → rank → metadata → check
node scripts/nightly-maintenance.js    # Full nightly pipeline
npm run nightly:dry                    # Nightly without DB writes
```

## Frontend

Vue 3 + Vite + Pinia SPA with a premium dark theme and zero additional npm dependencies (CSS/SVG/Canvas only).

```bash
cd vue-model-manager
npm run dev           # Vite dev server with HMR (port 5173, proxies /api → 3001)
npm run build         # Type-check + production build → dist/
```

### Routes

| Route               | View                    | Description                                                    |
| ------------------- | ----------------------- | -------------------------------------------------------------- |
| `#/`                | Model Instances         | Filterable grid of all datapoint instances by provider/status  |
| `#/dashboard`       | Dashboard               | Hero stats, provider ecosystem grid, pulse waveform            |
| `#/supermodels`     | Super Models            | Card list grouped by canonical model with creator, badges, nav |
| `#/creators`        | Creators                | Models grouped by creator/lab with icons                       |
| `#/creator/:id`     | Creator Detail          | Single creator with all their models                           |
| `#/providers`       | Providers               | Provider list with health indicators                           |
| `#/rankings`        | Rankings (Free)         | Per-role ranking with waterfall score breakdown                |
| `#/rankings-paid`   | Rankings (Paid)         | Same, for paid models                                          |
| `#/issues`          | Issues                  | Known issues per model + seismograph timeline                  |
| `#/compare`         | Compare                 | Multi-model radar comparison across 6 dimensions               |

## Project Structure

```
scripts/                    # Node.js pipeline scripts (CommonJS)
  sync-models.js            #   Fetch from 18+ providers, diff against DB
  validate-free-models.js   #   Test model endpoints against live APIs
  rank-models.js            #   Deterministic role ranking algorithm
  nightly-maintenance.js    #   Full nightly pipeline orchestrator
  build-models-data.js      #   Shared data builder (API + all scripts)
  fetch-modelsdev-models.js #   Ingest models.dev catalog into sources pipeline
  import-modelsdev.js       #   Upsert super_models from models.dev
  import-modelsdev-backfill.js #  Fuzzy-match existing supers to models.dev
  import-external-models.js #   Import from external model registries
  fetch-huggingface-hub.js  #   Scrape HF Hub for free inference models
  fetch-openllm-leaderboard.js # Fetch Open LLM Leaderboard data
  re-rank.js                #   Full re-rank pipeline wrapper
  generate-dashboard.js     #   HTML dashboard of provider health
  metrics-exporter.js       #   Prometheus metrics endpoint (:9090)
  summary.js                #   Text overview of model counts
  check-rankings.js         #   Sanity-check _role_rankings
  export-from-pg.js         #   Export PG → JSON snapshot
  cleanup-snapshots.js      #   Rotate old snapshots
server/                     # Express API (port 3001)
  db.js                     #   Neon-aware Postgres pool
  routes/data.js            #   GET /api/data, GET /api/health
db/                         # PostgreSQL schema v2 + migrations
vue-model-manager/          # Vue 3 + Pinia frontend (ESM/TypeScript)
snapshots/                  # Timestamped JSON exports
```

## Environment Variables

| Variable                  | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`            | Neon Serverless Postgres connection string                |
| `WEBHOOK_URL`             | Alert webhook for nightly pipeline                        |
| `GRAB_FREE_MODELS_ALERTS` | JSON blob with `webhook`, `slack`, `teams`, `email` keys  |

## Related Open-Source Projects

- **[models.dev](https://models.dev)** — Community-contributed AI model database (TOML → JSON API). GrabFreeModels imports its free-model subset as a canonical reference and contributes back via the source provenance pipeline. Built by the SST/anomalyco team with Bun + TypeScript.
- **Open LLM Leaderboard** — Public table of free models with pricing, context length, and benchmarks. (Python + FastAPI)
- **HuggingFace Model Hub** — Filtered view for models with free hosted inference API. (JavaScript/React)
- **Free-LLM-Models** — Curated list of free endpoints with JSON data files. (Markdown + Static)
- **Awesome-LLM** — Awesome-list section linking free/open-source models and providers. (Markdown)
