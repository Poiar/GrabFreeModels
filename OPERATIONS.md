# Operations Guide – GrabFreeModels

This document explains how to run, monitor, and maintain the GrabFreeModels workflow in production.

---
## 1. Nightly Maintenance
- **Task Scheduler**: Import `scripts/nightly-task.xml` and enable it. It runs `nightly-maintenance.ps1` daily at 02:00 AM.
- **Webhook secret**: Store the webhook URL as a Windows secret named `GrabFreeModelsWebHook` (or set the environment variable `WEBHOOK_URL`). The nightly script reads the secret via `Get-Secret`.
- **Log files**:
  - `nightly-summary.log` – human‑readable run summary.
  - `nightly-errors.log` – any Git or webhook errors.
- **Snapshots**: After each run a copy of `available-models.json` is placed in `snapshots/`.

---
## 2. Metrics Exporter Service
- Install the service (run as Administrator):
  ```powershell
  pwsh -File scripts\install-metrics-service.ps1 -Port 9180
  ```
- The service is named `GrabFreeModelsMetrics` and starts automatically.
- Prometheus should scrape `http://<host>:9180/metrics`.
- To stop/remove the service:
  ```powershell
  sc.exe stop GrabFreeModelsMetrics
  sc.exe delete GrabFreeModelsMetrics
  ```
  (If installed with nssm, use `nssm remove GrabFreeModelsMetrics confirm`.)

---
## 3. Snapshot Retention
- Run the cleanup script (e.g., via a weekly scheduled task) to keep only the most recent 30 snapshots:
  ```powershell
  pwsh -File scripts\cleanup-snapshots.ps1 -Keep 30
  ```

---
## 4. Dashboard & Docs
- Generate an updated dashboard HTML:
  ```powershell
  pwsh -File scripts\generate-dashboard.ps1
  ```
- The dashboard (`dashboard.html`) is served via GitHub Pages (see **5**).
- MkDocs site can be built locally:
  ```bash
  mkdocs build   # output in site/
  ```

---
## 5. GitHub Pages
- Enable Pages in the repository settings, selecting the `site/` folder as the source.
- After a successful build, the dashboard and `RANKINGS.md` will be publicly viewable at `https://<username>.github.io/GrabFreeModels/`.

---
## 6. Alerts & Monitoring
- **Prometheus**: add the following job to `prometheus.yml`:
  ```yaml
  - job_name: 'grabfreemodels'
    static_configs:
      - targets: ['<host>:9180']
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
            summary: "Provider {{ $labels.provider }} working ratio low"
            description: "Only {{ $value | printf \"%.2f\" }} of models are working for provider {{ $labels.provider }}."
  ```
- Load the rule into Prometheus and configure Alertmanager (or your existing webhook) to receive notifications.

---
## 7. Dependency Management
- Dependabot automatically opens PRs for updates to `requirements.txt` and the PowerShell module manifest.
- When a PR is merged, the CI workflow (`.github/workflows/ci.yml`) validates the changes.

---
## 8. Manual Run / Debugging
- To run the full pipeline manually:
  ```powershell
  pwsh -File scripts\nightly-maintenance.ps1
  ```
- Check logs (`nightly-summary.log`, `nightly-errors.log`) for details.
- Use `git status` to verify that any changes were committed.

---
## 9. Security Considerations
- Keep the webhook URL secret; never commit it to the repo.
- Restrict the Windows task to the dedicated service account that has write access only to this repository.
- Regularly rotate the webhook secret if supported by your notification platform.

---
**End of Operations Guide**
