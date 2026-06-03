import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ModelsData, DatapointModel, SuperModel, RoleScore, RoleMeta, ModelScoresData } from '@/types'

const ROLE_ORDER = ['model', 'build', 'general', 'small_model', 'explore'] as const
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

  // ── Raw datapoints ──
  const allDatapoints = computed(() => data.value?.models ?? [])

  // ── Grouped by super model ──
  const superModels = computed((): SuperModel[] => {
    const map = new Map<number, SuperModel>()
    for (const dp of allDatapoints.value) {
      if (!map.has(dp.super_id)) {
        map.set(dp.super_id, {
          id: dp.super_id,
          name: dp.super_name,
          datapoints: [],
          best_context_length: null,
          any_working: false,
          any_tools: false,
          providers: [],
          all_free: true,
          sources: [],
        })
      }
      const m = map.get(dp.super_id)!
      m.datapoints.push(dp)
      if (dp.context_length && (!m.best_context_length || dp.context_length > m.best_context_length)) {
        m.best_context_length = dp.context_length
      }
      if (dp.status.result === 'working') m.any_working = true
      if (dp.supports_tools === true) m.any_tools = true
      if (!dp.is_free) m.all_free = false
      if (!m.providers.includes(dp.provider)) m.providers.push(dp.provider)
      if (!m.sources.includes(dp.source)) m.sources.push(dp.source)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  })

  const superModelById = computed(() => {
    const map = new Map<number, SuperModel>()
    for (const m of superModels.value) map.set(m.id, m)
    return map
  })

  // ── Convenience: flat lists (backward compat) ──
  const allModels = computed(() => allDatapoints.value)
  const freeModels = computed(() => allDatapoints.value.filter(d => d.is_free))
  const paidModels = computed(() => allDatapoints.value.filter(d => !d.is_free))
  const workingModels = computed(() => freeModels.value.filter(d => !d._removed && d.status.result === 'working'))
  const brokenModels = computed(() => freeModels.value.filter(d => d.status.result === 'broken'))
  const rateLimitedModels = computed(() => freeModels.value.filter(d => d.status.result === 'rate_limited'))
  const untestedModels = computed(() => freeModels.value.filter(d => d.status.result === 'untested'))
  const removedModels = computed(() => allDatapoints.value.filter(d => d._removed === true))

  const allProviderNames = computed(() => {
    const set = new Set(allDatapoints.value.map(d => d.provider))
    return Array.from(set).sort()
  })

  const allAuthorNames = computed(() => {
    const set = new Set(allDatapoints.value.map(d => d.author).filter((a): a is string => !!a))
    return Array.from(set).sort()
  })

  const providerHealth = computed(() => {
    const health: Record<string, { working: number; rate_limited: number; broken: number; total: number }> = {}
    for (const d of freeModels.value) {
      if (!health[d.provider]) health[d.provider] = { working: 0, rate_limited: 0, broken: 0, total: 0 }
      const h = health[d.provider]; h.total++
      if (d.status.result === 'working') h.working++
      else if (d.status.result === 'rate_limited') h.rate_limited++
      else if (d.status.result === 'broken') h.broken++
    }
    return health
  })

  const roleRankings = computed(() => {
    const r = data.value?._role_rankings
    if (!r) return {} as Record<Role, string[]>
    const result = {} as Record<Role, string[]>
    for (const role of ROLE_ORDER) result[role] = r[role] ?? []
    return result
  })

  const roleScores = computed(() => data.value?._role_rankings?._scores ?? {} as Record<string, RoleScore[]>)

  const roleMeta = computed(() => data.value?._role_rankings?._meta ?? {} as Record<string, RoleMeta>)

  const modelScores = computed((): ModelScoresData | null => {
    const raw = data.value?._model_scores;
    if (!raw) return null;
    return raw as ModelScoresData;
  });

  function getRoleScore(role: string, modelId: string): RoleScore | undefined {
    return roleScores.value[role]?.find(s => s.id === modelId)
  }

  const knownIssues = computed(() => data.value?._known_issues.issues ?? [])

  const providerUsage = computed(() => {
    const raw = data.value?._provider_usage
    if (!raw) return {} as Record<string, { month: string; reason: string }>
    const result: Record<string, { month: string; reason: string }> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'description') continue
      if (typeof value === 'object' && value !== null && 'month' in value) result[key] = value as { month: string; reason: string }
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
  const usedUpProviderSet = computed(() => new Set(usedUpProviders.value))

  function isProviderUsedUp(provider: string): boolean {
    return usedUpProviderSet.value.has(provider)
  }

  function extractProvider(modelId: string): string {
    const slash = modelId.indexOf('/')
    return slash === -1 ? modelId : modelId.substring(0, slash)
  }

  function isModelProviderUsedUp(modelId: string): boolean {
    return isProviderUsedUp(extractProvider(modelId))
  }

  const schemaIssueModels = computed(() => {
    const ids = data.value?._test_summary.results.schema_issues ?? []
    return ids.map(entry => {
      const sep = entry.indexOf(' — ')
      if (sep === -1) return { modelId: entry.trim(), detail: '' }
      return { modelId: entry.substring(0, sep).trim(), detail: entry.substring(sep + 3).trim() }
    })
  })

  const testSummary = computed(() => data.value?._test_summary ?? null)
  const validationMethod = computed(() => data.value?._validation_method ?? null)

  const stats = computed(() => ({
    total: allDatapoints.value.length,
    supers: superModels.value.length,
    free: freeModels.value.length,
    paid: paidModels.value.length,
    working: workingModels.value.length,
    broken: brokenModels.value.length,
    rateLimited: rateLimitedModels.value.length,
    untested: untestedModels.value.length,
    workingRatio: freeModels.value.length > 0 ? workingModels.value.length / freeModels.value.length : 0,
  }))

  const modelById = computed(() => {
    const map = new Map<string, DatapointModel>()
    for (const d of allDatapoints.value) map.set(d.id, d)
    return map
  })

  function getModelById(id: string): DatapointModel | undefined {
    return modelById.value.get(id)
  }

  // ── Actions ──
  let abortController: AbortController | null = null
  const LOAD_RETRIES = 3
  const LOAD_RETRY_MS = 1500

  async function fetchWithRetry(url: string, signal: AbortSignal): Promise<Response> {
    let lastErr: Error | null = null
    for (let attempt = 1; attempt <= LOAD_RETRIES; attempt++) {
      try {
        const resp = await fetch(url, { signal })
        if (resp.ok) return resp
        if (resp.status < 500) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
        lastErr = new Error(`HTTP ${resp.status}: ${resp.statusText}`)
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e
        lastErr = e instanceof Error ? e : new Error(String(e))
      }
      if (attempt < LOAD_RETRIES) await new Promise(r => setTimeout(r, LOAD_RETRY_MS * attempt))
    }
    throw lastErr ?? new Error('Unknown error')
  }

  async function loadData() {
    abortController?.abort()
    abortController = new AbortController()
    loading.value = true
    error.value = null
    try {
      const resp = await fetchWithRetry('/api/data', abortController.signal)
      data.value = await resp.json()
      lastLoaded.value = new Date()
      isStale.value = false
      startStaleTimer()
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return {
    loading, error, lastLoaded, isStale,
    // Super model grouping
    superModels, superModelById,
    // Flat lists (backward compat)
    allModels, allDatapoints, freeModels, paidModels,
    workingModels, brokenModels, rateLimitedModels, untestedModels, removedModels,
    schemaIssueModels, allProviderNames, allAuthorNames, providerHealth,
    roleRankings, roleScores, roleMeta, getRoleScore, knownIssues, providerUsage,
    currentMonth, usedUpProviders, usedUpProviderSet, isProviderUsedUp,
    extractProvider, isModelProviderUsedUp,
    testSummary, validationMethod, stats,
    modelById, getModelById, loadData, modelScores,
  }
})
