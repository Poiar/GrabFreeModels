---
name: bug-provider-health-calculation
description: provider_health only counts free models and includes removed models — every provider incorrect
metadata:
  type: project
---

## BUG: `provider_health` calculation is wrong for every provider

**Location**: `C:\oc\GrabFreeModels\scripts\build-models-data.js:398-408`

**Root cause**: Line 401 has `if (!m.is_free) continue;` which skips paid models, and there is no `if (m._removed) continue;` filter for removed models.

**Effect**: Every provider in the `provider_health` map has incorrect working/total/rate_limited/broken counts. The Dashboard's Provider Health section displays these wrong numbers.

**Detected**: 2026-06-06 during API QA testing. Verified by comparing `provider_health` values against actual model status counts from the flat models list — 100% of providers had mismatches.

**Suggested fix**: Replace `if (!m.is_free) continue;` with `if (m._removed) continue;` to count all non-removed models regardless of free/paid status.
