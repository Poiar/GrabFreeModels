---
name: rank-models
description: Use when ranking, re-ranking, or validating role-based model rankings. Triggers: "rank models", "re-rank", "update rankings", "rankings wrong", "model ordering", "regenerate rankings".
---

# Rank Models

Rebuilds `_role_rankings` in `available-models.json` using a deterministic tag+context scoring algorithm.

## Prerequisites

- `check-rankings` skill — run after ranking to validate correctness
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

### On Benchmark Composites vs Role-Specific Ranking

We evaluated using the Artificial Analysis Intelligence Index (AAII) — a composite of 10 benchmarks (GDPval-AA, Terminal-Bench Hard, SciCode, GPQA Diamond, Humanity's Last Exam, etc.) as a primary skill signal. **This was rejected** because:

1. **Flat rankings**: AAII produces identical ordering across all roles since it measures general intelligence, not task-specific fitness.
2. **Small models penalized**: AAII favors large models that score well on broad benchmarks, even when a smaller model is the right fit for a role like `small_model`.
3. **Tag+context is role-diverse**: Different ctxWeights and tag keywords per role give meaningfully different orderings — which is the whole point of role-specific rankings.

The tag+context heuristic is kept as the primary algorithm. If benchmark scores are added in the future, they should be used as a **tertiary sort tiebreaker** (after score and context), not as the primary signal.

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
2. Verify `owl-alpha` is #1 in `model` role
3. Verify `stable` ranking is populated or intentionally empty
4. Verify ineligible models (no tools, removed, broken) are absent
5. Run `node scripts/validate-jsonc.js`
