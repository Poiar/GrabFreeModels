---
name: models-data-type-mismatch
description: TypeScript ModelsData interface is missing `models` and `provider_health` fields
metadata:
  type: project
---

## FINDING: `ModelsData` type definition is out of sync with API response

**Location**: `C:\oc\GrabFreeModels\vue-model-manager\src\types.ts:65-83`

**Details**: The `ModelsData` interface defines 8 top-level keys. The API response returns 2 additional keys:
- `models: DatapointModel[]` — flat list of all 1425 datapoints
- `provider_health: Record<string, {working, rate_limited, broken, total}>` — per-provider health

Additionally, `ModelData` (line 34-45) defines only `providers: ProviderDatapoint[]` but the actual response includes both `providers` and `models` (flat DatapointModel[]) on each model object within a creator.

**Impact**: TypeScript consumers get no type-checking on these fields. The store must use type assertions or these fields are accessed as `any`.
