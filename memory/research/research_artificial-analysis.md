---
name: research-artificial-analysis
description: "Artificial Analysis methodology — Intelligence Index v4.0.4 composition, speed/latency measurement, price normalization, visualization patterns"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 44d00769-02b1-4e82-9bad-40385a18dbea
---

# Artificial Analysis Methodology

Source: artificialanalysis.ai — researched 2026-06-09. We scrape their HTML leaderboard in `scripts/scrape-artificial-analysis.js`.

## 1. Data model (what we scrape)

AA's leaderboard table has 8 columns:

| Col | Field | Format | How we store it |
|---|---|---|---|
| 0 | Model name | String | Mapped via `NAME_OVERRIDES` to super_name |
| 1 | Context window | String ("128K", "1M") | `parseContext()` → raw number |
| 2 | Creator | String | Not stored (we derive from our own data) |
| 3 | Intelligence score | 0–100 integer | `model_scores` with `score_type='intelligence'` |
| 4 | Blended price | $/M tokens (float) | `model_scores` with `score_type='blended_price'` |
| 5 | Output speed | Tokens/second (float) | `model_scores` with `score_type='output_speed'` |
| 6 | Latency TTFT | Seconds (float) | Not directly stored as a score |
| 7 | Total response time | Seconds (float) | `model_scores` with `score_type='latency_total'` |

Stored in `model_scores` with `source='artificial_analysis'`, keyed by `(datapoint_model_id, source, score_type)`.

## 2. Intelligence Index v4.0.4 (March 2026)

### Composition: 10 evaluations, 4 equal-weighted categories (25% each)

| Category (25%) | Evaluation | Weight within category | Scoring method |
|---|---|---|---|
| **Agents** | GDPval-AA | 16.7% (of total 25%) | Elo, then `clamp((Elo-500)/2000)` |
| | tau2-Bench Telecom | 8.3% | pass@1 (world state) |
| **Coding** | Terminal-Bench Hard | 16.7% | pass@1 |
| | SciCode | 8.3% | pass@1 (sub-problems) |
| **General** | AA-LCR (Long Context) | 6.25% | pass@1 (equality checker LLM) |
| | AA-Omniscience (Knowledge) | 12.5% | 50% Accuracy + 50% (1 - Hallucination Rate) |
| | IFBench (Instruction Following) | 6.25% | pass@1 |
| **Scientific Reasoning** | HLE | 12.5% | pass@1 (equality checker LLM) |
| | GPQA Diamond | 6.25% | pass@1 (regex extraction) |
| | CritPt (Physics) | 6.25% | pass@1 (official grading server) |

### Normalization method
- Most evaluations produce pass@1 (0–1). GDPval-AA is the exception — pairwise comparisons → Elo rating, then `clamp((Elo-500)/2000)` maps ~500–2500 range into [0, 1].
- Weighted average across all 10 evaluations → 0-100 scale.
- **Population-independent**: scores are against fixed reference points (human baseline, random baseline, theoretical max), NOT percentile within the current model set.
- **Missing-tolerant**: partial benchmark coverage doesn't punish the score — missing evals are excluded from the weighted average.
- Scores only change when a model is re-benched, not when other models improve.
- Top score as of mid-2026: Claude Opus 4.8 Max = 61.

### Key insight for us
Our `intelligence / 40` divisor assumes intelligence peaks at 40. This is wrong — AA's index goes to 100 (top is ~61). **We're systematically overweighting intelligence for top models by ~2.5x.** Should be `intelligence / 100`.

## 3. Speed & Latency Measurement

### Three metrics

| Metric | Formula | Unit |
|---|---|---|
| **Output speed** | Average tok/s after first token (last 80% of answer chunks for reasoning models) | tok/s |
| **TTFT** | Time to first token (first *reasoning* token for thinking models) | seconds |
| **Total response time** | `TTFT + (100 / output_speed)` — synthetic time for 100 output tokens | seconds |

### Test conditions
- **Workloads**: 1k, 10k (default), and 100k input tokens
- **Concurrency**: single-prompt and parallel (10 concurrent)
- **Temperature**: 0 (non-reasoning), 0.6 (reasoning)
- **Tokenizer**: OpenAI tokens (tiktoken o200k_base) for cross-model comparability
- **Server**: Google Cloud us-central1-a
- **Time to First Answer Token**: for reasoning models, measured separately from raw TTFT — accounts for all "thinking" time

### Cadence
- 1k and 10k workloads: **8x/day** (every 3 hours)
- 10-concurrent: **1x/day**
- 100k workload: **1x/week**
- Reported as: **Median (P50) over past 72 hours** (14-day median for 7:2:1 workload)

### For us
- Our `latency/4` divisor is actually reasonable — AA's TTFT for most models is 0.5–4s, so dividing by 4 normalizes roughly to [0, 1].
- Speed cap `min(speed/80, 1.5)` may need review — Mercury 2 tops at 765 tok/s, so uncapped speed contribution could be ~9.5. The 1.5 cap is aggressive.
- We measure single-request from one location; AA measures from one location (us-central1) but at scale.

## 4. Price Normalization

### Blended price: 7:2:1 ratio
```
blended_price = 0.7 * cache_hit_price + 0.2 * input_price + 0.1 * output_price
```
This reflects AA's view of real-world API usage (heavy cache-hit weighting).

For tiered pricing, AA uses the **on-demand, non-cached** price for cross-model comparison.

### Price-performance scatter plot
- X-axis: Blended price ($/M tokens, log scale)
- Y-axis: Intelligence score (0–100)
- 28 of 534 models shown by default (configurable)
- Color-coded by provider/creator
- Reasoning models marked with lightbulb icon
- "Most attractive quadrant" highlighted (high intelligence, low price)

### For us
We don't track price for free models. For paid models:
- Store `price_performance_ratio = intelligence / log(price)` as a value metric
- Quality-vs-price scatter on the paid models page
- Track price changes — sudden drops often precede deprecation

## 5. Visualization Patterns

### Scatter plots (all pages)
- Intelligence vs. Price, Speed, Total Response Time, Context Window
- Each model = dot, color = provider, click = select for comparison

### Spider/radar charts
- Axes: Intelligence, Speed, Price (inverse), Context Window, Latency
- Multi-model overlay for trade-off comparison

### Ranking table
- Sortable columns with **percentile-based color coding** (green = good, red = poor)
- Percentile rank shown alongside raw value

### Model detail cards
- Full benchmark breakdown with rank ("#1 / 151")
- Gauge/score bar: raw score out of 100, quartile comparison bar
- Latency distribution (not just median)
- Price breakdown (input vs. output, cache vs. no-cache)

### What to borrow immediately
- **Percentile-based color coding** in ranking tables (already have percentile in RankingExplorer.vue)
- **Spider chart** on super model detail page — Intelligence, Speed, Context, Latency, Price
- **Scatter plot** for paid models: price vs. quality
- **Latency distribution** instead of single-point "working/failed"

## 6. Data Freshness

- Performance metrics tested 8x/day (every 3 hours), reported as 72-hour median
- Intelligence Index updated quarterly (v4.0.4 = March 2026)
- No time-decay of old scores — unchanged until re-benched
- Model detail shows "Last evaluated" date
- No explicit stale indicator for >90 days

### For us
Our 6-day working-model cache lacks transparency. We should:
- Store `last_tested_at` per model and display it
- Add "stale" badge for models not tested in >14 days
- Use `fetched_at` from model_scores to flag stale benchmark data (>30 days)

## 7. Summary: What to borrow

| Pattern | Priority | Effort |
|---|---|---|
| Fix `intelligence/40` → `intelligence/100` — AA index is 0-100 | **High** | Trivial |
| Quality-vs-price scatter plot for paid models | **High** | Medium |
| Percentile-based color coding in ranking tables | **High** | Low |
| Store and display `last_tested_at` per model | **High** | Low |
| Spider/radar chart on super model detail page | Medium | Medium |
| Latency percentiles (p50/p95) instead of single-point | Medium | Medium |
| Stale badge for models >14 days since last test | Medium | Low |
| AA's 7:2:1 blended price formula for paid model value scoring | Medium | Low |
| Category-weighted scoring (Agents/Coding/General/Scientific) | Low | High |
| Multi-region latency testing | Low | High |
