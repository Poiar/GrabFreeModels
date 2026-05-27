# GrabFreeModels

GrabFreeModels is a **free‑model tracker** that discovers, validates, and ranks free LLM models across multiple providers. It maintains a single source of truth (`available-models.json`) and provides:

- Automated daily validation of rate‑limited or untested free models.
- Role‑specific rankings (`model`, `build`, `general`, `small_model`, `explore`, `stable`).
- Provider health aggregation and Prometheus metrics.
- A public HTML dashboard and a Shields.io health badge.
- CI pipeline with Pester tests and Dependabot updates.
- Operational scripts for snapshot management, service installation, and automated rollbacks.
