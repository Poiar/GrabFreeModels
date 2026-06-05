# Operations Guide – GrabFreeModels

This document explains how to run, monitor, and maintain the GrabFreeModels workflow in production.

---

## 1. Nightly Maintenance

- **Task Scheduler**: Import `scripts/nightly-task.xml` and enable it. It runs `nightly-maintenance.js` daily at 02:00 AM.
- **Webhook secret**: Store the webhook URL as an environment variable `WEBHOOK_URL`. The nightly script reads it from the environment.
- **Log files**:
  - `nightly-summary.log` – human‑readable run summary.
  - `nightly-errors.log` – any Git or webhook errors.
- **Snapshots**: After each run the DB is exported to `available-models.json` and copied to `snapshots/`.

---

## 2. Metrics Exporter Service

- Install the service (run as Administrator):

```bash
node scripts/install-metrics-service.js
```

- The service is named `GrabFreeModelsMetrics` and starts automatically.
- Prometheus should scrape the metrics endpoint.
- To stop/remove the service:

```bash
sc.exe stop GrabFreeModelsMetrics
sc.exe delete GrabFreeModelsMetrics
```

(If installed with nssm, use `nssm remove GrabFreeModelsMetrics confirm`.)

---

## 3. Snapshot Retention

- Run the cleanup script (e.g., via a weekly scheduled task):

```bash
node scripts/cleanup-snapshots.js --keep 30
```

---

## 4. Dashboard

- Generate an updated dashboard HTML:

```bash
node scripts/generate-dashboard.js
```

---

## 5. Alerts & Monitoring

- **Prometheus**: add the following job to `prometheus.yml`:
  ```yaml
  - job_name: 'grabfreemodels'
    static_configs:
      - targets: ['<host>']
  ```
- **Alert rule** (store as `prometheus/alerts.yml`):
  ```yaml
  groups:
    - name: grabfreemodels
      rules:
        - alert: ProviderWorkingBelowThreshold
          expr: (model_provider_working / model_provider_total) < 0.5
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: 'Provider {{ $labels.provider }} working ratio low'
            description: 'Only {{ $value | printf "%.2f" }} of models are working for provider {{ $labels.provider }}.'
  ```
- Load the rule into Prometheus and configure Alertmanager (or your existing webhook) to receive notifications.

---

## 6. Manual Run / Debugging

- To run the full pipeline manually:

```bash
node scripts/nightly-maintenance.js
```

- Check logs (`nightly-summary.log`, `nightly-errors.log`) for details.
- Use `git status` to verify that any changes were committed.

---

## 7. Security Considerations

- Keep the webhook URL secret; never commit it to the repo.
- Restrict the Windows task to the dedicated service account that has write access only to this repository.
- Regularly rotate the webhook secret if supported by your notification platform.

---

**End of Operations Guide**
