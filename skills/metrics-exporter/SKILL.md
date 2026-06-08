---
name: metrics-exporter
description: Use for starting or installing the Prometheus metrics exporter. Triggers: "start metrics", "metrics exporter", "prometheus metrics", "install metrics service", "metrics endpoint".
---

# Metrics Exporter

Lightweight HTTP server (Node.js `http` module, no Express) serving Prometheus-compatible metrics on port 9180. Listens on `0.0.0.0`.

## Quick Start

```bash
node scripts/metrics-exporter.js --port 9180
```

## Install as Windows Service

```bash
node scripts/install-metrics-service.js --port 9180 --name GrabFreeModelsMetrics
```

Tries nssm first, falls back to `sc.exe`. Starts automatically on boot.

## Metrics Exposed

All gauge type, `text/plain; version=0.0.4`:

| Metric                         | Labels            |
| ------------------------------ | ----------------- |
| `model_provider_working`       | `{provider="..."}`|
| `model_provider_total`         | `{provider="..."}`|
| `model_provider_rate_limited`  | `{provider="..."}`|
| `model_provider_broken`        | `{provider="..."}`|
| `model_overall_working_ratio`  | (none)            |
| `model_test_timestamp`         | (none)            |

Only `is_free` models counted. Data from `scripts/load-models.js` (same as `GET /api/data`).

## Cache

60-second TTL — repeated scrapes within 60s return cached metrics, avoiding repeated DB queries.

## Alert Thresholds

No built-in alerting — configure in Prometheus/Grafana:
- `model_overall_working_ratio < 0.7` → warning
- `model_overall_working_ratio < 0.5` → critical
- `model_test_timestamp` older than 25h → stale data

## Architecture

- Handles `SIGTERM`/`SIGINT` for clean shutdown
- On error: returns error text in metrics endpoint (won't crash; Prometheus records scrape error)
