<template>
  <div>
    <div class="page-header">
      <h2>Rankings</h2>
      <p>Role-specific ranked lists of verified free models only — paid, removed, broken, and rate-limited models are excluded. Each model appears once with all its role rankings shown as pills.</p>
    </div>

    <div class="filters">
      <div class="search-wrap">
        <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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
        <select v-model="sortBy" class="sort-select">
          <option value="rank">Sort: Rank</option>
          <option value="name">Sort: Name</option>
          <option value="provider">Sort: Provider</option>
          <option value="context">Sort: Context</option>
        </select>
        <button class="sort-dir-btn" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Descending' : 'Ascending'">
          <svg v-if="sortDesc" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </button>
      </div>
      <span class="result-count">{{ sortedItems.length }} result{{ sortedItems.length !== 1 ? 's' : '' }}</span>
    </div>

    <div class="table-wrap">
      <table v-if="sortedItems.length > 0">
        <thead>
          <tr>
            <th class="sortable" :class="{ active: sortBy === 'rank' }" @click="setSort('rank')">
              Rankings <SortArrow :active="sortBy === 'rank'" :desc="sortDesc" />
            </th>
            <th class="sortable" :class="{ active: sortBy === 'name' }" @click="setSort('name')">
              Model <SortArrow :active="sortBy === 'name'" :desc="sortDesc" />
            </th>
            <th class="sortable" :class="{ active: sortBy === 'provider' }" @click="setSort('provider')">
              Provider <SortArrow :active="sortBy === 'provider'" :desc="sortDesc" />
            </th>
            <th>Status</th>
            <th class="sortable" :class="{ active: sortBy === 'context' }" @click="setSort('context')">
              Context <SortArrow :active="sortBy === 'context'" :desc="sortDesc" />
            </th>
            <th>Tools</th>
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
                  :title="formatRole(r.role) + ' rank #' + r.rank"
                >
                  <span class="rp-num">#{{ r.rank }}</span>
                  <span class="rp-role">{{ formatRole(r.role) }}</span>
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
              <span class="context-badge" v-if="item.model?.context_length">
                {{ fmtContext(item.model.context_length) }}
              </span>
            </td>
            <td>
              <span v-if="item.model?.supports_tools === true" class="tool-badge tool-yes" title="Supports tool calling">✓</span>
              <span v-else-if="item.model?.supports_tools === false" class="tool-badge tool-no" title="No tool calling">✗</span>
              <span v-else class="tool-badge tool-unknown">—</span>
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
          <button class="clear-btn" @click="searchTerm = ''; statusFilter = 'all'">Clear filters</button>
        </div>
      </div>
    </div>

    <!-- Working but unranked -->
    <div v-if="unrankedWorking.length > 0" class="unranked-section">
      <h3 class="section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>
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
      <button class="pg-btn" :disabled="page === 1" @click="page = 1" title="First">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
      </button>
      <button class="pg-btn" :disabled="page === 1" @click="page--" title="Previous">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="pg-info">{{ page }} / {{ totalPages }} <span class="pg-total">({{ sortedItems.length }} rows)</span></span>
      <button class="pg-btn" :disabled="page === totalPages" @click="page++" title="Next">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="pg-btn" :disabled="page === totalPages" @click="page = totalPages" title="Last">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
      </button>
      <select v-model.number="perPage" class="pg-per-page">
        <option :value="10">10 / page</option>
        <option :value="25">25 / page</option>
        <option :value="50">50 / page</option>
        <option :value="0">All</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, h, defineComponent } from 'vue'
import { useModelsStore } from '@/store/models'

const SortArrow = defineComponent({
  props: { active: Boolean, desc: Boolean },
  setup(props) {
    return () => h('span', { class: ['sort-arrow', { active: props.active }] },
      props.active ? (props.desc ? ' ↓' : ' ↑') : ' ⇅'
    )
  }
})

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
    const model = store.allModels.find(m => m.id === modelId)
    if (!model || !model.is_free || model._removed || model.status.result === 'broken' || model.status.result === 'rate_limited') continue
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

function bestRoleOrder(item: ModelRanking): number {
  let best = 99
  for (const r of item.rankings) {
    const o = ROLE_ORDER[r.role] ?? 99
    if (o < best) best = o
  }
  return best
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
        if (cmp === 0) cmp = bestRoleOrder(a) - bestRoleOrder(b)
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
/* ── Filters bar ── */
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-wrap {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 300px;
}

.search-icon {
  position: absolute;
  left: 10px;
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
  padding: 7px 10px 7px 32px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(88,166,255,0.12);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.status-filter {
  display: flex;
  gap: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px;
}

.status-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  padding: 5px 14px;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.status-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.status-btn.active {
  background: var(--accent-subtle, rgba(88,166,255,0.12));
  color: var(--accent);
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sort-select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.sort-select:focus {
  border-color: var(--accent);
}

.sort-dir-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.sort-dir-btn:hover {
  color: var(--text);
  border-color: var(--accent);
}

.result-count {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
  margin-left: auto;
  font-weight: 500;
}

/* ── Table ── */
.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

thead th {
  text-align: left;
  padding: 8px 12px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  user-select: none;
}

thead th.sortable {
  cursor: pointer;
  transition: color 0.15s;
}

thead th.sortable:hover {
  color: var(--text);
}

thead th.active {
  color: var(--accent);
}

.sort-arrow {
  font-size: 0.65rem;
  opacity: 0.3;
  font-weight: 400;
}

.sort-arrow.active {
  opacity: 1;
}

tbody tr {
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04));
  transition: background 0.1s;
}

tbody tr:hover {
  background: var(--bg-hover, rgba(255,255,255,0.02));
}

tbody td {
  padding: 8px 12px;
  vertical-align: top;
}

/* ── Rank pills ── */
.rank-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 120px;
}

.rank-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: var(--radius-full, 999px);
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
  line-height: 1;
}

.rank-pill .rp-num {
  font-variant-numeric: tabular-nums;
}

.rank-pill .rp-role {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.6rem;
  opacity: 0.85;
}

/* Role colors */
.rank-pill[data-role="model"]       { background: rgba(88,166,255,0.12); color: var(--accent); }
.rank-pill[data-role="build"]       { background: rgba(63,185,80,0.12);  color: var(--green); }
.rank-pill[data-role="general"]     { background: rgba(188,140,255,0.12); color: var(--purple); }
.rank-pill[data-role="small_model"] { background: rgba(210,153,34,0.12); color: var(--orange); }
.rank-pill[data-role="explore"]     { background: rgba(57,210,192,0.12);  color: var(--cyan); }
.rank-pill[data-role="stable"]      { background: rgba(230,237,243,0.06); color: var(--text-dim); }

/* Top 3 highlight */
.rank-pill.rank-top[data-role="model"]       { background: rgba(88,166,255,0.22); box-shadow: 0 0 0 1px rgba(88,166,255,0.2); }
.rank-pill.rank-top[data-role="build"]       { background: rgba(63,185,80,0.22);  box-shadow: 0 0 0 1px rgba(63,185,80,0.2); }
.rank-pill.rank-top[data-role="general"]     { background: rgba(188,140,255,0.22); box-shadow: 0 0 0 1px rgba(188,140,255,0.2); }
.rank-pill.rank-top[data-role="small_model"] { background: rgba(210,153,34,0.22); box-shadow: 0 0 0 1px rgba(210,153,34,0.2); }
.rank-pill.rank-top[data-role="explore"]     { background: rgba(57,210,192,0.22);  box-shadow: 0 0 0 1px rgba(57,210,192,0.2); }

/* ── Model cell ── */
.model-name {
  font-weight: 600;
  color: var(--text);
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-id-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
}

.model-id {
  font-size: 0.68rem;
  color: var(--text-muted);
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono, monospace);
  line-height: 1;
}

.copy-btn {
  background: none;
  border: 1px solid transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 0.85rem;
  line-height: 1;
  transition: all 0.15s;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.copy-btn:hover {
  color: var(--text);
  background: var(--bg-hover, rgba(255,255,255,0.06));
}

.copy-btn.copied {
  color: var(--green);
}

/* ── Badges ── */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-full, 999px);
  font-size: 0.65rem;
  font-weight: 600;
  white-space: nowrap;
}

.badge-working      { background: rgba(63,185,80,0.12);  color: var(--green); }
.badge-untested     { background: rgba(210,153,34,0.12); color: var(--orange); }
.badge-rate_limited { background: rgba(248,81,73,0.12);  color: var(--red, #f85149); }
.badge-broken       { background: rgba(248,81,73,0.12);  color: var(--red, #f85149); }
.badge-paid         { background: rgba(230,237,243,0.06); color: var(--text-dim); }

.context-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: var(--radius-full, 999px);
  font-size: 0.65rem;
  font-weight: 600;
  background: rgba(63,185,80,0.10);
  color: var(--green);
  white-space: nowrap;
}

.best-for-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.6rem;
  font-weight: 500;
  background: rgba(230,237,243,0.06);
  color: var(--text-dim);
  white-space: nowrap;
}

/* ── Empty state ── */
.empty-state {
  padding: 48px 0;
  text-align: center;
}

.empty-state-icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

.empty-state p {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.clear-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.clear-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Unranked section ── */
.unranked-section {
  margin-top: 36px;
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}

.section-title svg {
  color: var(--orange);
}

.unranked-count {
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 4px;
}

.unranked-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-bottom: 14px;
}

.unranked-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.unranked-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  transition: border-color 0.15s;
}

.unranked-card:hover {
  border-color: var(--border-focus, var(--accent));
}

.unranked-name {
  font-weight: 600;
  font-size: 0.82rem;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unranked-id-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.unranked-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.badge-provider {
  background: rgba(88,166,255,0.12);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.62rem;
  font-weight: 600;
}

.badge-context {
  background: rgba(63,185,80,0.12);
  color: var(--green);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.62rem;
  font-weight: 600;
}

/* ── Pagination ── */
.pagination {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 20px;
  justify-content: center;
}

.pg-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.pg-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
  background: var(--bg-hover, rgba(255,255,255,0.04));
}

.pg-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.pg-info {
  font-size: 0.75rem;
  color: var(--text-dim);
  padding: 0 8px;
  font-weight: 500;
}

.pg-total {
  color: var(--text-muted);
  font-size: 0.68rem;
}

.pg-per-page {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  outline: none;
  cursor: pointer;
  margin-left: 6px;
}
</style>
