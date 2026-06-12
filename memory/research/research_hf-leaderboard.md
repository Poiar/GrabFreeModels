---
name: research-hf-leaderboard
description: 'HuggingFace Open LLM Leaderboard — benchmark normalization, missing score handling, combination methods'
metadata:
  node_type: memory
  type: reference
  originSessionId: 44d00769-02b1-4e82-9bad-40385a18dbea
---

# HuggingFace Open LLM Leaderboard Methodology

Source: huggingface.co/spaces/open-llm-leaderboard — researched 2026-06-09

## 1. Benchmark normalization

Each benchmark raw score (0-1 accuracy) is independently mapped to 0-100 by multiplying by 100:

- IFEval, BBH, MATH Lvl 5, GPQA, MUSR, MMLU-PRO

This is per-benchmark linear rescaling, NOT generic min-max, z-score, or percentile normalization.

## 2. Combination formula

Simple equal-weight arithmetic mean:

```
Average = (IFEval + BBH + MATH_Lvl_5 + GPQA + MUSR + MMLU_PRO) / 6
```

No weighted average, geometric mean, trimmed mean, or variance weighting.

## 3. Missing scores

Missing = 0. `data.get(key, 0)` — no partial averaging, no flag distinguishing "scored zero" from "not evaluated." Missing benchmarks drag down the average.

## 4. Staleness

No explicit staleness communication. Data cached for 300s (5 min). `Submission Date` stored but not used for ranking decay. Old and new models mixed in same ranking.

## 5. Techniques summary

| Technique                     | Used? |
| ----------------------------- | ----- |
| Min-max scaling               | No    |
| Z-score standardization       | No    |
| Percentile rank               | No    |
| Per-benchmark 0-100 rescaling | Yes   |
| Equal-weight mean             | Yes   |

## Improvements for GrabFreeModels ranking

### Replace hardcoded normalization divisors

Current: `intelligence/40`, `speed/80`, `coding/30`, `latency/4`
Better: normalize against observed population max (or μ + 3σ)

### Fix clamping plateaus

`Math.min(speed/80, 1.5)` creates indistinguishable scores for fast models. Use sigmoid: `2 * sigmoid(x/μ) - 1`

### Track missing scores explicitly

Current: missing benchmark = silently skipped
Better: distinguish "evaluated/0" from "not evaluated"; penalize incomplete coverage

### Dynamic context normalization

Current: `CTX_NORM = 1048756` (hardcoded)
Better: `context_length / max_observed_context` (data-driven, keeps in [0, 1])

### Normalize tag bonuses

Current: +1 per matching keyword (unbounded)
Better: `matched / total_keywords` capped at 1.0

### Time-decay freshness weight

`freshness = exp(-λ * days_since_benchmark)` with ~90-day half-life
