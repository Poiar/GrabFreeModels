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
  ModelHealthHistory,
  FlakyModel,
  BenchmarkEntry,
  ProviderLatencyStats,
  KeyHealthData,
} from '@/types';

const ROLE_ORDER = ['model', 'build', 'general', 'small_model', 'explore'] as const;
type Role = (typeof ROLE_ORDER)[number];

// ── Rankings-only payload types (lightweight, no creators/models/providers hierarchy) ──
interface ModelIndexEntry {
  name: string;
  slug: string;
  creator: string;
  providerSlug: string;
  providerName: string;
  providerSlugs: string[];
  super_id: number;
}

interface RankingsPayload {
  _role_rankings: ModelsData['_role_rankings'];
  _model_scores: ModelsData['_model_scores'] | null;
  _model_index: Record<string, ModelIndexEntry>;
}

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

async function fetchWithRetry(url: string, signal?: AbortSignal, maxRetries = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { signal });
      if (resp.status === 429 && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      return resp;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      lastError = e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
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

  // ── Rankings-only data (lightweight, no creators/providers/models hierarchy) ──
  const rankingsData = ref<RankingsPayload | null>(null);
  const rankingsLoading = ref(false);
  const rankingsError = ref<string | null>(null);

  const paidRankingsData = ref<RankingsPayload | null>(null);
  const paidRankingsLoading = ref(false);
  const paidRankingsError = ref<string | null>(null);


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
  const families = computed((): FamilyData[] => index.value?.families ?? []);

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
  const allModels = computed((): ModelData[] => index.value?.allModels ?? []);

  // ── Flatten all provider datapoints ──
  const allDatapoints = computed((): ProviderDatapoint[] => index.value?.allDatapoints ?? []);

  // ── Model lookup by slug ──
  const modelBySlug = computed((): Map<string, ModelData> => index.value?.modelBySlug ?? new Map());

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
  const derivedModels = computed((): Map<string, ModelData[]> => index.value?.derivedModels ?? new Map());

  // ── Model lookup by super_id ──
  const modelBySuperId = computed((): Map<number, { model: ModelData; creator: CreatorData }> => index.value?.modelBySuperId ?? new Map());

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

  const workingModels = computed(() => {
    const ids = new Set((index.value?.workingDatapoints ?? []).map(d => index.value?.datapointById.get(d.full_id)?.model.super_id));
    return allModels.value.filter(m => ids.has(m.super_id));
  });
  const brokenModels = computed(() => {
    const ids = new Set([...(index.value?.brokenDatapoints ?? []), ...(index.value?.rateLimitedDatapoints ?? [])]
      .map(d => index.value?.datapointById.get(d.full_id)?.model.super_id));
    return allModels.value.filter(m => ids.has(m.super_id));
  });
  const rateLimitedModels = computed(() => {
    const ids = new Set((index.value?.rateLimitedDatapoints ?? []).map(d => index.value?.datapointById.get(d.full_id)?.model.super_id));
    return allModels.value.filter(m => ids.has(m.super_id));
  });

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
    model: '_benchmarks', build: '_benchmarks', general: '_benchmarks',
    small_model: '_benchmarks', explore: '_benchmarks',
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
    const variant = roleVariants[role] ?? '_benchmarks';
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

  // ── Model health history ──
  function getModelHealth(fullId: string): ModelHealthHistory | null {
    return data.value?._model_health?.[fullId] ?? null;
  }

  // ── Degradation detection ──
  const degradedModels = computed((): Set<string> => {
    const degraded = new Set<string>();
    const health = data.value?._model_health;
    if (!health) return degraded;
    for (const [fullId, history] of Object.entries(health)) {
      if (history.stability >= 80 && history.snapshots.length > 0) {
        const latest = history.snapshots[history.snapshots.length - 1];
        if (latest.status === 'broken') {
          degraded.add(fullId);
        }
      }
    }
    return degraded;
  });

  // ── Metadata ──
  // Free rankings: each role resolved from its own variant
  // Prefer rankings-only payload when available (avoids loading full 7MB ModelsData)
  const roleRankings = computed(() => {
    const r = rankingsData.value?._role_rankings ?? data.value?._role_rankings;
    if (!r) return {} as Record<Role, string[]>;
    const result = {} as Record<Role, string[]>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, freeRoleVariants.value).rankings;
    return result;
  });
  const roleScores = computed(() => {
    const r = rankingsData.value?._role_rankings ?? data.value?._role_rankings;
    if (!r) return {} as Record<string, RoleScore[]>;
    const result = {} as Record<string, RoleScore[]>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, freeRoleVariants.value).scores;
    return result;
  });
  const roleMeta = computed(() => {
    const r = rankingsData.value?._role_rankings ?? data.value?._role_rankings;
    if (!r) return {} as Record<string, RoleMeta>;
    const result = {} as Record<string, RoleMeta>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, freeRoleVariants.value).meta;
    return result;
  });

  const availableRankingVariants = computed(() => {
    const r = rankingsData.value?._role_rankings ?? data.value?._role_rankings;
    const variants = r?._variants;
    const keys = variants ? Object.keys(variants).filter(k => k !== 'combined') : [];
    return keys.length > 0 ? ['combined', ...keys] : ['combined'];
  });

  // ── Paid metadata (per-role variant resolution) ──
  const paidRoleRankings = computed(() => {
    const r = paidRankingsData.value?._role_rankings ?? paidData.value?._role_rankings;
    if (!r) return {} as Record<Role, string[]>;
    const result = {} as Record<Role, string[]>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, paidRoleVariants.value).rankings;
    return result;
  });
  const paidRoleScores = computed(() => {
    const r = paidRankingsData.value?._role_rankings ?? paidData.value?._role_rankings;
    if (!r) return {} as Record<string, RoleScore[]>;
    const result = {} as Record<string, RoleScore[]>;
    for (const role of ROLE_ORDER) result[role] = resolveRoleData(r, role, paidRoleVariants.value).scores;
    return result;
  });
  const paidRoleMeta = computed(() => {
    const r = paidRankingsData.value?._role_rankings ?? paidData.value?._role_rankings;
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
    const r = rankingsData.value?._role_rankings ?? data.value?._role_rankings;
    const variants = r?._variants;
    return variants ? Object.keys(variants).filter(k => k !== 'combined') : [];
  });
  const paidVariantKeys = computed(() => {
    const r = paidRankingsData.value?._role_rankings ?? paidData.value?._role_rankings;
    const variants = r?._variants;
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
  const routerOnlyModels = computed(() => data.value?._router_only_models ?? null);
  const routingGraph = computed(() => data.value?._provider_routing_graph ?? null);
  const providerTimeline = computed(() => data.value?._provider_timeline ?? null);
  const familyCoverage = computed(() => data.value?._family_coverage ?? null);
  const failoverSuggestions = computed(() => data.value?._failover_suggestions ?? { forward: {}, reverse: {} });

  // ── Cost efficiency: intelligence score / provider_count ──
  const costEfficiency = computed((): Map<number, number> => {
    const map = new Map<number, number>();
    const scores = modelScores.value;
    if (!scores?.scores) return map;
    for (const [fullId, scoreList] of Object.entries(scores.scores)) {
      const intel = scoreList.find(s => s.source === 'artificial_analysis' && s.score_type === 'intelligence');
      if (!intel?.score_value) continue;
      const dp = datapointById.value.get(fullId);
      if (!dp) continue;
      const provCount = new Set(dp.model.providers.filter(p => !p._removed).map(p => p.provider_slug)).size;
      if (provCount < 2) continue;
      const efficiency = Math.round(intel.score_value / provCount * 10) / 10;
      const existing = map.get(dp.model.super_id);
      if (!existing || efficiency > existing) map.set(dp.model.super_id, efficiency);
    }
    return map;
  });

  // ── Model of the Day ──
  const modelOfTheDay = computed(() => {
    const candidates: { slug: string; name: string; creator: string | null; intel: number; provCount: number; stable: boolean }[] = [];
    const scores = modelScores.value;
    for (const model of allModels.value) {
      const provs = model.providers.filter(p => !p._removed);
      const working = provs.filter(p => p.status.result === 'working').length;
      if (working === 0) continue;
      const provCount = new Set(provs.map(p => p.provider_slug)).size;
      let intel = 0;
      for (const dp of provs) {
        const dpScores = scores?.scores[dp.full_id];
        if (dpScores) {
          const s = dpScores.find(sc => sc.source === 'artificial_analysis' && sc.score_type === 'intelligence');
          if (s?.score_value && s.score_value > intel) intel = s.score_value;
        }
      }
      if (intel > 0 && provCount >= 2) candidates.push({ slug: model.slug, name: model.name, creator: model.creator, intel, provCount, stable: working === provs.length });
    }
    candidates.sort((a, b) => (b.intel + b.provCount * 3 + (b.stable ? 5 : 0)) - (a.intel + a.provCount * 3 + (a.stable ? 5 : 0)));
    return candidates.slice(0, 5);
  });

  const testSummary = computed(() => data.value?._test_summary ?? null);
  const testSummaryPrevious = computed(() => data.value?._test_summary_previous ?? null);
  const modelScores = computed(() => rankingsData.value?._model_scores ?? data.value?._model_scores ?? null);
  const paidModelScores = computed(() => paidRankingsData.value?._model_scores ?? paidData.value?._model_scores ?? null);
  const validationMethod = computed(() => data.value?._validation_method ?? null);

  // ── Model health aggregated by super_id (for sparklines) ──
  const modelHealthBySuperId = computed((): Map<number, ModelHealthHistory> => {
    const map = new Map<number, ModelHealthHistory>();
    const mh = data.value?._model_health;
    if (!mh) return map;
    for (const [fullId, history] of Object.entries(mh)) {
      if (typeof history !== 'object' || !history?.snapshots) continue;
      const dp = datapointById.value.get(fullId);
      if (!dp) continue;
      const sid = dp.model.super_id;
      const existing = map.get(sid);
      if (!existing || (history as ModelHealthHistory).snapshots.length > existing.snapshots.length) {
        map.set(sid, history as ModelHealthHistory);
      }
    }
    return map;
  });

  // ── Flakiest models by 7-day failure rate ──
  const flakiestModels = computed((): FlakyModel[] => {
    const fr = data.value?._failure_rates?.models;
    if (!fr) return [];
    const result: FlakyModel[] = [];
    for (const [fullId, entry] of Object.entries(fr)) {
      if (!entry || entry.failure_rate_7d === null || entry.failure_rate_7d === 0) continue;
      const dp = datapointById.value.get(fullId);
      if (!dp) continue;
      result.push({
        super_id: dp.model.super_id,
        slug: dp.model.slug,
        name: dp.model.name,
        failure_rate_7d: entry.failure_rate_7d,
        samples_7d: entry.samples_7d,
        failures_7d: entry.failures_7d,
        failure_rate_30d: entry.failure_rate_30d ?? null,
        samples_30d: entry.samples_30d ?? 0,
        failures_30d: entry.failures_30d ?? 0,
      });
    }
    // Dedupe by super_id, keep highest failure rate
    const best = new Map<number, FlakyModel>();
    for (const f of result) {
      const e = best.get(f.super_id);
      if (!e || f.failure_rate_7d > e.failure_rate_7d) best.set(f.super_id, f);
    }
    return [...best.values()].sort((a, b) => b.failure_rate_7d - a.failure_rate_7d);
  });

  // ── Key health ──
  const keyHealth = computed((): import('@/types').KeyHealthData | null => {
    const raw = data.value?._key_health;
    if (!raw) return null;
    return raw as KeyHealthData;
  });

  // ── Deprecated model full_ids ──
  const deprecatedFullIds = computed((): Set<string> => {
    const s = new Set<string>();
    for (const dp of allDatapoints.value) {
      if (dp.deprecated_at) s.add(dp.full_id);
    }
    return s;
  });

  // ── Recently broken: models in current broken list that weren't in previous ──
  const recentlyBroken = computed((): { full_id: string; name: string; slug: string; provider: string }[] => {
    const cur = testSummary.value?.results;
    const prev = testSummaryPrevious.value?.results;
    if (!cur) return [];
    const prevSet = new Set(prev?.broken ?? []);
    const prevNotFound = new Set(prev?.not_found ?? []);
    const newBroken = (cur.broken ?? []).filter(id => !prevSet.has(id));
    const newNotFound = (cur.not_found ?? []).filter(id => !prevNotFound.has(id));
    const result: { full_id: string; name: string; slug: string; provider: string }[] = [];
    for (const id of [...newBroken, ...newNotFound]) {
      const dp = datapointById.value.get(id);
      if (dp) result.push({ full_id: id, name: dp.model.name, slug: dp.model.slug, provider: dp.dp.provider });
    }
    return result.slice(0, 10);
  });

  // ── Recently fixed: models in previous broken that are now working ──
  const recentlyFixed = computed((): { full_id: string; name: string; slug: string; provider: string }[] => {
    const cur = testSummary.value?.results;
    const prev = testSummaryPrevious.value?.results;
    if (!cur || !prev) return [];
    const curWorking = new Set(cur.working ?? []);
    const prevBroken = new Set([...(prev.broken ?? []), ...(prev.not_found ?? [])]);
    const result: { full_id: string; name: string; slug: string; provider: string }[] = [];
    for (const id of prevBroken) {
      if (curWorking.has(id)) {
        const dp = datapointById.value.get(id);
        if (dp) result.push({ full_id: id, name: dp.model.name, slug: dp.model.slug, provider: dp.dp.provider });
      }
    }
    return result.slice(0, 10);
  });

  // ── Benchmark entries (flat list for table view) ──
  const benchmarkEntries = computed((): BenchmarkEntry[] => {
    const scores = modelScores.value;
    if (!scores?.scores) return [];
    const result: BenchmarkEntry[] = [];
    for (const [fullId, scoreList] of Object.entries(scores.scores)) {
      if (!scoreList?.length) continue;
      const dp = datapointById.value.get(fullId);
      if (!dp) continue;
      const intel = scoreList.find(s => s.source === 'artificial_analysis' && s.score_type === 'intelligence');
      const speed = scoreList.find(s => s.source === 'artificial_analysis' && s.score_type === 'speed');
      const cost = scoreList.find(s => s.source === 'artificial_analysis' && s.score_type === 'cost_effectiveness');
      result.push({
        full_id: fullId,
        super_id: dp.model.super_id,
        slug: dp.model.slug,
        name: dp.model.name,
        creator: dp.model.creator,
        provider: dp.dp.provider,
        scores: scoreList,
        intelligence: intel?.score_value ?? null,
        speed: speed?.score_value ?? null,
        cost: cost?.score_value ?? null,
      });
    }
    // Dedupe by super_id, keep entry with most scores
    const best = new Map<number, BenchmarkEntry>();
    for (const e of result) {
      const existing = best.get(e.super_id);
      if (!existing || e.scores.length > existing.scores.length) best.set(e.super_id, e);
    }
    return [...best.values()];
  });

  // ── Provider latency stats (from model_health_snapshots) ──
  const providerLatencies = computed((): ProviderLatencyStats[] => {
    const mh = data.value?._model_health;
    if (!mh) return [];
    // Build from datapoints with last_success latency from snapshots
    const provMap = new Map<string, { name: string; latencies: number[]; lastMeasured: string }>();
    for (const [fullId, history] of Object.entries(mh)) {
      if (typeof history !== 'object' || !history?.snapshots) continue;
      const dp = datapointById.value.get(fullId);
      if (!dp) continue;
      const slug = dp.dp.provider_slug;
      if (!provMap.has(slug)) provMap.set(slug, { name: dp.dp.provider, latencies: [], lastMeasured: '' });
      const entry = provMap.get(slug)!;
      for (const snap of (history as ModelHealthHistory).snapshots) {
        if (snap.latency_ms != null && snap.status === 'working') {
          entry.latencies.push(snap.latency_ms);
          if (!entry.lastMeasured || snap.date > entry.lastMeasured) entry.lastMeasured = snap.date;
        }
      }
    }
    return [...provMap.entries()].map(([slug, e]) => {
      const sorted = e.latencies.sort((a, b) => a - b);
      return {
        provider_slug: slug,
        provider_name: e.name,
        avg_latency_ms: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
        p50_latency_ms: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
        p95_latency_ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        sample_count: sorted.length,
        last_measured: e.lastMeasured,
      };
    }).sort((a, b) => a.avg_latency_ms - b.avg_latency_ms);
  });

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
    // Pre-index all provider metadata from the full provider list for source-filtering path
    const baseUrlMap = new Map(providerRefs.value.map(p => [p.slug, p.base_url]));
    const npmPackageMap = new Map(providerRefs.value.map(p => [p.slug, p.npm_package]));
    const providerTypeMap = new Map(providerRefs.value.map(p => [p.slug, p.provider_type]));
    const servesThirdPartyMap = new Map(providerRefs.value.map(p => [p.slug, p.serves_third_party]));
    const hardwareMap = new Map(providerRefs.value.map(p => [p.slug, p.hardware]));
    const compatMap = new Map(providerRefs.value.map(p => [p.slug, p.is_openai_compat]));
    const streamingMap = new Map(providerRefs.value.map(p => [p.slug, p.supports_streaming]));
    const accountIdMap = new Map(providerRefs.value.map(p => [p.slug, p.requires_account_id]));
    const maxRpmMap = new Map(providerRefs.value.map(p => [p.slug, p.max_rpm]));
    const maxTpmMap = new Map(providerRefs.value.map(p => [p.slug, p.max_tpm]));
    const maxDailyMap = new Map(providerRefs.value.map(p => [p.slug, p.max_daily_requests]));
    const requiresCardMap = new Map(providerRefs.value.map(p => [p.slug, p.requires_card]));
    const descriptionMap = new Map(providerRefs.value.map(p => [p.slug, p.description]));
    const map = new Map<string, { working: number; total: number; name: string; slug: string; base_url: string; npm_package: string | null; provider_type: string | null; serves_third_party: boolean | null; hardware: string | null; is_openai_compat: boolean | null; supports_streaming: boolean | null; requires_account_id: boolean | null; max_rpm: number | null; max_tpm: number | null; max_daily_requests: number | null; requires_card: boolean | null; description: string | null }>();
    for (const model of visibleModels.value) {
      for (const dp of model.providers) {
        const slug = dp.provider_slug;
        if (!map.has(slug)) {
          map.set(slug, { working: 0, total: 0, name: dp.provider, slug, base_url: baseUrlMap.get(slug) || '', npm_package: npmPackageMap.get(slug) || null, provider_type: providerTypeMap.get(slug) || null, serves_third_party: servesThirdPartyMap.get(slug) ?? null, hardware: hardwareMap.get(slug) || null, is_openai_compat: compatMap.get(slug) ?? null, supports_streaming: streamingMap.get(slug) ?? null, requires_account_id: accountIdMap.get(slug) ?? null, max_rpm: maxRpmMap.get(slug) ?? null, max_tpm: maxTpmMap.get(slug) ?? null, max_daily_requests: maxDailyMap.get(slug) ?? null, requires_card: requiresCardMap.get(slug) ?? null, description: descriptionMap.get(slug) || null });
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
      provider_type: e.provider_type,
      serves_third_party: e.serves_third_party,
      hardware: e.hardware,
      is_openai_compat: e.is_openai_compat,
      supports_streaming: e.supports_streaming,
      requires_account_id: e.requires_account_id,
      max_rpm: e.max_rpm,
      max_tpm: e.max_tpm,
      max_daily_requests: e.max_daily_requests,
      requires_card: e.requires_card,
      description: e.description,
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
      index.value = buildIndex(cached.data);
      lastLoaded.value = new Date(cached.cachedAt);
      isStale.value = false;
      loading.value = false;
      startStaleTimer();
    } else {
      loading.value = true;
    }

    try {
      let resp = await fetchWithRetry('/api/data', signal);
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
      index.value = buildIndex(freshData);
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
        index.value = buildIndex(fallbackData);
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
      paidIndex.value = buildIndex(cached.data);
      paidLastLoaded.value = new Date(cached.cachedAt);
      paidLoading.value = false;
    }

    try {
      let resp = await fetchWithRetry('/api/data/paid');
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
      paidIndex.value = buildIndex(freshData);
      saveToCache(rawJson, PAID_CACHE_KEY);
      paidLastLoaded.value = new Date();
    } catch (e: unknown) {
      if (cached) return; // Already showing cached data

      try {
        const fallbackResp = await fetch('/available-models-paid.json');
        const fallbackRaw = await fallbackResp.text();
        const fallbackData: ModelsData = JSON.parse(fallbackRaw);
        paidData.value = fallbackData;
        paidIndex.value = buildIndex(fallbackData);
        saveToCache(fallbackRaw, PAID_CACHE_KEY);
        paidLastLoaded.value = new Date();
      } catch (fe: unknown) {
        paidError.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      paidLoading.value = false;
    }
  }

  // ── Rankings-only loading ──
  function buildModelIndex(full: ModelsData): Record<string, ModelIndexEntry> {
    const modelIndex: Record<string, ModelIndexEntry> = {};
    for (const creator of (full.creators || [])) {
      for (const model of creator.models) {
        const providerSlugs = model.providers
          .filter((p) => !p._removed)
          .map((p) => p.provider_slug)
          .sort();
        for (const dp of model.providers) {
          modelIndex[dp.full_id] = {
            name: model.name,
            slug: model.slug,
            creator: creator.name,
            providerSlug: dp.provider_slug,
            providerName: dp.provider,
            providerSlugs,
            super_id: model.super_id,
          };
        }
      }
    }
    return modelIndex;
  }

  async function loadRankings() {
    // If rankings already loaded and fresh, skip
    if (rankingsData.value && lastLoaded.value) {
      const age = Date.now() - lastLoaded.value.getTime();
      if (age < CACHE_TTL_MS) return;
    }

    // If full data is already loaded and fresh, derive rankings from it
    if (data.value && lastLoaded.value) {
      const age = Date.now() - lastLoaded.value.getTime();
      if (age < CACHE_TTL_MS) {
        if (!rankingsData.value) {
          rankingsData.value = {
            _role_rankings: data.value._role_rankings,
            _model_scores: data.value._model_scores,
            _model_index: buildModelIndex(data.value),
          };
        }
        return;
      }
    }

    rankingsLoading.value = true;
    rankingsError.value = null;

    try {
      const resp = await fetchWithRetry('/api/rankings');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const rawJson = await resp.text();
      rankingsData.value = JSON.parse(rawJson);
      lastLoaded.value = new Date();
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // Fallback: try loading full data if rankings endpoint fails
      if (!data.value) {
        try { await loadData(); } catch { /* will use rankingsError below */ }
      }
      if (!data.value) {
        rankingsError.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      rankingsLoading.value = false;
    }
  }

  async function loadPaidRankings() {
    // If rankings already loaded and fresh, skip
    if (paidRankingsData.value && paidLastLoaded.value) {
      const age = Date.now() - paidLastLoaded.value.getTime();
      if (age < CACHE_TTL_MS) return;
    }

    // If full paid data is already loaded and fresh, derive rankings from it
    if (paidData.value && paidLastLoaded.value) {
      const age = Date.now() - paidLastLoaded.value.getTime();
      if (age < CACHE_TTL_MS) {
        if (!paidRankingsData.value) {
          paidRankingsData.value = {
            _role_rankings: paidData.value._role_rankings,
            _model_scores: paidData.value._model_scores,
            _model_index: buildModelIndex(paidData.value),
          };
        }
        return;
      }
    }

    paidRankingsLoading.value = true;
    paidRankingsError.value = null;

    try {
      const resp = await fetchWithRetry('/api/rankings/paid');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const rawJson = await resp.text();
      paidRankingsData.value = JSON.parse(rawJson);
      paidLastLoaded.value = new Date();
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (!paidData.value) {
        try { await loadPaidData(); } catch { /* will use rankingsError below */ }
      }
      if (!paidData.value) {
        paidRankingsError.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      paidRankingsLoading.value = false;
    }
  }

  // ── Datapoint resolvers for RankingsExplorer (from lightweight model index) ──
  function resolveFromIndex(
    idx: Record<string, ModelIndexEntry> | undefined,
    id: string,
  ): { dp: ProviderDatapoint; model: ModelData; creator: CreatorData } | undefined {
    if (!idx || !idx[id]) return undefined;
    const entry = idx[id];
    const dp = {
      full_id: id,
      provider: entry.providerName,
      provider_slug: entry.providerSlug,
      provider_type: null as string | null,
      serves_third_party: null as boolean | null,
      hardware: null as string | null,
      is_openai_compat: null as boolean | null,
      supports_streaming: null as boolean | null,
      requires_account_id: null as boolean | null,
      context_length: null as number | null,
      quantization: null as string | null,
      is_free: true,
      supports_tools: null as boolean | null,
      supports_reasoning: null as boolean | null,
      supports_attachment: null as boolean | null,
      supports_structured_output: null as boolean | null,
      output_limit: null as number | null,
      temperature: null as number | null,
      open_weights: null as boolean | null,
      tags: [] as string[],
      best_for: [] as string[],
      input_types: [] as string[],
      output_types: [] as string[],
      model_tier: [] as string[],
      model_variant: null as string | null,
      param_count_b: null as number | null,
      active_param_count_b: null as number | null,
      expert_count: null as number | null,
      thinking_variant: false,
      model_version: null as string | null,
      release_stage: null as string | null,
      coding_specialized: false,
      description: null as string | null,
      status: { tested: null as string | null, result: 'working' as const, detail: '' },
      last_success: null as string | null,
      _removed: false,
      source_ids: [] as number[],
      family: null as string | null,
      base_model: null as string | null,
      knowledge_cutoff: null as string | null,
      last_updated: null as string | null,
      release_date: null as string | null,
      deprecated_at: null as string | null,
      failure_category: null as string | null,
      base_url: null as string | null,
      npm_package: null as string | null,
      created_at: null as string | null,
      priority_score: null as number | null,
      limitations: null as number | null,
      notes: null as string | null,
      max_rpm: null as number | null,
      max_tpm: null as number | null,
      max_daily_requests: null as number | null,
      requires_card: null as boolean | null,
    } as ProviderDatapoint;
    return {
      dp,
      model: {
        super_id: entry.super_id,
        name: entry.name,
        slug: entry.slug,
        creator: entry.creator || null,
        base_creator: null as string | null,
        family: null as string | null,
        base_model: null as string | null,
        derivation_method: null as string | null,
        best_for: [] as string[],
        best_context: null as number | null,
        min_context: null as number | null,
        role_rankings: {},
        providers: [dp],
      } as ModelData,
      creator: {
        id: '',
        name: entry.creator || '',
        type: 'lab' as const,
        role: 'Model creator' as const,
        description: null as string | null,
        model_count: 0,
        provider_count: 0,
        models: [] as ModelData[],
      } as CreatorData,
    };
  }

  function rankingsDatapointById(
    id: string,
  ): { dp: ProviderDatapoint; model: ModelData; creator: CreatorData } | undefined {
    return resolveFromIndex(rankingsData.value?._model_index, id) ?? datapointById.value.get(id);
  }

  function paidRankingsDatapointById(
    id: string,
  ): { dp: ProviderDatapoint; model: ModelData; creator: CreatorData } | undefined {
    return resolveFromIndex(paidRankingsData.value?._model_index, id) ?? paidDatapointById.value.get(id);
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
    // Health history
    getModelHealth,
    degradedModels,
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
    routerOnlyModels,
    routingGraph,
    providerTimeline,
    familyCoverage,
    failoverSuggestions,
    costEfficiency,
    modelOfTheDay,
    testSummary,
    testSummaryPrevious,
    modelScores,
    validationMethod,
    // New features
    modelHealthBySuperId,
    flakiestModels,
    keyHealth,
    deprecatedFullIds,
    recentlyBroken,
    recentlyFixed,
    benchmarkEntries,
    providerLatencies,
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
    index,
    paidIndex,
    paidModelScores,
    // Rankings-only data (lightweight)
    rankingsData,
    rankingsLoading,
    rankingsError,
    paidRankingsData,
    paidRankingsLoading,
    paidRankingsError,
    rankingsDatapointById,
    paidRankingsDatapointById,
    // Actions
    loadData,
    loadPaidData,
    loadRankings,
    loadPaidRankings,
    loadSources,
    toggleSource,
    toggleAllSources,
    sourcesPanelOpen,
    requestSourcesPanel,
  };
});
