---
name: research-langfuse
description: "Langfuse observability patterns — metrics model, dashboard design, health checking, degradation alerting"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 44d00769-02b1-4e82-9bad-40385a18dbea
---

# Langfuse Observability Patterns

Source: langfuse.com / github.com/langfuse/langfuse — researched 2026-06-09

## 1. Metrics Model: Latency, Error Rate, and Cost per Model/Provider

### Hierarchical tracing structure

```
Trace → Observation (SPAN | GENERATION | EVENT) → Score
```

**Observation** — the core unit. For model health checks, use GENERATION type:
```json
{
  "id": "health-check-gpt4o-2026-06-09",
  "type": "GENERATION",
  "providedModelName": "openai/gpt-4o",
  "provider": "openai",
  "latency": 1.234,
  "timeToFirstToken": 0.345,
  "usageDetails": { "input": 150, "output": 75, "total": 225 },
  "costDetails": { "input": 0.00075, "output": 0.00375, "total": 0.0045 },
  "statusMessage": "PASS",
  "metadata": { "testName": "reasoning", "temperature": 0.0 },
  "environment": "nightly",
  "release": "v2.1.0"
}
```

**Score** — independent entity attached to trace/observation. Four types:
- `NUMERIC`, `CATEGORICAL`, `BOOLEAN`, `TEXT`
- Each has: name, value, comment, optional configId

### Cost calculation
- Two-step: record usageDetails → derive cost from model definitions OR pass costDetails manually
- For 18+ providers with varying pricing, pass costDetails manually for full control

## 2. Dashboard Design

### Widget data model
Each dashboard widget is an independent query unit:
```json
{
  "view": "observations",
  "metrics": [{"measure": "latency", "aggregation": "p95"}],
  "dimensions": [{"field": "providedModelName"}],
  "filters": [{"column": "environment", "operator": "equals", "value": "nightly"}],
  "timeDimension": {"granularity": "day"},
  "chartType": "time-series",
  "fromTimestamp": "...",
  "toTimestamp": "..."
}
```

### Available metrics (observation view)
- `count` (aggregation: count)
- `latency` (aggregation: avg, max, min, p50, p75, p90, p95, p99)
- `totalCost` (aggregation: sum, avg)
- `totalTokens` (aggregation: sum, avg)
- `timeToFirstToken` (aggregation: avg, p50-p99)

### Recommended health dashboard layout
1. **Model health time series** (line chart) — p50/p95/p99 latency per model per day, colored by provider
2. **Cost ranking** (bar chart) — totalCost per model, filtered by time range
3. **Success rate** (metric number) — count(FAIL) / count(total) per model
4. **Performance heatmap** (table) — rows per model, columns: p95 latency, avg latency, avg tokens, total cost
5. **Token usage** (stacked area) — daily input/output tokens per model

### Metadata filtering
```json
{
  "column": "metadata",
  "operator": "contains",
  "key": "provider",
  "value": "anthropic",
  "type": "stringObject"
}
```
Allows filtering by arbitrary health check parameters without schema changes.

## 3. Degradation Alerting

### Current state
- Langfuse has **no native LLM degradation alerts** (only spend alerts)
- Evaluation framework can serve as the foundation for programmatic degradation detection

### Recommended pattern: Baseline + threshold comparison
1. Query Metrics API for p95 latency, avg cost, failure rate over past N runs
2. Compute rolling baseline (e.g., 7-day median)
3. Compare latest run against baseline — >2 stddev or 20% deviation → alert
4. Send alerts via external system (Slack, PagerDuty, email)

### Metrics API query example (p95 latency by model per day)
```json
{
  "view": "observations",
  "metrics": [{"measure": "latency", "aggregation": "p95"}],
  "dimensions": [{"field": "providedModelName"}],
  "timeDimension": {"granularity": "day"},
  "filters": [{"column": "environment", "operator": "equals", "value": "nightly"}],
  "fromTimestamp": "2026-06-02T00:00:00Z",
  "toTimestamp": "2026-06-09T00:00:00Z"
}
```

### Evaluation framework
- **LLM-as-a-Judge**: prompt templates for evaluating outputs (hallucination, relevance, tone)
- **Code evaluators**: deterministic checks (JSON parsing, constraint validation, keyword presence)
- **Pipeline evaluations**: batch-fetch traces, apply external evaluators, write scores back
- Inject PASS/FAIL health check results as NUMERIC scores (1.0/0.0) to enable trend analysis

## 4. Storage Architecture

### Four-layer storage
```
PostgreSQL — transactional data (users, projects, API keys, dashboards, model definitions)
ClickHouse  — observability analytics (traces, observations, events, scores)
Redis       — event queueing (BullMQ for async ingestion)
S3/Blob     — raw event payloads + media files (cold storage for large I/O)
```

### Why ClickHouse for analytics
- Columnar storage → `count`, `sum`, `p95` queries scan only needed columns
- High-performance aggregation even with large binary columns
- Reduces IOPS on PostgreSQL by offloading analytical queries

### Daily metrics snapshot
```json
{
  "date": "2024-02-18",
  "countTraces": 1500,
  "countObservations": 3000,
  "totalCost": 102.19,
  "usage": [
    {
      "model": "gpt-4",
      "inputUsage": 500, "outputUsage": 550, "totalUsage": 1050,
      "countTraces": 500, "countObservations": 1000,
      "totalCost": 52.0
    }
  ]
}
```
Pre-aggregated daily summaries avoid replaying all raw events for historical queries.

## Summary: Patterns to borrow

| Pattern | What to borrow |
|---|---|
| Observation model | Model each nightly test as a GENERATION observation with provider + modelName as dimensions |
| Cost tracking | Manual costDetails for full control across varying provider pricing |
| Score injection | Store PASS/FAIL as NUMERIC scores (1.0/0.0) for trend analysis |
| Metrics/aggregation | p95 latency, avg cost, count errors grouped by model/provider |
| Degradation detection | Rolling 7-day baseline vs. latest run; external alerting on >2σ deviation |
| Dashboard widgets | Independent JSON-query widgets: provider comparison, latency trends, cost, failure rates |
| Storage | Columnar (ClickHouse-like) for time-series metrics; PG for entities |
| Metadata filtering | Key-value filtering on metadata without schema changes |
| Tags | Reusable multi-value tags: env:nightly, category:reasoning, provider:openai |
