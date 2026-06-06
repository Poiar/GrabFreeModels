---
name: finding-response-payload-size
description: /api/data returns 205.9 MB with 84% removed models
metadata:
  type: project
---

## FINDING: /api/data response payload is 205.9 MB

**Detected**: 2026-06-06 during API QA testing.

**Details**: The `/api/data` endpoint returns 205.9 MB of JSON. The flat `models` array contains 1425 items, of which 1195 (84%) have `_removed: true`. The hierarchical structure (creators -> models -> providers) correctly filters to only 230 non-removed datapoints.

**Impact**: Initial page load and "Refresh" operations download 205 MB unnecessarily. Mobile users or users with slow connections will experience very long load times.

**Suggestion**: Either filter removed models server-side from the flat list, or paginate the flat models array. The frontend never displays removed models anyway.
