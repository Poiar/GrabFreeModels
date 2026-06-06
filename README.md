# GrabFreeModels

Discovers, tests, ranks, and syncs free LLM models across providers.

## Quick Start

```bash
node scripts/sync-models.js          # dry-run: see new/removed models
node scripts/sync-models.js --apply  # write changes to DB
node scripts/validate-free-models.js --apply
node scripts/nightly-maintenance.js  # full pipeline
```

## Project Structure

```
scripts/                    # Node.js scripts (one per operation)
skills/                     # opencode skill definitions
docs/                       # reference documentation
vue-model-manager/           # Vue 3 + Pinia frontend
snapshots/                  # timestamped model snapshots (from export-from-pg.js)
```

## Environment Variables

| Variable                  | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `WEBHOOK_URL`             | Alert webhook for nightly pipeline                       |
| `GRAB_FREE_MODELS_ALERTS` | JSON blob with `webhook`, `slack`, `teams`, `email` keys |
| `MODELS_FILE_PATH`        | Deprecated. Metrics exporter now reads from DB directly. |

## Scripts

| Script                       | Purpose                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `sync-models.js`             | Fetch free models from providers, diff against JSON                              |
| `validate-free-models.js`    | Re-test rate-limited/untested models                                             |
| `check-rankings.js`          | Sanity-check `_role_rankings` against model IDs                                  |
| `nightly-maintenance.js`     | Full pipeline: snapshot → validate → backfill → re-rank → check → commit → alert |
| `model-summary.js`           | Quick status overview                                                            |
| `generate-dashboard.js`      | HTML dashboard of provider health                                                |
| `health-badge.js`            | Shields.io health badge JSON                                                     |
| `metrics-exporter.js`        | Prometheus metrics endpoint                                                      |
| `install-metrics-service.js` | Install metrics exporter as Windows service                                      |
| `cleanup-snapshots.js`       | Rotate old snapshots                                                             |
| `kill-port.js`               | Kill process on a given port                                                     |

## Docs

- `docs/provider-details.md` — Provider API endpoints and filtering rules
- `docs/test-interpretation-reference.md` — Test result patterns and status mapping

## Related Open‑Source Projects

A few community projects that also track free LLM models:

- **Open LLM Leaderboard** – Public table of free models with pricing, context length, and basic benchmarks. (Python + FastAPI)
- **Free‑LLM‑Models** – Curated list of free endpoints (OpenRouter, HuggingFace, etc.) with JSON data files. (Markdown + Static site)
- **Awesome‑LLM** – Awesome‑list section linking free/open‑source models and providers. (Markdown)
- **HuggingFace Model Hub** – Filtered view for models with free hosted inference API. (JavaScript/React front‑end)
- **Open‑Model Zoo** – Index of open‑source checkpoints and free inference providers. (Go + SQL)
- **LM‑Studio Catalog** – Shows both locally runnable and hosted free models; integrates with the LM‑Studio desktop client. (Electron + TypeScript)

These links can help users discover additional free model sources beyond what GrabFreeModels aggregates.
