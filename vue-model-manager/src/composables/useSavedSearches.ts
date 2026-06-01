import { ref, computed, watch } from 'vue'

export interface SavedSearch {
  id: string
  name: string
  query: string
  ts: number
}

const STORAGE_KEY = 'gfm-saved-searches'
const HISTORY_KEY = 'gfm-search-history'
const MAX_HISTORY = 20

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJson<T>(key: string, val: T) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* quota */ }
}

export function useSavedSearches() {
  const saved = ref<SavedSearch[]>(loadJson(STORAGE_KEY, []))
  const history = ref<SavedSearch[]>(loadJson(HISTORY_KEY, []))

  watch(saved, (v) => saveJson(STORAGE_KEY, v), { deep: true })
  watch(history, (v) => saveJson(HISTORY_KEY, v), { deep: true })

  function save(name: string, query: string) {
    const s: SavedSearch = { id: crypto.randomUUID(), name, query, ts: Date.now() }
    saved.value = [s, ...saved.value]
    return s
  }

  function remove(id: string) {
    saved.value = saved.value.filter(s => s.id !== id)
  }

  function rename(id: string, name: string) {
    const s = saved.value.find(s => s.id === id)
    if (s) s.name = name
  }

  function pushHistory(query: string) {
    if (!query.trim()) return
    // Deduplicate: remove existing same query
    history.value = history.value.filter(h => h.query !== query)
    history.value.unshift({ id: crypto.randomUUID(), name: '', query, ts: Date.now() })
    if (history.value.length > MAX_HISTORY) history.value.length = MAX_HISTORY
  }

  function clearHistory() {
    history.value = []
  }

  const hasSaved = computed(() => saved.value.length > 0)
  const hasHistory = computed(() => history.value.length > 0)

  return { saved, history, hasSaved, hasHistory, save, remove, rename, pushHistory, clearHistory }
}
