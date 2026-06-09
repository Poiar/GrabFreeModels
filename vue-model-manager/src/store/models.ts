import { defineStore } from 'pinia';
import { ref, computed, type Ref } from 'vue';
import type {
  ModelsData,
  CreatorData,
  FamilyData,
  ModelData,
  ProviderDatapoint,
  ProviderReference,
  SourceInfo,
  SourceToggleState,
  RoleScore,
  RoleMeta,
} from '@/types';

const ROLE_ORDER = ['model', 'build', 'general', 'small_model', 'explore'] as const;
type Role = (typeof ROLE_ORDER)[number];

// ── SessionStorage cache for instant page loads ──
const CACHE_KEY = 'gf_models_cache';
const PAID_CACHE_KEY = 'gf_models_cache_paid';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ModelsCache {
  raw: string;
  cachedAt: number;
}

function loadFromCache(key: string = CACHE_KEY): { data: ModelsData; cachedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: ModelsCache = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return { data: JSON.parse(entry.raw) as ModelsData, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}

function saveToCache(rawJson: string, key: string = CACHE_KEY) {
  try {
    const entry: ModelsCache = { raw: rawJson, cachedAt: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(entry));
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

  // ── Paid model data ──
  const paidData = ref<ModelsData | null>(null);
  const paidLoading = ref(false);
  const paidError = ref<string | null>(null);
  const paidLastLoaded = ref<Date | null>(null);

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

  // ── Source provenance state ──
  const sources = ref<SourceInfo[]>([]);
  const sourcesLoading = ref(false);
  const toggleState = ref<SourceToggleState>({});

  function loadToggleState() {
    try {
      const raw = localStorage.getItem('gf_source_toggles');
      if (raw) toggleState.value = JSON.parse(raw);
    } catch { /* ignore */ }
  }
  loadToggleState();

  function saveToggleState() {
    try {
      localStorage.setItem('gf_source_toggles', JSON.stringify(toggleState.value));
    } catch { /* ignore */ }
  }

  // ── Hierarchical data access ──
  const creators = computed((): CreatorData[] => data.value?.creators ?? []);
  const providerRefs = computed((): ProviderReference[] => data.value?.providers ?? []);

  // ── Family grouping ──
  const families = computed((): FamilyData[] => {
    const familyMap = new Map<string, { models: Map<number, ModelData>; providerSet: Set<string> }>();
    for (const model of allModels.value) {
      const familyName = model.family || 'Uncategorized';
      if (!familyMap.has(familyName)) {
        familyMap.set(familyName, { models: new Map(), providerSet: new Set() });
      }
      const entry = familyMap.get(familyName)!;
      entry.models.set(model.super_id, model);
      for (const p of model.providers) entry.providerSet.add(p.provider_slug);
    }
    const result: FamilyData[] = [];
    for (const [name, entry] of familyMap) {
      const models = Array.from(entry.models.values()).sort((a, b) => a.name.localeCompare(b.name));
      result.push({ name, model_count: models.length, provider_count: entry.providerSet.size, models });
    }
    result.sort((a, b) => {
      if (a.name === 'Uncategorized') return 1;
      if (b.name === 'Uncategorized') return -1;
      return a.name.localeCompare(b.name);
    });
    return result;
  });

  const visibleFamilies = computed((): FamilyData[] => {
    if (!isSourceFilterActive.value) return families.value;
    const familyMap = new Map<string, { models: Map<number, ModelData>; providerSet: Set<string> }>();
    for (const model of visibleModels.value) {
      const familyName = model.family || 'Uncategorized';
      if (!familyMap.has(familyName)) {
        familyMap.set(familyName, { models: new Map(), providerSet: new Set() });
      }
      const entry = familyMap.get(familyName)!;
      entry.models.set(model.super_id, model);
      for (const p of model.providers) entry.providerSet.add(p.provider_slug);
    }
    const result: FamilyData[] = [];
    for (const [name, entry] of familyMap) {
      const models = Array.from(entry.models.values()).sort((a, b) => a.name.localeCompare(b.name));
      result.push({ name, model_count: models.length, provider_count: entry.providerSet.size, models });
    }
    result.sort((a, b) => {
      if (a.name === 'Uncategorized') return 1;
      if (b.name === 'Uncategorized') return -1;
      return a.name.localeCompare(b.name);
    });
    return result;
  });

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

  // ── Model lookup by slug ──
  const modelBySlug = computed((): Map<string, ModelData> => {
    const map = new Map<string, ModelData>();
    for (const model of allModels.value) {
      map.set(model.slug, model);
    }
    return map;
  });

  // ── Base model lookup (fine-tune parent) ──
  const baseModelParent = computed((): Map<number, ModelData> => {
    const map = new Map<number, ModelData>();
    for (const model of allModels.value) {
      if (model.base_model) {
        const parent = modelBySlug.value.get(model.base_model);
        if (parent) map.set(model.super_id, parent);
      }
    }
    return map;
  });

  // ── Derived models (fine-tune children) ──
  const derivedModels = computed((): Map<string, ModelData[]> => {
    const map = new Map<string, ModelData[]>();
    for (const model of allModels.value) {
      if (model.base_model) {
        if (!map.has(model.base_model)) map.set(model.base_model, []);
        map.get(model.base_model)!.push(model);
      }
    }
    return map;
  });

  // ── Model lookup by super_id ──
  const modelBySuperId = computed((): Map<number, { model: ModelData; creator: CreatorData }> => {
    const map = new Map<number, { model: ModelData; creator: CreatorData }>();
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
    allModels.value.filter((m) => m.providers.some((p) => p.status.result === 'broken' || p.status.result === 'not_found')),
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
    const broken = activeProviders.filter((p) => p.status.result === 'broken' || p.status.result === 'not_found').length;
    if (working === activeProviders.length) return 'working';
    if (untested === activeProviders.length) return 'untested';
    if (working > 0) return 'mixed';
    if (broken === activeProviders.length) return 'down';
    return 'mixed';
  }

  // ── Ranking variant selection ──
  const rankingVariant = ref<string>('_benchmarks');
  const paidRankingVariant = ref<string>('_benchmarks');

  // Per-role variant overrides. When all roles agree, the master dropdown
  // shows that variant. When they differ, master shows "Custom".
  const DEFAULT_ROLE_VARIANTS: Record<string, string> = {
    model: 'combined', build: 'combined', general: 'combined',
    small_model: 'combined', explore: 'combined',
  };
  const paidRoleVariants = ref<Record<string, string>>({ ...DEFAULT_ROLE_VARIANTS });
  const freeRoleVariants = ref<Record<string, string>>({ ...DEFAULT_ROLE_VARIANTS });

  function syncMasterToRoles(variant: string, target: Ref<Record<string, string>>) {
    for (const role of Object.keys(target.value)) target.value[role] = variant;
  }

  function deriveMaster(roleMap: Record<string, string>): string {
    const vals = new Set(Object.values(roleMap));
    return vals.size === 1 ? [...vals][0] : 'custom';
  }

  const paidMasterVariant = computed(() => deriveMaster(paidRoleVariants.value));
  const freeMasterVariant = computed(() => deriveMaster(freeRoleVariants.value));

  function setPaidMaster(variant: string) {
    if (variant === 'custom') return;
    syncMasterToRoles(variant, paidRoleVariants);
  }

  function setFreeMaster(variant: string) {
    if (variant === 'custom') return;
    syncMasterToRoles(variant, freeRoleVariants);
  }

  // Resolve per-role data from a _role_rankings object (with _variants)
  function resolveRoleData(
    r: ModelsData['_role_rankings'] | undefined | null,
    role: string,
    roleVariants: Record<string, string>,
  ) {
    const variant = roleVariants[role] ?? 'combined';
    const vr = resolveVariant(r, variant) as Record<string, any> | null;
    return {
      rankings: (vr?.[role] ?? []) as string[],
      scores: (vr?._scores?.[role] ?? []) as RoleScore[],
      meta: (vr?._meta?.[role] ?? {}) as RoleMeta,
    };
  }

  function resolveVariant(r: ModelsData['_role_rankings'] | undefined | null, variant: string) {
    if (!r) return null;
    if (variant !== 'combined' && r._variants?.[variant]) return r._variants[variant];
    return r;
  }

  // ── Metadata ──
  // Free rankings: each role resolved from its own variant
  const roleRankings = computed(() => {
    const r = data.value?._role_rankings;
    if (!r) return {} as Record<Role, string[]>;
    const result = {} as Record<Role, string[]>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, freeRoleVariants.value).rankings;
    return result;
  });
  const roleScores = computed(() => {
    const r = data.value?._role_rankings;
    if (!r) return {} as Record<string, RoleScore[]>;
    const result = {} as Record<string, RoleScore[]>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, freeRoleVariants.value).scores;
    return result;
  });
  const roleMeta = computed(() => {
    const r = data.value?._role_rankings;
    if (!r) return {} as Record<string, RoleMeta>;
    const result = {} as Record<string, RoleMeta>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, freeRoleVariants.value).meta;
    return result;
  });

  const availableRankingVariants = computed(() => {
    const variants = data.value?._role_rankings?._variants;
    const keys = variants ? Object.keys(variants).filter(k => k !== 'combined') : [];
    return keys.length > 0 ? ['combined', ...keys] : ['combined'];
  });

  // ── Paid metadata (per-role variant resolution) ──
  const paidRoleRankings = computed(() => {
    const r = paidData.value?._role_rankings;
    if (!r) return {} as Record<Role, string[]>;
    const result = {} as Record<Role, string[]>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, paidRoleVariants.value).rankings;
    return result;
  });
  const paidRoleScores = computed(() => {
    const r = paidData.value?._role_rankings;
    if (!r) return {} as Record<string, RoleScore[]>;
    const result = {} as Record<string, RoleScore[]>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, paidRoleVariants.value).scores;
    return result;
  });
  const paidRoleMeta = computed(() => {
    const r = paidData.value?._role_rankings;
    if (!r) return {} as Record<string, RoleMeta>;
    const result = {} as Record<string, RoleMeta>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, paidRoleVariants.value).meta;
    return result;
  });

  // Variant options filtered by role — Models.dev only applies to Build
  const ROLE_VARIANT_OPTIONS: Record<string, string[]> = {
    model:    ['combined', 'artificial_analysis', '_benchmarks'],
    build:    ['combined', 'artificial_analysis', 'modelsdev', '_benchmarks'],
    general:  ['combined', 'artificial_analysis', '_benchmarks'],
    small_model: ['combined', 'artificial_analysis', '_benchmarks'],
    explore:  ['combined', 'artificial_analysis', '_benchmarks'],
  };

  function roleVariantOptions(role: string, availableKeys: string[]): string[] {
    const base = ROLE_VARIANT_OPTIONS[role] ?? ['combined'];
    return base.filter(v => v === 'combined' || availableKeys.includes(v));
  }

  const freeVariantKeys = computed(() => {
    const variants = data.value?._role_rankings?._variants;
    return variants ? Object.keys(variants).filter(k => k !== 'combined') : [];
  });
  const paidVariantKeys = computed(() => {
    const variants = paidData.value?._role_rankings?._variants;
    return variants ? Object.keys(variants).filter(k => k !== 'combined') : [];
  });

  const paidAvailableRankingVariants = computed(() => {
    const keys = paidVariantKeys.value;
    return keys.length > 0 ? ['combined', ...keys] : ['combined'];
  });

  const paidCreators = computed((): CreatorData[] => paidData.value?.creators ?? []);
  const paidProviderRefs = computed((): ProviderReference[] => paidData.value?.providers ?? []);
  const paidDatapointById = computed(
    (): Map<string, { dp: ProviderDatapoint; model: ModelData; creator: CreatorData }> => {
      const map = new Map();
      for (const creator of paidCreators.value) {
        for (const model of creator.models) {
          for (const dp of model.providers) {
            map.set(dp.full_id, { dp, model, creator });
          }
        }
      }
      return map;
    },
  );

  const knownIssues = computed(() => data.value?._known_issues?.issues ?? []);

  const testSummary = computed(() => data.value?._test_summary ?? null);
  const testSummaryPrevious = computed(() => data.value?._test_summary_previous ?? null);
  const modelScores = computed(() => data.value?._model_scores ?? null);
  const paidModelScores = computed(() => paidData.value?._model_scores ?? null);
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

  // ── Source provenance computed ──
  const enabledSourceIds = computed((): Set<number> => {
    const result = new Set<number>();
    for (const s of sources.value) {
      if (toggleState.value[s.id] !== false) result.add(s.id);
    }
    return result;
  });

  const isSourceFilterActive = computed((): boolean => {
    return sources.value.some(s => toggleState.value[s.id] === false);
  });

  // Derive provider slugs from disabled API provider source slugs.
  // API provider source slugs follow the pattern `${providerSlug}-api`.
  const disabledApiProviders = computed((): Set<string> => {
    const result = new Set<string>();
    for (const s of sources.value) {
      if (s.source_type === 'api_provider' && toggleState.value[s.id] === false) {
        // Strip trailing "-api" to get the provider slug
        const pslug = s.slug.endsWith('-api') ? s.slug.slice(0, -4) : s.slug;
        result.add(pslug);
      }
    }
    return result;
  });

  const superApiEnabled = computed({
    get: (): boolean => {
      const apiSources = sources.value.filter(s => s.source_type === 'api_provider');
      return apiSources.every(s => toggleState.value[s.id] !== false);
    },
    set: (val: boolean) => {
      for (const s of sources.value) {
        if (s.source_type === 'api_provider') {
          toggleState.value[s.id] = val;
        }
      }
      saveToggleState();
    },
  });

  const visibleCreators = computed((): CreatorData[] => {
    if (!isSourceFilterActive.value) return creators.value;

    const disabledProviders = disabledApiProviders.value;

    const filtered: CreatorData[] = [];
    for (const creator of creators.value) {
      const filteredModels: ModelData[] = [];
      for (const model of creator.models) {
        const filteredProviders = model.providers.filter(dp => {
          // No provenance — always visible
          if (dp.source_ids.length === 0) return true;
          // API provider explicitly disabled — hide this datapoint
          if (disabledProviders.has(dp.provider_slug)) return false;
          // Visible if any source is still enabled
          return dp.source_ids.some(id => enabledSourceIds.value.has(id));
        });
        if (filteredProviders.length > 0) {
          filteredModels.push({ ...model, providers: filteredProviders });
        }
      }
      if (filteredModels.length > 0) {
        filtered.push({
          ...creator,
          models: filteredModels,
          model_count: filteredModels.length,
          provider_count: new Set(filteredModels.flatMap(m => m.providers.map(p => p.provider_slug))).size,
        });
      }
    }
    return filtered;
  });

  const visibleModels = computed((): ModelData[] => {
    const result: ModelData[] = [];
    for (const creator of visibleCreators.value) {
      result.push(...creator.models);
    }
    return result;
  });

  const visibleProviderRefs = computed((): ProviderReference[] => {
    if (!isSourceFilterActive.value) return providerRefs.value;
    // Pre-index base URLs and npm_package from the full provider list
    const baseUrlMap = new Map(providerRefs.value.map(p => [p.slug, p.base_url]));
    const npmPackageMap = new Map(providerRefs.value.map(p => [p.slug, p.npm_package]));
    const map = new Map<string, { working: number; total: number; name: string; slug: string; base_url: string; npm_package: string | null }>();
    for (const model of visibleModels.value) {
      for (const dp of model.providers) {
        const slug = dp.provider_slug;
        if (!map.has(slug)) {
          map.set(slug, { working: 0, total: 0, name: dp.provider, slug, base_url: baseUrlMap.get(slug) || '', npm_package: npmPackageMap.get(slug) || null });
        }
        const entry = map.get(slug)!;
        entry.total++;
        if (dp.status.result === 'working') entry.working++;
      }
    }
    return [...map.entries()].map(([slug, e]) => ({
      id: slug,
      slug,
      name: e.name,
      base_url: e.base_url,
      npm_package: e.npm_package,
      model_count: e.total,
      working_count: e.working,
      health_status: e.total === 0 ? 'down' : e.working === e.total ? 'healthy' : 'degraded',
    }));
  });

  const visibleStats = computed(() => {
    const models = visibleModels.value;
    const datapoints = models.flatMap(m => m.providers);
    const working = datapoints.filter(d => d.status.result === 'working').length;
    return {
      creators: visibleCreators.value.length,
      models: models.length,
      datapoints: datapoints.length,
      providers: visibleProviderRefs.value.length,
      working,
      broken: datapoints.filter(d => d.status.result === 'broken' || d.status.result === 'not_found').length,
      workingRatio: datapoints.length > 0 ? Math.round((working / datapoints.length) * 100) : 0,
    };
  });

  // ── Stats ──
  const stats = computed(() => {
    const totalModels = allModels.value.length;
    const totalDatapoints = allDatapoints.value.length;
    const workingCount = allDatapoints.value.filter((d) => d.status.result === 'working').length;
    const brokenCount = allDatapoints.value.filter((d) => d.status.result === 'broken' || d.status.result === 'not_found').length;

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
    const cached = loadFromCache(CACHE_KEY);
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
      const ct = resp.headers.get('content-type') || '';
      if (!resp.ok || !ct.includes('application/json')) resp = await fetch('/available-models.json', { signal });
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
      saveToCache(rawJson, CACHE_KEY);
      lastLoaded.value = new Date();
      isStale.value = false;
      startStaleTimer();
      loadSources();
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (cached) return; // Already showing cached data, no fallback needed

      try {
        const fallbackResp = await fetch('/available-models.json', { signal });
        const fallbackRaw = await fallbackResp.text();
        const fallbackData: ModelsData = JSON.parse(fallbackRaw);
        data.value = fallbackData;
        saveToCache(fallbackRaw, CACHE_KEY);
        lastLoaded.value = new Date();
        isStale.value = false;
        startStaleTimer();
        loadSources();
      } catch (fe: unknown) {
        if (fe instanceof DOMException && (fe as DOMException).name === 'AbortError') return;
        error.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      loading.value = false;
    }
  }

  async function loadSources() {
    sourcesLoading.value = true;
    try {
      const resp = await fetch('/api/sources');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      sources.value = await resp.json();
    } catch {
      sources.value = [];
    } finally {
      sourcesLoading.value = false;
    }
  }

  function toggleSource(sourceId: number, enabled: boolean) {
    toggleState.value[sourceId] = enabled;
    saveToggleState();
  }

  function toggleAllSources(enabled: boolean) {
    for (const s of sources.value) {
      toggleState.value[s.id] = enabled;
    }
    saveToggleState();
  }

  // ── Paid data loading ──
  async function loadPaidData() {
    // Don't reload if already loaded recently
    if (paidData.value && paidLastLoaded.value) {
      const age = Date.now() - paidLastLoaded.value.getTime();
      if (age < CACHE_TTL_MS) return;
    }

    paidLoading.value = true;
    paidError.value = null;

    // Try sessionStorage cache first
    const cached = loadFromCache(PAID_CACHE_KEY);
    if (cached) {
      paidData.value = cached.data;
      paidLastLoaded.value = new Date(cached.cachedAt);
      paidLoading.value = false;
    }

    try {
      let resp = await fetch('/api/data/paid');
      const ct = resp.headers.get('content-type') || '';
      if (!resp.ok || !ct.includes('application/json')) resp = await fetch('/available-models-paid.json');
      const rawJson = await resp.text();
      const freshData: ModelsData = JSON.parse(rawJson);

      // Skip update if byte-identical
      const existingRaw = sessionStorage.getItem(PAID_CACHE_KEY);
      if (existingRaw) {
        try {
          const existing: ModelsCache = JSON.parse(existingRaw);
          if (existing.raw === rawJson) return;
        } catch {}
      }

      paidData.value = freshData;
      saveToCache(rawJson, PAID_CACHE_KEY);
      paidLastLoaded.value = new Date();
    } catch (e: unknown) {
      if (cached) return; // Already showing cached data

      try {
        const fallbackResp = await fetch('/available-models-paid.json');
        const fallbackRaw = await fallbackResp.text();
        const fallbackData: ModelsData = JSON.parse(fallbackRaw);
        paidData.value = fallbackData;
        saveToCache(fallbackRaw, PAID_CACHE_KEY);
        paidLastLoaded.value = new Date();
      } catch (fe: unknown) {
        paidError.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      paidLoading.value = false;
    }
  }

  const sourcesPanelOpen = ref(false);

  function requestSourcesPanel() {
    sourcesPanelOpen.value = true;
  }

  return {
    loading,
    error,
    lastLoaded,
    isStale,
    // Source provenance
    sources,
    sourcesLoading,
    toggleState,
    enabledSourceIds,
    isSourceFilterActive,
    superApiEnabled,
    visibleCreators,
    visibleModels,
    visibleProviderRefs,
    visibleStats,
    // Hierarchical access
    creators,
    providerRefs,
    families,
    visibleFamilies,
    // Flat lists
    allModels,
    allDatapoints,
    // Lookups
    modelBySlug,
    baseModelParent,
    derivedModels,
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
    rankingVariant,
    paidRankingVariant,
    availableRankingVariants,
    paidAvailableRankingVariants,
    roleRankings,
    roleScores,
    roleMeta,
    // Per-role variant state
    paidRoleVariants,
    freeRoleVariants,
    paidMasterVariant,
    freeMasterVariant,
    setPaidMaster,
    setFreeMaster,
    roleVariantOptions,
    freeVariantKeys,
    paidVariantKeys,
    knownIssues,
    testSummary,
    testSummaryPrevious,
    modelScores,
    validationMethod,
    // Provider usage
    providerUsage,
    currentMonth,
    usedUpProviders,
    // Stats
    stats,
    // Paid data
    paidData,
    paidLoading,
    paidError,
    paidLastLoaded,
    paidRoleRankings,
    paidRoleScores,
    paidRoleMeta,
    paidCreators,
    paidProviderRefs,
    paidDatapointById,
    paidModelScores,
    // Actions
    loadData,
    loadPaidData,
    loadSources,
    toggleSource,
    toggleAllSources,
    sourcesPanelOpen,
    requestSourcesPanel,
  };
});
