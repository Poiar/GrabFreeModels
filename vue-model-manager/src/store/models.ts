import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ModelsData, Model } from '@/types'

const ROLE_ORDER = ['model', 'build', 'general', 'small_model', 'explore', 'stable'] as const
type Role = (typeof ROLE_ORDER)[number]

export const useModelsStore = defineStore('models', () => {
  const data = ref<ModelsData | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const lastLoaded = ref<Date | null>(null)

  // ── Computed getters ──

  const allModels = computed(() => data.value?.models ?? [])

  const freeModels = computed(() => allModels.value.filter(m => m.is_free))

  const paidModels = computed(() => allModels.value.filter(m => !m.is_free))

  const workingModels = computed(() => freeModels.value.filter(m => m.status.result === 'working'))

  const brokenModels = computed(() => freeModels.value.filter(m => m.status.result === 'broken'))

  const rateLimitedModels = computed(() => freeModels.value.filter(m => m.status.result === 'rate_limited'))

  const untestedModels = computed(() => freeModels.value.filter(m => m.status.result === 'untested'))

  const schemaIssueModels = computed(() => {
    const ids = data.value?._test_summary.results.schema_issues ?? []
    return ids.map(entry => {
      const [modelId, ...rest] = entry.split(' — ')
      return { modelId: modelId.trim(), detail: rest.join(' — ').trim() }
    })
  })

  /** Map of provider → models (free only). Renamed from `providers` to avoid collision with view-level provider list. */
  const freeModelsByProvider = computed(() => {
    const map = new Map<string, Model[]>()
    for (const m of freeModels.value) {
      if (!map.has(m.provider)) map.set(m.provider, [])
      map.get(m.provider)!.push(m)
    }
    return map
  })

  /** Sorted list of all unique provider names across all models. */
  const allProviderNames = computed(() => {
    const set = new Set(allModels.value.map(m => m.provider))
    return Array.from(set).sort()
  })

  const providerHealth = computed(() => data.value?.provider_health ?? {})

  const roleRankings = computed(() => {
    const r = data.value?._role_rankings
    if (!r) return {} as Record<Role, string[]>
    const result = {} as Record<Role, string[]>
    for (const role of ROLE_ORDER) {
      result[role] = r[role] ?? []
    }
    return result
  })

  const knownIssues = computed(() => data.value?._known_issues.issues ?? [])

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
    const result: string[] = []
    for (const [provider, usage] of Object.entries(providerUsage.value)) {
      if (usage.month === current) result.push(provider)
    }
    return result
  })

  /** O(1) lookup for whether a provider is used up. */
  const usedUpProviderSet = computed(() => new Set(usedUpProviders.value))

  function isProviderUsedUp(provider: string): boolean {
    return usedUpProviderSet.value.has(provider)
  }

  const testSummary = computed(() => data.value?._test_summary ?? null)

  const validationMethod = computed(() => data.value?._validation_method ?? null)

  const stats = computed(() => ({
    total: allModels.value.length,
    free: freeModels.value.length,
    paid: paidModels.value.length,
    working: workingModels.value.length,
    broken: brokenModels.value.length,
    rateLimited: rateLimitedModels.value.length,
    untested: untestedModels.value.length,
    workingRatio: freeModels.value.length > 0
      ? workingModels.value.length / freeModels.value.length
      : 0,
  }))

  /** Whether the loaded data is older than 1 hour. */
  const isStale = computed(() => {
    if (!lastLoaded.value) return false
    return Date.now() - lastLoaded.value.getTime() > 3_600_000
  })

  // ── Actions ──

  async function loadData() {
    loading.value = true
    error.value = null
    try {
      const resp = await fetch(`/available-models.json?t=${Date.now()}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
      data.value = await resp.json()
      lastLoaded.value = new Date()
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function getModelById(id: string): Model | undefined {
    return allModels.value.find(m => m.id === id)
  }

  return {
    data, loading, error, lastLoaded, isStale,
    allModels, freeModels, paidModels,
    workingModels, brokenModels, rateLimitedModels, untestedModels,
    schemaIssueModels, freeModelsByProvider, allProviderNames, providerHealth,
    roleRankings, knownIssues, providerUsage,
    currentMonth, usedUpProviders, usedUpProviderSet, isProviderUsedUp,
    testSummary, validationMethod, stats,
    loadData, getModelById,
  }
})
