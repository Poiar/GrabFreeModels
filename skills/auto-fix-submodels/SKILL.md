---
name: auto-fix-submodels
description: Detects free models that are non‑working (e.g., API errors, timeouts) and automatically replaces them with a working alternative from the same provider, preserving best_for tags. Triggers: "fix failing submodels", "auto‑recover models", "replace broken models".
---

# Auto‑Fix Sub‑Models Skill

## Purpose
When a free model becomes non‑working (status_result not `working`), the nightly pipeline may still try to use it, leading to failures. This skill scans the `datapoint_models` table for such entries, attempts a quick health‑check, and if the model remains unhealthy it selects a replacement model from the same provider that matches the original model’s `best_for` tags.

## Steps
1. **Identify failing models**
   ```sql
   SELECT dm.id, dm.full_id, dm.provider, dm.best_for, dp.slug AS provider_slug
   FROM datapoint_models dm
   JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
   WHERE dm.is_free = true
     AND dm.is_removed = false
     AND dm.status_result <> 'working';
   ```
2. **Health‑check each candidate** using the provider‑specific endpoint (re‑using the existing `httpsPost` helper from `validate-free-models.js`). If a model responds with a successful 200 within 5 s, mark it as `working`.
3. **Find a replacement** when a model stays unhealthy:
   - Query other free models from the same provider that are `working`.
   - Rank candidates by tag overlap with the failing model’s `best_for` (simple keyword match).
   - Choose the highest‑scoring candidate.
4. **Update DB**:
   ```sql
   UPDATE datapoint_models
   SET full_id = $1, status_result = 'working', status_detail = 'auto‑replaced', status_tested = now()
   WHERE id = $2;
   ```
   where `$1` is the replacement’s `full_id` and `$2` is the failing model’s `id`.
5. **Log actions** using the shared logger (`require('../utils/logger')`).
6. **Export** to `available-models.json` (reuse `export-from-pg.js`).

## Integration
- Add this skill to `skills/auto-fix-submodels/`.
- Run it manually with `node scripts/auto-fix-submodels.js` or schedule it in `nightly-maintenance.js` after the validation step.
- The skill can also be invoked via the CLI: `/auto-fix-submodels`.

## Notes
- The replacement respects the original provider to avoid cross‑provider licensing issues.
- If no suitable replacement exists, the skill flags the model for manual review.
- This skill is safe to run repeatedly; already‑working models are skipped.
