# Agent Memory Index — QA

- [BUG: provider_health calculation](bug-provider-health-calculation.md) — every provider has wrong health counts due to `!is_free` filter + missing `_removed` filter
- [FINDING: 205 MB response payload](finding-response-payload-size.md) — /api/data is huge, 84% removed models in flat list
- [FINDING: TypeScript types out of sync](models-data-type-mismatch.md) — ModelsData missing `models` and `provider_health` fields
