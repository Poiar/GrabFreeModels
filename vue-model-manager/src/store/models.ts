import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  ModelsData,
  CreatorData,
  ModelData,
  ProviderDatapoint,
  ProviderReference,
  RoleScore,
  RoleMeta,
} from '@/types';

const ROLE_ORDER = ['model', 'build', 'general', 'small_model', 'explore'] as const;
type Role = (typeof ROLE_ORDER)[number];

// ── SessionStorage cache for instant page loads ──
const CACHE_KEY = 'gf_models_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ModelsCache {
  raw: string;
  cachedAt: number;
}

function loadFromCache(): { data: ModelsData; cachedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: ModelsCache = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return { data: JSON.parse(entry.raw) as ModelsData, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}

function saveToCache(rawJson: string) {
  try {
    const entry: ModelsCache = { raw: rawJson, cachedAt: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // sessionStorage full or unavailable — skip caching
  }
}

export const useModelsStore = defineStore('models', () => {
  const data = ref<ModelsData | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const lastLoaded = ref<Date | null>(null);
  const isStale = ref(false);

  let staleTimer: ReturnType<typeof setTimeout> | null = null;
  function startStaleTimer() {
    stopStaleTimer();
    staleTimer = setTimeout(() => {
      isStale.value = true;
    }, 3_600_000);
  }
  function stopStaleTimer() {
    if (staleTimer !== null) {
      clearTimeout(staleTimer);
      staleTimer = null;
    }
  }

  // ── Hierarchical data access ──
  const creators = computed((): CreatorData[] => data.value?.creators ?? []);
  const providerRefs = computed((): ProviderReference[] => data.value?.providers ?? []);

  // ── Flatten all models across all creators ──
  const allModels = computed((): ModelData[] => {
    const result: ModelData[] = [];
    for (const creator of creators.value) {
      for (const model of creator.models) {
        result.push(model);
      }
    }
    return result;
  });

  // ── Flatten all provider datapoints ──
  const allDatapoints = computed((): ProviderDatapoint[] => {
    const result: ProviderDatapoint[] = [];
    for (const model of allModels.value) {
      for (const dp of model.providers) {
        result.push(dp);
      }
    }
    return result;
  });

  // ── Model lookup by super_id ──
  const modelBySuperId = computed((): Map<number, { model: ModelData; creator: CreatorData }> => {
    const map = new Map();
    for (const creator of creators.value) {
      for (const model of creator.models) {
        map.set(model.super_id, { model, creator });
      }
    }
    return map;
  });

  // ── Model lookup by id (full_id) ──
  function getModelById(id: string): ModelData | null {
    // First try to find a datapoint with this id
    const found = datapointById.value.get(id);
    if (found) return found.model;

    // If not found as a datapoint, look through all models
    for (const creator of creators.value) {
      for (const model of creator.models) {
        // Check providers for full_id match
        for (const dp of model.providers) {
          if (dp.full_id === id) return model;
        }
      }
    }
    return null;
  }

  // ── Model lookup with tool support by id (full_id) ──
  function getModelWithSupportTools(
    id: string,
  ): { model: ModelData; supports_tools: boolean | null } | null {
    // First try to find a datapoint with this id
    const found = datapointById.value.get(id);
    if (found) return { model: found.model, supports_tools: found.dp.supports_tools };

    // If not found as a datapoint, look through all models
    for (const creator of creators.value) {
      for (const model of creator.models) {
        // Check providers for full_id match
        for (const dp of model.providers) {
          if (dp.full_id === id) return { model, supports_tools: dp.supports_tools };
        }
      }
    }
    return null;
  }

  // ── Datapoint lookup by full_id ──
  const datapointById = computed(
    (): Map<string, { dp: ProviderDatapoint; model: ModelData; creator: CreatorData }> => {
      const map = new Map();
      for (const creator of creators.value) {
        for (const model of creator.models) {
          for (const dp of model.providers) {
            map.set(dp.full_id, { dp, model, creator });
          }
        }
      }
      return map;
    },
  );

  // ── Filtered model lists ──
  const freeModels = computed(() => allModels.value);

  const workingModels = computed(() =>
    allModels.value.filter((m) =>
      m.providers.some((p) => !p._removed && p.status.result === 'working'),
    ),
  );

  const brokenModels = computed(() =>
    allModels.value.filter((m) => m.providers.some((p) => p.status.result === 'broken')),
  );

  const rateLimitedModels = computed(() =>
    allModels.value.filter((m) => m.providers.some((p) => p.status.result === 'rate_limited')),
  );

  const untestedModels = computed(() =>
    allModels.value.filter((m) => m.providers.some((p) => p.status.result === 'untested')),
  );

  const removedModels = computed(() =>
    allModels.value.filter((m) => m.providers.every((p) => p._removed)),
  );

  // ── Model status classification ──
  function getModelStatus(model: ModelData): 'working' | 'mixed' | 'untested' | 'down' {
    const activeProviders = model.providers.filter((p) => !p._removed);
    if (activeProviders.length === 0) return 'down';
    const working = activeProviders.filter((p) => p.status.result === 'working').length;
    const untested = activeProviders.filter((p) => p.status.result === 'untested').length;
    const broken = activeProviders.filter((p) => p.status.result === 'broken').length;
    if (working === activeProviders.length) return 'working';
    if (untested === activeProviders.length) return 'untested';
    if (working > 0) return 'mixed';
    if (broken === activeProviders.length) return 'down';
    return 'mixed';
  }

  // ── Metadata ──
  const roleRankings = computed(() => {
    const r = data.value?._role_rankings;
    if (!r) return {} as Record<Role, string[]>;
    const result = {} as Record<Role, string[]>;
    for (const role of ROLE_ORDER) result[role] = r[role] ?? [];
    return result;
  });

  const roleScores = computed(
    () => data.value?._role_rankings?._scores ?? ({} as Record<string, RoleScore[]>),
  );
  const roleMeta = computed(
    () => data.value?._role_rankings?._meta ?? ({} as Record<string, RoleMeta>),
  );

  const knownIssues = computed(() => data.value?._known_issues?.issues ?? []);

  const testSummary = computed(() => data.value?._test_summary ?? null);
  const validationMethod = computed(() => data.value?._validation_method ?? null);

  const providerUsage = computed(() => {
    const raw = data.value?._provider_usage;
    if (!raw) return {} as Record<string, { month: string; reason: string }>;
    const result: Record<string, { month: string; reason: string }> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'description') continue;
      if (typeof value === 'object' && value !== null && 'month' in value) {
        result[key] = value as { month: string; reason: string };
      }
    }
    return result;
  });

  const currentMonth = computed(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const usedUpProviders = computed(() => {
    const current = currentMonth.value;
    return Object.entries(providerUsage.value)
      .filter(([, u]) => u.month === current)
      .map(([p]) => p);
  });

  // ── Stats ──
  const stats = computed(() => {
    const totalModels = allModels.value.length;
    const totalDatapoints = allDatapoints.value.length;
    const workingCount = allDatapoints.value.filter((d) => d.status.result === 'working').length;
    const brokenCount = allDatapoints.value.filter((d) => d.status.result === 'broken').length;

    return {
      creators: creators.value.length,
      models: totalModels,
      datapoints: totalDatapoints,
      providers: providerRefs.value.length,
      working: workingCount,
      broken: brokenCount,
      workingRatio: totalDatapoints > 0 ? workingCount / totalDatapoints : 0,
    };
  });

  // ── Actions ──
  let abortController: AbortController | null = null;

  async function loadData() {
    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;
    error.value = null;

    // Instant restore from sessionStorage cache (0ms perceived load)
    const cached = loadFromCache();
    if (cached) {
      data.value = cached.data;
      lastLoaded.value = new Date(cached.cachedAt);
      isStale.value = false;
      loading.value = false;
      startStaleTimer();
    } else {
      loading.value = true;
    }

    try {
      let resp = await fetch('/api/data', { signal });
      if (!resp.ok) resp = await fetch('/available-models.json', { signal });
      const rawJson = await resp.text();
      const freshData: ModelsData = JSON.parse(rawJson);

      // Skip UI update if data is byte-identical to cached version
      const existingRaw = sessionStorage.getItem(CACHE_KEY);
      if (existingRaw) {
        try {
          const existing: ModelsCache = JSON.parse(existingRaw);
          if (existing.raw === rawJson) return;
        } catch {}
      }

      data.value = freshData;
      saveToCache(rawJson);
      lastLoaded.value = new Date();
      isStale.value = false;
      startStaleTimer();
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (cached) return; // Already showing cached data, no fallback needed

      try {
        const fallbackResp = await fetch('/available-models.json', { signal });
        const fallbackRaw = await fallbackResp.text();
        const fallbackData: ModelsData = JSON.parse(fallbackRaw);
        data.value = fallbackData;
        saveToCache(fallbackRaw);
        lastLoaded.value = new Date();
        isStale.value = false;
        startStaleTimer();
      } catch (fe: unknown) {
        if (fe instanceof DOMException && (fe as DOMException).name === 'AbortError') return;
        error.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    lastLoaded,
    isStale,
    // Hierarchical access
    creators,
    providerRefs,
    // Flat lists
    allModels,
    allDatapoints,
    // Lookups
    modelBySuperId,
    datapointById,
    getModelById,
    getModelWithSupportTools,
    // Filtered lists
    freeModels,
    workingModels,
    brokenModels,
    rateLimitedModels,
    untestedModels,
    removedModels,
    // Model status helper
    getModelStatus,
    // Metadata
    roleRankings,
    roleScores,
    roleMeta,
    knownIssues,
    testSummary,
    validationMethod,
    // Provider usage
    providerUsage,
    currentMonth,
    usedUpProviders,
    // Stats
    stats,
    // Actions
    loadData,
  };
});
