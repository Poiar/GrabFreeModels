---
name: rank-models
description: Rebuild role rankings in PostgreSQL. Triggers: "rank models", "re-rank", "rankings wrong".
---

# Rank Models

```bash
npm run rank                # Free, dry-run
npm run rank:apply          # Free, write to DB
npm run rank:paid           # Paid, dry-run
npm run rank:paid:apply     # Paid, write to DB
```

After applying: `npm run check-rankings` (must exit 0).

## Eligibility

Free models: `is_free=true`, `is_removed=false`, `status_result='working'`, `supports_tools=true`.
Paid models: `is_free=false`, `is_removed=false` only (no status or tools requirement).

## Algorithm

Scoring engine lives in `scripts/utils/ranker-core.js`. Composite formula:

```
score = (ctxContrib + tagBonus + qualityTotal + freshness) × quantFactor
```

- **ctxContrib**: `(context_length / maxObservedContext) × roleCtxWeight`
- **tagBonus**: fraction of role keywords matching model's `best_for` tags, in [0, 1]
- **qualityTotal**: `intel + coding + speed − latency`, with sigmoid squash and tanh soft cap (preserves high-end differentiation)
- **freshness**: release recency bonus (+1.5 → −3.0), benchmark score time decay (90-day half-life)
- **quantFactor**: quantization multiplier (0.98–1.0)

## Roles

| Role            | ctxWeight | Tag Keywords                                               |
| --------------- | --------- | ---------------------------------------------------------- |
| **model**       | 1.2       | agentic, tool, reasoning, current default, general purpose |
| **build**       | 0.6       | coding, code, refactor, agentic, tool                      |
| **general**     | 0.5       | general, multimodal, fast, lightweight, chinese            |
| **small_model** | 0.0       | lightweight, ultra-lightweight, fast, quick, small         |
| **explore**     | 0.3       | thinking, reasoning, multimodal, new                       |

## Source variants

The ranking system supports multiple scoring variants (`combined`, `artificial_analysis`, `modelsdev`, `_benchmarks`), each using different score sources and weighting strategies. Variants are stored in `_role_rankings._variants`.
