---
name: third-party-recommendations
description: "Actionable improvements for GrabFreeModels drawn from LiteLLM, LMSYS, Langfuse, and HF Leaderboard"
metadata: 
  node_type: memory
  type: project
  originSessionId: 44d00769-02b1-4e82-9bad-40385a18dbea
---

# Recommendations from third-party projects

## Ranking algorithm (from LMSYS + HF Leaderboard)

1. **Replace hardcoded normalization divisors** (`intelligence/40`, `speed/80`, `coding/30`, `latency/4`) with population-adaptive normalization. At minimum, divide by the observed max in the current model set. Better: z-score against current μ/σ. These constants will drift stale as models improve.

2. **Fix clamping plateaus.** `Math.min(speed/80, 1.5)` makes all models above 120 tok/s indistinguishable. Use a sigmoid squash (`2 * sigmoid(x/μ) - 1`) to preserve differentiation at the high end.

3. **Dynamic context normalization.** Replace `CTX_NORM = 1048756` with `context_length / max_observed_context` so it's always in [0, 1] regardless of how large context windows grow.

4. **Normalize tag bonuses.** Currently +1 per matching keyword (unbounded). Change to `matchedKeywords / totalKeywordsPerRole` capped at 1.0 so a model matching 2/8 keywords doesn't get less bonus than one matching 3/3.

5. **Add confidence intervals via bootstrapping.** Resample benchmark scores with replacement N times, recompute rankings, show 2.5th-97.5th percentile band. Models with few benchmarks get wide CIs naturally.

6. **Time-decay benchmark scores.** `freshness = exp(-λ * days_since_score)` with ~90-day half-life. Old benchmark results shouldn't permanently prop up a model's ranking.

## Provider abstraction (from LiteLLM)

7. **Declarative provider config.** Move provider-specific details (base URL, auth env var, param mappings, special handling flags) out of code and into a JSON config file. LiteLLM's `providers.json` format is the template.

8. **Typed error classification.** Classify validation failures into categories (auth, rate-limit, context-window, timeout, server-error) to decide retry vs. cooldown vs. mark-dead. LiteLLM's error heuristic matching is the pattern.

9. **Cooldown decision tree.** 429 → cooldown with TTL. 401 → cooldown (broken key). 5xx → cooldown. 4xx client errors → do NOT cooldown. Currently everything is a binary working/failed.

10. **Health state with "stale = healthy" semantics.** If a provider hasn't been checked recently, assume healthy rather than leaving it in a stale failed state that cascades.

## Observability (from Langfuse)

11. **Model each nightly test as a structured observation.** Fields: `provider`, `modelName`, `latency`, `status` (pass/fail), `errorType`, `costDetails`, `metadata`. Store these as rows in a flat table, not nested JSON in metadata.

12. **Track latency percentiles per model over time.** p50/p95/p99 latency per model, per day, in a line chart. Currently there's no latency history — only pass/fail.

13. **Degradation alerting on the nightly pipeline.** Compare latest run against 7-day rolling baseline. If p95 latency > 2σ above baseline or failure rate jumps >20%, flag it. Currently there's no trend-based alerting.

14. **Per-model failure rate dashboard.** Not just "which models are down right now" but "which models have been flaky over the past week/month."

## Frontend (from OpenRouter + ollama)

15. **Model-to-model comparison view.** Side-by-side diff of two models: pricing, context, benchmarks, provider count, best_for tags. OpenRouter's model detail pages do this well.

16. **Flat, searchable catalog with facets.** ollama's model library approach: filter by family, quant size, param count, modality. The search bar exists but faceted filtering is thin.
