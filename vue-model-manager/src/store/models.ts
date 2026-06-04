import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ModelsData, CreatorData, ModelData, ProviderDatapoint, ProviderReference, RoleScore, RoleMeta } from '@/types'

const ROLE_ORDER = ['model', 'build', 'stable', 'general', 'small_model', 'explore'] as const
type Role = (typeof ROLE_ORDER)[number]

export const useModelsStore = defineStore('models', () => {
  const data = ref<ModelsData | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const lastLoaded = ref<Date | null>(null)
  const isStale = ref(false)

  let staleTimer: ReturnType<typeof setTimeout> | null = null
  function startStaleTimer() { stopStaleTimer(); staleTimer = setTimeout(() => { isStale.value = true }, 3_600_000) }
  function stopStaleTimer() { if (staleTimer !== null) { clearTimeout(staleTimer); staleTimer = null } }

  // ── Hierarchical data access ──
  const creators = computed((): CreatorData[] => data.value?.creators ?? [])
  const providerRefs = computed((): ProviderReference[] => data.value?.providers ?? [])

  // ── Flatten all models across all creators ──
  const allModels = computed((): ModelData[] => {
    const result: ModelData[] = []
    for (const creator of creators.value) {
      for (const model of creator.models) {
        result.push(model)
      }
    }
    return result
  })

  // ── Flatten all provider datapoints ──
  const allDatapoints = computed((): ProviderDatapoint[] => {
    const result: ProviderDatapoint[] = []
    for (const model of allModels.value) {
      for (const dp of model.providers) {
        result.push(dp)
      }
    }
    return result
  })

  // ── Model lookup by super_id ──
  const modelBySuperId = computed((): Map<number, { model: ModelData; creator: CreatorData }> => {
    const map = new Map()
    for (const creator of creators.value) {
      for (const model of creator.models) {
        map.set(model.super_id, { model, creator })
      }
    }
    return map
  })

  // ── Datapoint lookup by full_id ──
  const datapointById = computed((): Map<string, { dp: ProviderDatapoint; model: ModelData; creator: CreatorData }> => {
    const map = new Map()
    for (const creator of creators.value) {
      for (const model of creator.models) {
        for (const dp of model.providers) {
          map.set(dp.full_id, { dp, model, creator })
        }
      }
    }
    return map
  })

  // ── Filtered model lists ──
  const freeModels = computed(() =>
    allModels.value.filter(m => m.providers.some(p => p.is_free && !p._removed))
  )

  const paidModels = computed(() =>
    allModels.value.filter(m => m.providers.some(p => !p.is_free && !p._removed))
  )

  const workingModels = computed(() =>
    allModels.value.filter(m =>
      m.providers.some(p => !p._removed && p.status.result === 'working')
    )
  )

  const brokenModels = computed(() =>
    allModels.value.filter(m =>
      m.providers.some(p => p.status.result === 'broken')
    )
  )

  const rateLimitedModels = computed(() =>
    allModels.value.filter(m =>
      m.providers.some(p => p.status.result === 'rate_limited')
    )
  )

  const untestedModels = computed(() =>
    allModels.value.filter(m =>
      m.providers.some(p => p.status.result === 'untested')
    )
  )

  const removedModels = computed(() =>
    allModels.value.filter(m =>
      m.providers.every(p => p._removed)
    )
  )

  // ── Model status classification ──
  function getModelStatus(model: ModelData): 'working' | 'mixed' | 'untested' | 'down' {
    const activeProviders = model.providers.filter(p => !p._removed)
    if (activeProviders.length === 0) return 'down'
    const working = activeProviders.filter(p => p.status.result === 'working').length
    const untested = activeProviders.filter(p => p.status.result === 'untested').length
    const broken = activeProviders.filter(p => p.status.result === 'broken').length
    if (working === activeProviders.length) return 'working'
    if (untested === activeProviders.length) return 'untested'
    if (working > 0) return 'mixed'
    if (broken === activeProviders.length) return 'down'
    return 'mixed'
  }

  // ── Metadata ──
  const roleRankings = computed(() => {
    const r = data.value?._role_rankings
    if (!r) return {} as Record<Role, string[]>
    const result = {} as Record<Role, string[]>
    for (const role of ROLE_ORDER) result[role] = r[role] ?? []
    return result
  })

  const roleScores = computed(() => data.value?._role_rankings?._scores ?? {} as Record<string, RoleScore[]>)
  const roleMeta = computed(() => data.value?._role_rankings?._meta ?? {} as Record<string, RoleMeta>)

  const knownIssues = computed(() => data.value?._known_issues?.issues ?? [])

  const testSummary = computed(() => data.value?._test_summary ?? null)
  const validationMethod = computed(() => data.value?._validation_method ?? null)

  const providerUsage = computed(() => {
    const raw = data.value?._provider_usage
    if (!raw) return {} as Record<string, { month: string; reason: string }>
    const result: Record<string, { month: string; reason: string }> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'description') continue
      if (typeof value === 'object' && value !== null && 'month' in value) {
        result[key] = value as { month: string; reason: string }
      }
    }
    return result
  })

  const currentMonth = computed(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const usedUpProviders = computed(() => {
    const current = currentMonth.value
    return Object.entries(providerUsage.value).filter(([, u]) => u.month === current).map(([p]) => p)
  })

  // ── Stats ──
  const stats = computed(() => {
    const totalModels = allModels.value.length
    const totalDatapoints = allDatapoints.value.length
    const freeCount = allDatapoints.value.filter(d => d.is_free).length
    const workingCount = allDatapoints.value.filter(d => d.status.result === 'working').length
    const brokenCount = allDatapoints.value.filter(d => d.status.result === 'broken').length

    return {
      creators: creators.value.length,
      models: totalModels,
      datapoints: totalDatapoints,
      providers: providerRefs.value.length,
      free: freeCount,
      working: workingCount,
      broken: brokenCount,
      workingRatio: freeCount > 0 ? workingCount / freeCount : 0,
    }
  })

  // ── Actions ──
  let abortController: AbortController | null = null

  async function loadData() {
    abortController?.abort()
    abortController = new AbortController()
    loading.value = true
    error.value = null
    const signal = abortController.signal
    try {
      let resp = await fetch('/api/data', { signal })
      if (!resp.ok) resp = await fetch('/available-models.json', { signal })
      data.value = await resp.json()
      lastLoaded.value = new Date()
      isStale.value = false
      startStaleTimer()
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      try {
        const fallback = await fetch('/available-models.json', { signal })
        data.value = await fallback.json()
        lastLoaded.value = new Date()
        isStale.value = false
        startStaleTimer()
      } catch (fe: unknown) {
        if (fe instanceof DOMException && (fe as DOMException).name === 'AbortError') return
        error.value = e instanceof Error ? e.message : String(e)
      }
    } finally {
      loading.value = false
    }
  }

  return {
    loading, error, lastLoaded, isStale,
    // Hierarchical access
    creators, providerRefs,
    // Flat lists
    allModels, allDatapoints,
    // Lookups
    modelBySuperId, datapointById,
    // Filtered lists
    freeModels, paidModels, workingModels, brokenModels, rateLimitedModels, untestedModels, removedModels,
    // Model status helper
    getModelStatus,
    // Metadata
    roleRankings, roleScores, roleMeta, knownIssues, testSummary, validationMethod,
    // Provider usage
    providerUsage, currentMonth, usedUpProviders,
    // Stats
    stats,
    // Actions
    loadData,
  }
})