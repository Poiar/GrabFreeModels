---
name: research-lmsys
description: 'LMSYS Chatbot Arena ranking methodology — Bradley-Terry ELO, bootstrapping, confidence intervals, time decay'
metadata:
  node_type: memory
  type: reference
  originSessionId: 44d00769-02b1-4e82-9bad-40385a18dbea
---

# LMSYS Chatbot Arena Ranking Methodology

Source: chat.lmsys.org, arxiv.org/abs/2403.04132, github.com/lm-sys/FastChat — researched 2026-06-09

## 1. Bradley-Terry ELO Model

### Core formula

Probability model i beats model j:

```
P(i beats j) = theta_i / (theta_i + theta_j)
```

On the logit/ELO scale:

```
E_ij = 1 / (1 + 10^((R_j - R_i) / d))
```

where `d = 400` (standard chess ELO; 400-point difference = 10x win probability).

### Online ELO update

```
R_i_new = R_i_old + K * (S_ij - E_ij)
```

- `S_ij` = 1 (win), 0 (loss), 0.5 (tie)
- `K` = variable K-factor

### Variable K-factor

- `K = 4` for models with ≥1000 votes (converged)
- `K` higher (8-16) for low-vote models → new models climb/drop faster
- Critical for fast-moving LLM landscape

### Offline MLE (more stable)

```
L = sum over comparisons ( w_ij * log(P(i beats j)) + w_ji * log(P(j beats i)) )
```

Periodic full recomputation via maximum likelihood, more stable than online updates.

## 2. Confidence Intervals via Bootstrapping

### Procedure

1. From N comparison votes, resample N votes **with replacement** (bootstrap sample)
2. Recompute Bradley-Terry ratings from resampled data
3. Repeat B = 1000-10000 times
4. 2.5th and 97.5th percentiles → 95% confidence interval

### Key nuance

Resample at the **vote level**, not model level. Each vote is an independent observation. This correctly captures finite-sample uncertainty.

### Significance testing

- Check CI overlap → non-overlapping = significant
- One-sided bootstrap p-value: proportion of replicates where model A's rating ≤ model B's rating
- p < 0.05 → A significantly better than B

## 3. Ties and Low-Sample Models

### Ties

- Encoded as `S = 0.5` in ELO update
- In MLE: `P(tie) = sqrt(P(i beats j) * P(j beats i))`
- Typically 10-20% of votes

### Low-sample threshold

- N_min = 1000-2000 votes before appearing on main leaderboard
- Low-sample models in "provisional" section with wider CIs
- Regularization prior: weak Gaussian centered at 1000 ELO prevents divergence

## 4. Time Decay / Staleness

### Four approaches

1. **Fixed window** — only votes from last 30-90 days
2. **Exponential decay** — `w(t) = exp(-lambda * (t_current - t_vote))` with ~30-day half-life
3. **ELO-over-time** — independent ratings per week/month, plotted as trajectory
4. **Cohort/"Arena Elo"** — active window only, older votes archived

### Key insight

Recompute from scratch on filtered window, don't accumulate stale biases.

## 5. Category Bucketing

### Separate ratings per category

- Overall, Coding, Math & Reasoning, Creative Writing, Knowledge (STEM/Humanities), Roleplaying, Writing, Analysis, Extraction, Long Context
- Each: filter votes → recompute MLE → bootstrap CIs
- No cross-category normalization — each has own distribution

### Reference anchoring

- Fix one model (e.g., GPT-3.5-Turbo) at reference ELO (e.g., 1000) during MLE
- Resolves additive identifiability → prevents drift

## Summary: Key parameters

| Parameter            | Value      | Purpose                  |
| -------------------- | ---------- | ------------------------ |
| Scaling factor d     | 400        | ELO spread               |
| K-factor (converged) | 4          | Update rate              |
| K-factor (new)       | 8-16       | Fast initial convergence |
| Bootstrap B          | 1000-10000 | CI precision             |
| Min votes            | 1000-2000  | Inclusion threshold      |
| Time window          | 30-90 days | Staleness cutoff         |
| Decay half-life      | ~30 days   | Temporal weight falloff  |

## Applicability to deterministic ranking

1. Bradley-Terry + regularization → smooth ranking even with full comparison matrices
2. Bootstrap at the comparison level → confidence intervals for any ranking system
3. Minimum sample thresholds → prevent noisy results from under-tested models
4. Time-decay weighting → old benchmark scores shouldn't permanently bias ranking
5. Category separation → compute rankings per role, not just aggregate
6. MLE reference anchoring → fix a reference model to prevent score drift over time
