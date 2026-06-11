/**
 * index-builder.ts — Single-pass index builder for ModelsData.
 *
 * The Pinia store has ~60 computed properties that independently iterate
 * the full model tree (creators → models → providers → features).
 * This module builds a shared index once per data load, reducing the
 * per-update cost from O(N × C) to O(N + C) where N = models and C = computeds.
 */

import type {
  ModelsData,
  CreatorData,
  ModelData,
  ProviderDatapoint,
  FamilyData,
} from '@/types';

export interface ModelIndex {
  /** All models flat across all creators */
  allModels: ModelData[];
  /** All provider datapoints flat */
  allDatapoints: ProviderDatapoint[];
  /** Models keyed by slug */
  modelBySlug: Map<string, ModelData>;
  /** Models keyed by super_id with their creator */
  modelBySuperId: Map<number, { model: ModelData; creator: CreatorData }>;
  /** Datapoints keyed by full_id with parent model + creator */
  datapointById: Map<string, { dp: ProviderDatapoint; model: ModelData; creator: CreatorData }>;
  /** Children grouped by parent base_model slug */
  derivedModels: Map<string, ModelData[]>;
  /** Families with pre-grouped models */
  families: FamilyData[];
  /** Working (status='working') datapoints */
  workingDatapoints: ProviderDatapoint[];
  /** Broken datapoints */
  brokenDatapoints: ProviderDatapoint[];
  /** Rate-limited datapoints */
  rateLimitedDatapoints: ProviderDatapoint[];
  /** Provider refs aggregated from working models */
  providerRefs: Map<string, { provider_slug: string; provider: string; model_count: number; models: { model: ModelData; creator: CreatorData }[] }>;
  /** Model scores index */
  modelScores: NonNullable<ModelsData['_model_scores']>;
}

/**
 * Build a single index from ModelsData. Call once per data load.
 * All computed properties then become simple Map lookups instead of O(N) scans.
 */
export function buildIndex(data: ModelsData): ModelIndex {
  const allModels: ModelData[] = [];
  const allDatapoints: ProviderDatapoint[] = [];
  const modelBySlug = new Map<string, ModelData>();
  const modelBySuperId = new Map<number, { model: ModelData; creator: CreatorData }>();
  const datapointById = new Map<string, { dp: ProviderDatapoint; model: ModelData; creator: CreatorData }>();
  const derivedModels = new Map<string, ModelData[]>();
  const workingDatapoints: ProviderDatapoint[] = [];
  const brokenDatapoints: ProviderDatapoint[] = [];
  const rateLimitedDatapoints: ProviderDatapoint[] = [];
  const providerRefs = new Map<string, { provider_slug: string; provider: string; model_count: number; models: { model: ModelData; creator: CreatorData }[] }>();

  // Single pass over creators → models → providers
  for (const creator of (data.creators || [])) {
    for (const model of creator.models) {
      allModels.push(model);
      modelBySlug.set(model.slug, model);
      modelBySuperId.set(model.super_id, { model, creator });

      // Base model inheritance
      if (model.base_model) {
        if (!derivedModels.has(model.base_model)) {
          derivedModels.set(model.base_model, []);
        }
        derivedModels.get(model.base_model)!.push(model);
      }

      for (const dp of model.providers) {
        allDatapoints.push(dp);
        datapointById.set(dp.full_id, { dp, model, creator });

        // Status bucketing
        if (!dp._removed) {
          switch (dp.status?.result) {
            case 'working': workingDatapoints.push(dp); break;
            case 'broken': brokenDatapoints.push(dp); break;
            case 'rate_limited': rateLimitedDatapoints.push(dp); break;
          }
        }

        // Provider refs (for provider sidebar)
        if (!dp._removed && dp.status?.result === 'working') {
          let ref = providerRefs.get(dp.provider_slug);
          if (!ref) {
            ref = { provider_slug: dp.provider_slug, provider: dp.provider, model_count: 0, models: [] };
            providerRefs.set(dp.provider_slug, ref);
          }
          ref.model_count++;
          ref.models.push({ model, creator });
        }
      }
    }
  }

  // Build families
  const familyMap = new Map<string, { models: Map<number, { model: ModelData; providers: ProviderDatapoint[] }>; providerSet: Set<string> }>();
  for (const model of allModels) {
    const familyName = model.family || 'Uncategorized';
    if (!familyMap.has(familyName)) {
      familyMap.set(familyName, { models: new Map(), providerSet: new Set() });
    }
    const entry = familyMap.get(familyName)!;
    entry.models.set(model.super_id, {
      model,
      providers: model.providers.filter(p => !p._removed && p.status?.result === 'working'),
    });
    for (const p of model.providers) {
      if (!p._removed && p.status?.result === 'working') {
        entry.providerSet.add(p.provider_slug);
      }
    }
  }
  const families: FamilyData[] = [];
  for (const [name, entry] of familyMap) {
    const models = Array.from(entry.models.values())
      .filter(e => e.providers.length > 0)
      .map(e => e.model)
      .sort((a, b) => a.name.localeCompare(b.name));
    families.push({ name, model_count: models.length, provider_count: entry.providerSet.size, models });
  }
  families.sort((a, b) => {
    if (a.name === 'Uncategorized') return 1;
    if (b.name === 'Uncategorized') return -1;
    return a.name.localeCompare(b.name);
  });

  return {
    allModels,
    allDatapoints,
    modelBySlug,
    modelBySuperId,
    datapointById,
    derivedModels,
    families,
    workingDatapoints,
    brokenDatapoints,
    rateLimitedDatapoints,
    providerRefs,
    modelScores: data._model_scores || {},
  };
}
