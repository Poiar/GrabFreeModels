---
name: metrics-exporter
description: Use for starting or installing the Prometheus metrics exporter. Triggers: "start metrics", "metrics exporter", "prometheus metrics", "install metrics service", "metrics endpoint".
---

# Metrics Exporter

Serves Prometheus-compatible metrics for provider health on a local HTTP port.

## Quick Start

```bash
node scripts/metrics-exporter.js --port 9180
```

## Install as Windows Service

```bash
node scripts/install-metrics-service.js --port 9180 --name GrabFreeModelsMetrics
```

Installs via nssm (if available) or `sc.exe` fallback. Runs automatically on boot.

## Metrics Exposed

- `model_provider_working` — working free models per provider
- `model_provider_total` — total free models per provider
- `model_provider_rate_limited` — rate-limited count
- `model_provider_broken` — broken count
- `model_overall_working_ratio` — global working ratio
- `model_test_timestamp` — unix timestamp of last validation
