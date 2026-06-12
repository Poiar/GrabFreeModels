# GrabFreeModels

Discovers, tests, ranks, and syncs free LLM models across 18+ providers. Imports from [models.dev](https://models.dev) and [isaiprofitable.com](https://isaiprofitable.com), and exposes a live Vue 3 dashboard at `:5173`.

Key data sources: direct provider API scraping, [models.dev](https://github.com/anomalyco/models.dev) (open-source AI model catalog), OpenRouter, and [Is AI Profitable Yet?](https://isaiprofitable.com) (AI industry financials).

## How it works

```
Provider APIs ──┐
models.dev ─────┤
OpenRouter ─────┼── sync ──→ Postgres ──→ Express API ──→ Vue 3 SPA
Community lists ┘              │  ▲            :3001           :5173
                               ▼  │
                          validate ──→ rank ──→ export ──→ git snapshot

Only free models are tested. Paid models are presumed working.
```

<!-- AUTO:pipeline-summary -->

Every model gets a `super_model` (canonical identity) with per-provider `datapoint_model` rows. The nightly pipeline (29 steps, 3 critical) syncs free and paid models, validates free endpoints, re-ranks by role, imports company financials, snapshots the DB, and commits to git.

<!-- /AUTO -->

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
│ base_model           │       │ is_removed               │
│ derivation_method    │       │ failure_category         │
└──────────────────────┘       └──────────┬──────────────┘
                                          │
                               ┌──────────▼──────────────┐
                               │ datapoint_model_sources  │
                               │ (provenance junction)    │
                               └─────────────────────────┘
                               ┌──────────────────────────┐
                               │ test_observations        │
                               │ (per-request test log:   │
                               │  status, latency_ms,     │
                               │  error_type, tested_at)  │
                               └──────────────────────────┘
```

- **Creator**: organization that built the model (e.g., Meta, Google, DeepSeek).
- **Provider**: API host serving model instances (e.g., OpenRouter, Groq, Anthropic).
- **Organization**: unified concept merging creator + provider data. Entities like Anthropic, Google, and OpenAI exist as both — the API returns a single `organizations` array with `kind: 'creator' | 'provider' | 'both'`.
- **Base model**: parent super_model slug from which a model is fine-tuned/derived.
- **Source provenance**: every datapoint tracks which sources (API providers, community lists) contributed it via `datapoint_model_sources`.
- **Testing**: only free models are validated against live APIs. Paid models are set to `presumed working`.
- **Financials**: AI industry spend/revenue/PNL data is scraped from `isaiprofitable.com` and stored in the `metadata` table (`_company_financials`), with daily history snapshots (`_company_financials_history`).

## Quick Start

<!-- AUTO:quick-start -->

```bash
npm run dev:all                        # DB API (port 3001) + Vite dev server (port 5173)
npm run build                          # Type-check + production build

# Pipeline scripts (all default to --dry-run, add --apply to write)
npm run sync                           # Dry-run: diff free models from providers vs DB
npm run sync:apply                     # Apply: insert new + flag removed models
npm run validate                       # Dry-run: test model API endpoints
npm run validate:apply                 # Apply: write test results + auto re-rank
npm run rank                           # Dry-run: rebuild role rankings (free)
npm run rank:apply                     # Apply: write free rankings to DB
npm run rank:paid                      # Dry-run: rebuild role rankings (paid)
npm run rank:paid:apply                # Apply: write paid rankings to DB
npm run re-rank                        # Full re-rank: backfill context → rank → backfill metadata → check
npm run nightly                        # Full 28-step nightly pipeline
npm run nightly:dry                    # Nightly without DB writes
npm run financials                     # Scrape AI company financials from isaiprofitable.com
npm run financials:apply               # ... and write to DB
npm run summary                        # Text overview of model counts and ranking sizes
```

<!-- /AUTO -->

## Frontend

Vue 3 + Vite + Pinia SPA with a premium dark theme.

```bash
cd vue-model-manager
npm run dev           # Vite dev server with HMR (port 5173, proxies /api → 3001)
npm run build         # Type-check + production build → dist/
```

### Routes

<!-- AUTO:routes-table -->

| Route                    | View               | Description                                                     |
| ------------------------ | ------------------ | --------------------------------------------------------------- |
| `#/`                     | Instances          | Filterable grid of all free model datapoints by provider/status |
| `#/dashboard`            | Dashboard          | Hero stats, AI financials, top ranked/scored, validation, flaky |
| `#/creators`             | Creators           | Models grouped by creator/lab                                   |
| `#/creator/:id`          | CreatorDetail      | Single creator with all their models                            |
| `#/derivatives`          | Derivatives        | Fine-tuned/derived models grouped by method                     |
| `#/derivative/:id`       | DerivativeDetail   | Single derivative with base model chain                         |
| `#/org/:id`              | OrganizationDetail | Unified organization page (creator + provider facets)           |
| `#/provider/:slug`       | ProviderDetail     | Single provider with all instances, latencies, failures         |
| `#/base-models`          | BaseModels         | Foundation models ranked by derivative count                    |
| `#/base-model/:name`     | BaseModelDetail    | Base model with its derivatives                                 |
| `#/compare`              | Compare            | Two-model side-by-side radar, capabilities, benchmarks, MD copy |
| `#/advanced-search`      | AdvancedSearch     | Faceted search across all dimensions                            |
| `#/benchmarks`           | Benchmarks         | Intelligence/speed/cost benchmark leaderboard                   |
| `#/rankings`             | Rankings           | Free/paid toggle, per-role rankings with score breakdown        |
| `#/model/:slug`          | ModelDetail        | Single model with validation bar, rankings, benchmarks          |
| `#/supermodels`          | Models             | Card list grouped by canonical model                            |
| `#/supermodel/:slug`     | SuperModelDetail   | Single super model with provider instances                      |
| `#/providers`            | Providers          | Provider list with health indicators                            |
| `#/compare-providers`    | CompareProviders   | Side-by-side provider comparison                                |
| `#/families`             | Families           | Models grouped by lineage family                                |
| `#/family/:name`         | FamilyDetail       | Single family with all member models                            |
| `#/scores`               | Scores             | Raw model scores explorer                                       |
| `#/providers/onboarding` | ProviderOnboarding | Provider onboarding checklist/wizard                            |
| `#/lineage`              | Lineage            | Interactive model family tree                                   |
| `#/playground`           | Playground         | Test models in-browser                                          |
| `#/tags`                 | Tags               | Browse models by capability tags                                |
| `#/activity`             | Activity           | Recently tested and updated models                              |
| `#/picker`               | ModelPicker        | 4-step wizard: Task → Capabilities → Context → Results          |
| `#/rate-limits`          | RateLimits         | Compare rate limits across providers                            |
| `#/providers/status`     | ProviderStatus     | Grid of provider health with donut charts                       |
| `#/admin`                | Admin              | Trigger pipeline tasks from the browser (auth required)         |

<!-- /AUTO -->

## Project Structure

<!-- AUTO:scripts-list -->

```
scripts/                         # Node.js pipeline scripts (CommonJS)
  builders/                       #   Decomposed data builder modules
  build-models-data.js           #   Shared data builder (API + all scripts)
  build-organizations.js         #   Unified Organization builder (creator + provider)
  sync-models.js                 #   Fetch from 18+ providers, diff vs DB
  validate-free-models.js        #   Test free model endpoints against live APIs
  rank.js                        #   Deterministic role ranking (free + paid, --paid)
  import-is-ai-profitable.js     #   Scrape AI company financials from isaiprofitable.com
  import-modelsdev.js            #   Upsert super_models from models.dev
  import-modelsdev-backfill.js   #   Fuzzy-match existing supers to models.dev
  import-external-models.js      #   Import from external model registries
  import-modelsdev-benchmarks.js #   Import benchmark scores from models.dev
  fetch-modelsdev-models.js      #   Fetch models.dev catalog
  fetch-external-sources.js      #   Fetch community source lists
  fetch-huggingface-hub.js       #   Scrape HF Hub for free inference models
  fetch-openllm-leaderboard.js   #   Fetch Open LLM Leaderboard data
  nightly-maintenance.js         #   Full 29-step nightly pipeline orchestrator
  nightly-summary.js             #   Text summary for Slack/Discord delivery
  backfill-base-models.js        #   Detect fine-tune lineage via substring matching
  backfill-base-creators.js      #   Detect base creators for derived models
  inherit-families.js            #   Walk base_model chains to inherit family assignments
  backfill-context.js            #   Backfill missing context lengths
  check-degradation.js           #   Detect latency/failure rate regressions
  check-rankings.js              #   Sanity-check role rankings
  diff-rankings.js               #   Compare rankings across runs
  export-from-pg.js              #   Export PG → JSON snapshot
  cleanup-snapshots.js           #   Rotate old snapshots
  generate-dashboard.js          #   HTML dashboard of provider health
  metrics-exporter.js            #   Prometheus metrics endpoint (:9180)
  model-summary.js               #   Text overview of model counts
server/                          # Express API (port 3001)
  db.js                          #   Neon-aware Postgres pool (max 3, 60s keepalive)
  routes/data.js                 #   GET /api/data, /api/data/paid, /api/rankings, etc.
db/                              # PostgreSQL schema v2
  schema.sql                     #   Canonical schema + seed data
  migrations/                    #   Ordered schema migrations
vue-model-manager/               # Vue 3 + Pinia frontend (ESM/TypeScript)
snapshots/                       # Timestamped JSON exports
```

<!-- /AUTO -->

## Key Design Decisions

- **Free only tested**: `validate-free-models.js` only tests models with `is_free = true`. Paid models are stored in the DB as `status_result = 'working'` with detail `'Presumed working (not tested)'`. The UI reflects this distinction everywhere.
- **Cooldown decision tree**: 401/403 auth errors → 30min cooldown (key is dead), 429 → 1min (backoff), 5xx → 5min (transient), timeout → 2min, network_error → 10min, not_found → 24h, client_errors → no cooldown. Auth errors are never retried.
- **Soft cap ranking**: Quality scores use `tanh` soft clamping instead of a hard ceiling, preserving differentiation at the high end.
- **Adaptive context radar**: Radar chart context axis reference is `max(2M tokens, observed max)` — auto-scales as context windows grow.
- **Historical financials**: Each `--apply` run appends a daily snapshot to `_company_financials_history`, enabling PNL trend sparklines.

## Environment Variables

| Variable                  | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`            | Neon Serverless Postgres connection string               |
| `WEBHOOK_URL`             | Alert webhook for nightly pipeline                       |
| `GRAB_FREE_MODELS_ALERTS` | JSON blob with `webhook`, `slack`, `teams`, `email` keys |

## Related Projects

- **[models.dev](https://models.dev)** — Community-contributed AI model database. GrabFreeModels imports its free-model subset.
- **[free-llm-api-resources](https://github.com/cheahjs/free-llm-api-resources)** — Community-curated list of free LLM endpoints. Ingested as a community-list source.
- **[Is AI Profitable Yet?](https://isaiprofitable.com)** — Tracks AI industry spend, revenue, and PNL. Financials imported nightly.
