---
name: rank-models
description: Use when ranking, re-ranking, or validating role-based model rankings. Triggers: "rank models", "re-rank", "update rankings", "rankings wrong", "model ordering", "regenerate rankings".
---

# Rank Models

Rebuilds `_role_rankings` in PostgreSQL metadata using a deterministic tag+context scoring algorithm. Also exports to JSON for git history.

## Prerequisites

- `node scripts/check-rankings.js` — run after ranking to validate correctness
- `validate-free-models` skill — run first if model statuses may have changed

## Ranking Eligibility

A model MUST meet **all** criteria to be ranked:

| Criteria | Required |
|----------|----------|
| `is_free` | `true` |
| `_removed` | not `true` |
| `status.result` | `"working"` |
| `supports_tools` | `true` |

Models failing any criterion are excluded. Ineligible models that appear in rankings are a bug.

## Algorithm

Each model is scored per role using:

```
score = (context_length / 1M) × ctxWeight + tagBonus
```

Where `tagBonus` = +1 for each `best_for` tag matching the role's keywords.

### Why Not Benchmark Composites?

Composite benchmarks (e.g. AAII) produce identical ordering across all roles — defeating the purpose of role-specific rankings. Tag+context scoring gives meaningfully different orderings per role. If benchmark scores are added in the future, use them only as a **tertiary tiebreaker**.

### Role Weights & Tags

| Role | ctxWeight | Tag Keywords | Sort Logic |
|------|-----------|--------------|------------|
| **model** | 1.2 | agentic, tool, reasoning, current default, general purpose | Best overall — agentic + large context |
| **build** | 0.6 | coding, code, refactor, agentic, tool | Coding-focused, moderate context |
| **general** | 0.5 | general, multimodal, fast, lightweight, chinese | Balanced everyday use — prefer speed over size |
| **small_model** | 0.0 | lightweight, ultra-lightweight, fast, quick, small | Tag-only scoring; context as tiebreaker — prefer small+fast |
| **explore** | 0.3 | thinking, reasoning, multimodal, new | Experimental, diversity |
| **stable** | 0.5 | — | Auto-populated by `backfill-metadata.js`: free + working + tools + tested ≥30 days ago. Sorted by context desc. |

Tiebreaker: higher `context_length` wins.

## Run

```bash
# Preview changes
node scripts/rank-models.js

# Apply new rankings
node scripts/rank-models.js --apply
```

After applying, run `node scripts/check-rankings.js` to validate.

## Post-Rank Checklist

1. Run `check-rankings.js` — must exit 0
2. Verify ineligible models (no tools, removed, broken) are absent
3. Verify `stable` ranking is populated or intentionally empty
