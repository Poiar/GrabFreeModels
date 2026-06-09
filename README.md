# GrabFreeModels

Discovers, tests, ranks, and syncs free and paid LLM models across 60+ providers. Imports from [models.dev](https://models.dev) and exposes a live Vue 3 dashboard at `:5173`.

Key data sources: direct provider API scraping, [models.dev](https://github.com/anomalyco/models.dev) (the open-source AI model catalog), and OpenRouter.

## How it works

```
Provider APIs ──┐
models.dev ─────┤
OpenRouter ─────┼── sync ──→ Postgres ──→ Express API ──→ Vue 3 SPA
HF Hub ─────────┤              │  ▲            :3001           :5173
External lists ─┘              │  │
                               ▼  │
                          validate ──→ rank ──→ export ──→ git snapshot

Every model gets a `super_model` (canonical identity) with per-provider `datapoint_model` rows. The nightly pipeline syncs free and paid models, validates free endpoints, re-ranks by role, snapshots the DB, and optionally alerts on changes.

## Data Model

```
super_models                    datapoint_models
┌──────────────────────┐       ┌─────────────────────────┐
│ id                   │◄──────│ super_model_id           │
│ name (clean, no org) │       │ full_id (provider/remote)│
│ slug                 │       │ context_length           │
│ creator              │       │ supports_tools           │
│ base_creator         │       │ status_result            │
│ family               │       │ is_free                  │
│ base_model           │       └──────────┬──────────────┘
└──────────────────────┘                  │
                               ┌──────────▼──────────────┐
                               │ datapoint_model_sources  │
                               │ (provenance: which       │
                               │  registry/provider       │
                               │  supplied this instance) │
                               └─────────────────────────┘
```

- **Creator**: organization that built the model (e.g., Meta, Google, DeepSeek). Normalized via a 100+ entry alias map in `build-models-data.js`.
- **Base creator**: original model maker for derived/fine-tuned models, detected via slug pattern matching in `backfill-base-creators.js`.
- **Base model**: parent super_model slug from which this model was fine-tuned/derived. A proper column on `super_models`, backfilled by `backfill-base-models.js` via substring matching.
- **Source provenance**: every datapoint tracks which sources (API providers, community lists) contributed it via `datapoint_model_sources`.
- **Import pipeline**: 3-pass slug matching (direct → provider-stripped → routing-prefix-stripped) in `import-external-models.js`, with creator extraction and org-prefix stripping.

## Quick Start

```bash
npm run dev:all                        # DB API + Vite dev server
npm run build                          # Prep + install + type-check + production build

# Pipeline scripts (all support --dry-run default, --apply to write)
node scripts/sync-models.js            # Fetch from providers + models.dev, diff vs DB
node scripts/validate-free-models.js   # Test model endpoints against live APIs
node scripts/rank-models.js            # Rebuild _role_rankings (free)
node scripts/rank-paid-models.js       # Rebuild _role_rankings_paid (paid)
npm run re-rank                        # Full re-rank: backfill → rank → metadata → check
node scripts/nightly-maintenance.js    # Full nightly pipeline
npm run nightly:dry                    # Nightly without DB writes
```

## Frontend

Vue 3 + Vite + Pinia SPA with a premium dark theme.

```bash
cd vue-model-manager
npm run dev           # Vite dev server with HMR (port 5173, proxies /api → 3001)
npm run build         # Type-check + production build → dist/
```

### Routes

| Route               | View                    | Description                                                    |
| ------------------- | ----------------------- | -------------------------------------------------------------- |
| `#/`                | Model Instances         | Filterable grid of all datapoint instances by provider/status  |
| `#/dashboard`       | Dashboard               | Hero stats, quick search, critical issues, top ranked/scored, validation deltas, recently active |
| `#/supermodels`     | Super Models            | Card list grouped by canonical model with creator, badges, nav |
| `#/model/:slug`     | Model Detail            | Single super model with all provider instances                 |
| `#/creators`        | Creators                | Models grouped by creator/lab with icons                       |
| `#/creator/:id`     | Creator Detail          | Single creator with all their models                           |
| `#/fine-tuners`     | Fine Tuners             | Creators that fine-tune base models                            |
| `#/fine-tuner/:id`  | Fine Tuner Detail       | Single fine-tuner with their derived models                    |
| `#/families`        | Families                | Models grouped by lineage family (Llama, Qwen, etc.)           |
| `#/family/:name`    | Family Detail           | Single family with all member models                           |
| `#/base-models`     | Base Models             | Foundation models ranked by derivative count                   |
| `#/base-model/:name`| Base Model Detail       | Single base model with its derivatives                         |
| `#/providers`       | Providers               | Provider list with health indicators                           |
| `#/provider/:slug`  | Provider Detail         | Single provider with all its model instances                   |
| `#/rankings`        | Rankings (Free)         | Per-role ranking with waterfall score breakdown                |
| `#/rankings-paid`   | Rankings (Paid)         | Same, for paid models                                          |
| `#/issues`          | Issues                  | Known issues per model + seismograph timeline                  |
| `#/compare`         | Compare                 | Multi-model radar comparison across 6 dimensions               |

## Project Structure

```
scripts/                    # Node.js pipeline scripts (CommonJS)
  sync-models.js            #   Fetch from 60+ providers, diff against DB
  validate-free-models.js   #   Test model endpoints against live APIs
  rank-models.js            #   Deterministic role ranking algorithm (free)
  rank-paid-models.js        #   Deterministic role ranking algorithm (paid)
  backfill-base-models.js    #   Detect fine-tune lineage via substring matching
  inherit-families.js        #   Walk base_model chains to inherit family assignments
  nightly-maintenance.js    #   Full nightly pipeline orchestrator
  build-models-data.js      #   Shared data builder (API + all scripts)
  fetch-modelsdev-models.js #   Ingest models.dev catalog into sources pipeline
  import-modelsdev.js       #   Upsert super_models from models.dev
  import-modelsdev-backfill.js #  Fuzzy-match existing supers to models.dev
  import-external-models.js #   Import from external model registries
  fetch-huggingface-hub.js  #   Scrape HF Hub for free inference models
  fetch-openllm-leaderboard.js # Fetch Open LLM Leaderboard data
  generate-dashboard.js     #   HTML dashboard of provider health
  metrics-exporter.js       #   Prometheus metrics endpoint (:9090)
  model-summary.js          #   Text overview of model counts
  check-rankings.js         #   Sanity-check _role_rankings
  export-from-pg.js         #   Export PG → JSON snapshot
  cleanup-snapshots.js      #   Rotate old snapshots
server/                     # Express API (port 3001)
  db.js                     #   Neon-aware Postgres pool
  routes/data.js            #   GET /api/data, GET /api/health
db/                         # PostgreSQL schema v2 + migrations
  schema.sql                 #   Canonical schema with seed data
  migrations/                #   Ordered schema migrations
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

- **[models.dev](https://models.dev)** — Community-contributed AI model database (TOML → JSON API). Built by the SST/anomalyco team with Bun + TypeScript. GrabFreeModels imports its free-model subset as a canonical reference.
- **[free-llm-api-resources](https://github.com/cheahjs/free-llm-api-resources)** — Community-curated list of free LLM endpoints. Ingested as a community-list source in the provenance pipeline.
