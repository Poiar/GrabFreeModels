---
name: vue-gotchas
description: GrabFreeModels-specific Vue 3 + Pinia gotchas not covered by docs or Context7.
---

# Vue Gotchas (project-specific)

## Vite HMR stale cache

After structural template changes (especially swapping `RecycleScroller`/`DynamicScroller`), Vite HMR returns 500 errors on Vue modules. **Fix:** restart the dev server. The vite.config.ts kill-port plugin helps but doesn't cover all HMR cache scenarios.

## Hierarchical data architecture

The Pinia store works with `creators → models → providers`, not a flat array. Never flatten manually — use the store's computed properties (`allModels`, `allDatapoints`, `modelBySuperId`, `datapointById`, `getModelWithSupportTools`). Filtering on flat lists loses provider-specific info (status, pricing, tools support).

## Abort controller

The `loadData()` action aborts any in-flight request before starting a new one — prevents race conditions from rapid reloads. `AbortError` exceptions are silently swallowed.

## Stale data timer

Data marks as stale after 1 hour (`3_600_000ms`). Timer cleared on each successful load. Check `isStale` in the store.

## Load fallback chain

`/api/data` → if fails → `/available-models.json` (git-tracked snapshot, always available but may be stale).
