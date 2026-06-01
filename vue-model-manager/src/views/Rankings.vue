<template>
  <div>
    <div class="page-header">
      <h2>Rankings</h2>
      <p>Role-specific ranked lists of working, non-rate-limited free models</p>
    </div>

    <div class="filters">
      <div class="search-wrap">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          v-model.trim="searchTerm"
          type="text"
          placeholder="Search models…"
          class="search-input"
        />
      </div>
      <div class="status-filter">
        <button
          v-for="opt in statusOptions"
          :key="opt.value"
          :class="['status-btn', { active: statusFilter === opt.value }]"
          @click="statusFilter = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="sort-controls">
        <select v-model="sortBy" class="qb-select">
           <option value="rank">Sort: Rank / Role</option>
           <option value="name">Sort: Name</option>
          <option value="provider">Sort: Provider</option>
          <option value="context">Sort: Context</option>
        </select>
        <button class="sort-dir-btn" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Descending' : 'Ascending'">
          <svg v-if="sortDesc" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </button>
      </div>
      <span class="filter-count">{{ sortedItems.length }} result{{ sortedItems.length !== 1 ? 's' : '' }}</span>
    </div>

    <div class="table-wrap">
      <table v-if="sortedItems.length > 0">
        <thead>
          <tr>
            <th class="sortable" :class="{ active: sortBy === 'rank' }" @click="setSort('rank')">
              Rankings <span class="sort-indicator">{{ sortBy === 'rank' ? (sortDesc ? '↓' : '↑') : '⇅' }}</span>
            </th>
            <th class="sortable" :class="{ active: sortBy === 'name' }" @click="setSort('name')">
              Model <span class="sort-indicator">{{ sortBy === 'name' ? (sortDesc ? '↓' : '↑') : '⇅' }}</span>
            </th>
            <th class="sortable" :class="{ active: sortBy === 'provider' }" @click="setSort('provider')">
              Provider <span class="sort-indicator">{{ sortBy === 'provider' ? (sortDesc ? '↓' : '↑') : '⇅' }}</span>
            </th>
            <th>Status</th>
            <th class="sortable" :class="{ active: sortBy === 'context' }" @click="setSort('context')">
              Context <span class="sort-indicator">{{ sortBy === 'context' ? (sortDesc ? '↓' : '↑') : '⇅' }}</span>
            </th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
            <tr v-for="item in pagedItems" :key="item.modelId">
             <td>
                <div class="rank-pills">
                  <span
                    v-for="r in item.rankings"
                    :key="r.role"
                    class="rank-pill"
                    :class="{ 'rank-top': r.rank <= 3 }"
                    :data-role="r.role"
                  >
                    <span class="rank-num">#{{ r.rank }}</span>
                    <span class="rank-role">{{ formatRole(r.role) }}</span>
                  </span>
                </div>
              </td>
            <td>
              <div class="model-name" :title="item.model?.name ?? item.modelId">{{ item.model?.name ?? item.modelId }}</div>
              <div class="model-id-wrap">
                <span class="model-id" :title="item.modelId">{{ item.modelId }}</span>
                <button class="copy-btn" :class="{ copied: copiedIds.has(item.modelId) }" :title="copiedIds.has(item.modelId) ? 'Copied!' : 'Copy ID'" @click.stop="handleCopy(item.modelId)">
                  {{ copiedIds.has(item.modelId) ? '✓' : '📋' }}
                </button>
              </div>
            </td>
            <td>{{ item.model?.provider ?? '' }}</td>
            <td>
              <span class="badge" :class="`badge-${item.model?.status?.result ?? ''}`">
                {{ formatStatus(item.model?.status?.result) }}
              </span>
            </td>
            <td>
              <span class="context-len" v-if="item.model?.context_length">
                {{ fmtContext(item.model.context_length) }}
              </span>
            </td>
            <td>
              <div class="best-for-tags">
                <span v-for="tag in (item.model?.best_for ?? []).slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
                <span v-if="(item.model?.best_for?.length ?? 0) > 3" class="tag">+{{ (item.model?.best_for?.length ?? 0) - 3 }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="empty-state">
        <div class="empty-state-inner">
          <div class="empty-state-icon">🔍</div>
          <p>No models match the current filters</p>
          <button class="refresh-btn" @click="searchTerm = ''; statusFilter = 'all'">Clear filters</button>
        </div>
      </div>
    </div>

    <!-- Working but unranked -->
    <div v-if="unrankedWorking.length > 0" class="unranked-section">
      <h3 class="section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>
        Working but Unranked
        <span class="unranked-count">{{ unrankedWorking.length }} model{{ unrankedWorking.length !== 1 ? 's' : '' }}</span>
      </h3>
      <p class="unranked-hint">These models are working and free but not yet assigned to a role ranking.</p>
      <div class="unranked-grid">
        <div v-for="model in unrankedWorking" :key="model.id" class="unranked-card">
          <div class="unranked-name" :title="model.name">{{ model.name }}</div>
          <div class="unranked-id-wrap">
            <span class="model-id" :title="model.id">{{ model.id }}</span>
            <button class="copy-btn" :class="{ copied: copiedIds.has(model.id) }" :title="copiedIds.has(model.id) ? 'Copied!' : 'Copy ID'" @click.stop="handleCopy(model.id)">
              {{ copiedIds.has(model.id) ? '✓' : '📋' }}
            </button>
          </div>
          <div class="unranked-meta">
            <span class="badge badge-provider">{{ model.provider }}</span>
            <span v-if="model.context_length" class="badge badge-context">{{ fmtContext(model.context_length) }}</span>
            <span v-for="tag in model.best_for.slice(0, 2)" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="pagination" v-if="sortedItems.length > 0 && totalPages > 1">
      <button :disabled="page === 1" @click="page = 1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
      </button>
      <button :disabled="page === 1" @click="page--">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="page-info">{{ page }} / {{ totalPages }} <span class="page-total">({{ sortedItems.length }} rows)</span></span>
      <button :disabled="page === totalPages" @click="page++">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button :disabled="page === totalPages" @click="page = totalPages">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
      </button>
      <select v-model.number="perPage" class="per-page-select">
        <option :value="10">10 / page</option>
        <option :value="25">25 / page</option>
        <option :value="50">50 / page</option>
        <option :value="0">All</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { useModelsStore } from '@/store/models'

const store = useModelsStore()
const copiedIds = reactive(new Set<string>())
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function handleCopy(id: string) {
  try {
    await navigator.clipboard.writeText(id)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = id
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copiedIds.add(id)
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copiedIds.delete(id) }, 1500)
}

const ROLES = ['model', 'build', 'general', 'small_model', 'explore', 'stable'] as const

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatStatus(s: string | undefined): string {
  if (!s) return '—'
  if (s === 'rate_limited') return 'Rate-limited'
  if (s === 'small_model') return 'Small model'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtContext(n: number): string {
  return n >= 1048576 ? (n / 1048576).toFixed(1) + 'M' : Math.round(n / 1000) + 'K'
}

interface ModelRanking {
  modelId: string
  rankings: { role: string; rank: number }[]
  bestRank: number
}

const flatRankings = computed<ModelRanking[]>(() => {
  const map = new Map<string, { role: string; rank: number }[]>()
  for (const role of ROLES) {
    const arr = store.roleRankings[role] ?? []
    for (let i = 0; i < arr.length; i++) {
      const modelId = arr[i]
      if (!map.has(modelId)) map.set(modelId, [])
      map.get(modelId)!.push({ role, rank: i + 1 })
    }
  }
  const list: ModelRanking[] = []
  for (const [modelId, rankings] of map) {
    rankings.sort((a, b) => a.rank - b.rank)
    list.push({ modelId, rankings, bestRank: rankings[0].rank })
  }
  return list
})

const searchTerm = ref('')
const statusFilter = ref<'all' | 'working' | 'untested'>('all')

const statusOptions = [
  { label: 'All', value: 'all' as const },
  { label: 'Working', value: 'working' as const },
  { label: 'Untested', value: 'untested' as const },
]

const filtered = computed(() => {
  const term = searchTerm.value.toLowerCase()
  return flatRankings.value.filter(mr => {
    const model = store.getModelById(mr.modelId)
    const result = model?.status?.result
    if (statusFilter.value === 'working' && result !== 'working') return false
    if (statusFilter.value === 'untested' && result !== 'untested') return false
    if (!term) return true
    const name = model?.name?.toLowerCase() ?? ''
    return name.includes(term) || mr.modelId.toLowerCase().includes(term)
  })
})

const STATUS_ORDER: Record<string, number> = { working: 0, untested: 1, rate_limited: 2, broken: 3, paid: 4 }
const ROLE_ORDER: Record<string, number> = {}
ROLES.forEach((r, i) => { ROLE_ORDER[r] = i })

const sortBy = ref('rank')
const sortDesc = ref(false)

function setSort(field: string) {
  if (sortBy.value === field) {
    sortDesc.value = !sortDesc.value
  } else {
    sortBy.value = field
    sortDesc.value = false
  }
}

const sortedItems = computed(() => {
  const arr = filtered.value.map(mr => ({
    ...mr,
    model: store.getModelById(mr.modelId),
  }))
  arr.sort((a, b) => {
    let cmp = 0
    switch (sortBy.value) {
      case 'rank':
        cmp = (STATUS_ORDER[a.model?.status?.result ?? ''] ?? 5) - (STATUS_ORDER[b.model?.status?.result ?? ''] ?? 5)
        if (cmp === 0) cmp = a.bestRank - b.bestRank
        if (cmp === 0) cmp = BEST_ROLE_ORDER(a) - BEST_ROLE_ORDER(b)
        break
      case 'name':
        cmp = (a.model?.name ?? '').localeCompare(b.model?.name ?? '')
        break
      case 'provider':
        cmp = (a.model?.provider ?? '').localeCompare(b.model?.provider ?? '')
        break
      case 'context':
        cmp = (a.model?.context_length ?? 0) - (b.model?.context_length ?? 0)
        break
      default:
        cmp = 0
    }
    return sortDesc.value ? -cmp : cmp
  })
  return arr
})

function BEST_ROLE_ORDER(item: ModelRanking): number {
  let best = 99
  for (const r of item.rankings) {
    const o = ROLE_ORDER[r.role] ?? 99
    if (o < best) best = o
  }
  return best
}

const rankedIds = computed(() => {
  const set = new Set<string>()
  for (const role of ROLES) {
    for (const id of (store.roleRankings[role] ?? [])) set.add(id)
  }
  return set
})

const unrankedWorking = computed(() =>
  store.workingModels.filter(m => !rankedIds.value.has(m.id) && !store.isModelProviderUsedUp(m.id))
)

const perPage = ref(25)
const page = ref(1)

watch([sortedItems, perPage], () => { page.value = 1 })

const totalPages = computed(() => {
  if (perPage.value <= 0) return 1
  return Math.max(1, Math.ceil(sortedItems.value.length / perPage.value))
})

const pagedItems = computed(() => {
  if (perPage.value <= 0) return sortedItems.value
  const start = (page.value - 1) * perPage.value
  return sortedItems.value.slice(start, start + perPage.value)
})
</script>

<style scoped>
.filters {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.search-wrap {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 320px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px 8px 36px;
  border-radius: var(--radius);
  font-size: 0.82rem;
  outline: none;
  transition: all 0.2s;
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.qb-select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  outline: none;
  cursor: pointer;
  appearance: auto;
  transition: all 0.2s;
}

.qb-select:focus {
  border-color: var(--accent);
}

.sort-dir-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.sort-dir-btn:hover {
  color: var(--text);
  border-color: var(--accent);
}

.filter-count {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  margin-left: auto;
  font-weight: 500;
}

.rank-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.rank-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
  background: var(--bg-hover);
  color: var(--text-dim);
}

.rank-pill .rank-num {
  font-variant-numeric: tabular-nums;
}

.rank-pill .rank-role {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.65rem;
}

.rank-pill.rank-top {
  background: var(--accent-subtle);
  color: var(--accent);
}

.rank-pill[data-role="model"]       { background: var(--accent-subtle); color: var(--accent); }
.rank-pill[data-role="build"]       { background: var(--green-subtle);  color: var(--green); }
.rank-pill[data-role="general"]     { background: var(--purple-subtle); color: var(--purple); }
.rank-pill[data-role="small_model"] { background: var(--orange-subtle); color: var(--orange); }
.rank-pill[data-role="explore"]     { background: var(--cyan-subtle);   color: var(--cyan); }
.rank-pill[data-role="stable"]      { background: var(--bg-hover);      color: var(--text-dim); }

.rank-pill.rank-top[data-role="model"]       { background: color-mix(in srgb, var(--accent) 25%, var(--accent-subtle)); }
.rank-pill.rank-top[data-role="build"]       { background: color-mix(in srgb, var(--green) 25%, var(--green-subtle)); }
.rank-pill.rank-top[data-role="general"]     { background: color-mix(in srgb, var(--purple) 25%, var(--purple-subtle)); }
.rank-pill.rank-top[data-role="small_model"] { background: color-mix(in srgb, var(--orange) 25%, var(--orange-subtle)); }
.rank-pill.rank-top[data-role="explore"]     { background: color-mix(in srgb, var(--cyan) 25%, var(--cyan-subtle)); }

.status-filter {
  display: flex;
  gap: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 3px;
}

.status-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  padding: 5px 14px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.status-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.status-btn.active {
  background: var(--accent-subtle);
  color: var(--accent);
}

.unranked-section {
  margin-top: 40px;
  margin-bottom: 32px;
}

.unranked-count {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 8px;
}

.unranked-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 16px;
  margin-top: -4px;
}

.unranked-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.unranked-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.unranked-card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.unranked-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unranked-id-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
}

.unranked-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
}

.badge-provider {
  background: var(--accent-subtle);
  color: var(--accent);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  font-size: 0.62rem;
  font-weight: 600;
}

.badge-context {
  background: var(--green-subtle);
  color: var(--green);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  font-size: 0.62rem;
  font-weight: 600;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 24px;
  justify-content: center;
}

.pagination button {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.pagination button:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
  background: var(--bg-hover);
}

.pagination button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.page-info {
  font-size: 0.78rem;
  color: var(--text-dim);
  padding: 0 8px;
  font-weight: 500;
}

.page-total {
  color: var(--text-muted);
  font-size: 0.7rem;
}

.per-page-select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.72rem;
  outline: none;
  cursor: pointer;
  margin-left: 8px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title svg {
  color: var(--orange);
}
</style>
