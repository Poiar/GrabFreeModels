<template>
  <div>
    <div class="page-header">
      <h2>Rankings</h2>
      <p>Role-specific ranked lists of working, non-rate-limited free models</p>
    </div>

    <div class="filters">
      <input
        v-model.trim="searchTerm"
        type="text"
        placeholder="Search models…"
        class="search-input"
      />
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
      <select v-model="sortBy">
        <option value="rank">Sort: Rank</option>
        <option value="role">Sort: Role</option>
        <option value="name">Sort: Name</option>
        <option value="provider">Sort: Provider</option>
        <option value="context">Sort: Context</option>
      </select>
      <button class="sort-dir-btn" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Descending' : 'Ascending'">
        {{ sortDesc ? '↓' : '↑' }}
      </button>
    </div>

    <div class="table-wrap">
      <table v-if="sortedItems.length > 0">
        <thead>
          <tr>
            <th :class="{ active: sortBy === 'rank' }" @click="setSort('rank')">
              Rank
            </th>
            <th :class="{ active: sortBy === 'role' }" @click="setSort('role')">
              Role
            </th>
            <th :class="{ active: sortBy === 'name' }" @click="setSort('name')">
              Model
            </th>
            <th :class="{ active: sortBy === 'provider' }" @click="setSort('provider')">
              Provider
            </th>
            <th>Status</th>
            <th :class="{ active: sortBy === 'context' }" @click="setSort('context')">
              Context
            </th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in pagedItems" :key="item.modelId + '|' + item.role">
            <td>
              <span class="rank-num">#{{ item.rank }}</span>
            </td>
            <td>
              <span class="role-badge" :data-role="item.role">{{ formatRole(item.role) }}</span>
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
        </div>
      </div>
    </div>

    <div class="pagination" v-if="sortedItems.length > 0 && totalPages > 1">
      <button :disabled="page === 1" @click="page = 1">«</button>
      <button :disabled="page === 1" @click="page--">‹</button>
      <span class="page-info">{{ page }} / {{ totalPages }} ({{ sortedItems.length }} rows)</span>
      <button :disabled="page === totalPages" @click="page++">›</button>
      <button :disabled="page === totalPages" @click="page = totalPages">»</button>
      <select v-model.number="perPage" class="per-page-select">
        <option :value="10">10</option>
        <option :value="25">25</option>
        <option :value="50">50</option>
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
  copyTimer = setTimeout(() => {
    copiedIds.delete(id)
  }, 1500)
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

// ── Flat list preserving role + per-role rank ──
const flatRankings = computed(() => {
  const list: { modelId: string; role: string; rank: number }[] = []
  for (const role of ROLES) {
    const arr = store.roleRankings[role] ?? []
    for (let i = 0; i < arr.length; i++) {
      list.push({ modelId: arr[i], role, rank: i + 1 })
    }
  }
  return list
})

// ── Filters ──
const searchTerm = ref('')
const statusFilter = ref<'all' | 'working' | 'untested'>('all')

const statusOptions = [
  { label: 'All', value: 'all' as const },
  { label: 'Working', value: 'working' as const },
  { label: 'Untested', value: 'untested' as const },
]

const filtered = computed(() => {
  const term = searchTerm.value.toLowerCase()
  return flatRankings.value.filter(item => {
    const model = store.getModelById(item.modelId)
    // Status filter
    const result = model?.status?.result
    if (statusFilter.value === 'working' && result !== 'working') return false
    if (statusFilter.value === 'untested' && result !== 'untested') return false
    // Search
    if (!term) return true
    const name = model?.name?.toLowerCase() ?? ''
    return name.includes(term) || item.modelId.toLowerCase().includes(term)
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
  const arr = filtered.value.map(item => ({
    ...item,
    model: store.getModelById(item.modelId),
  }))
  arr.sort((a, b) => {
    let cmp = 0
    switch (sortBy.value) {
      case 'rank':
        cmp = (STATUS_ORDER[a.model?.status?.result ?? ''] ?? 5) - (STATUS_ORDER[b.model?.status?.result ?? ''] ?? 5)
        if (cmp === 0) cmp = RANK_SCORE(a) - RANK_SCORE(b)
        break
      case 'role':
        cmp = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
        if (cmp === 0) cmp = a.rank - b.rank
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

function RANK_SCORE(item: { modelId: string; role: string; rank: number }) {
  return item.rank * 100 + (ROLE_ORDER[item.role] ?? 99)
}

// ── Pagination ──
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
:deep(.model-name) {
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.model-id) {
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.model-id:hover) {
  word-break: break-all;
  white-space: normal;
}

.rank-num {
  font-weight: 700;
  color: var(--text);
  font-size: 0.9rem;
}

.role-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.role-badge[data-role="model"]          { background: rgba(88,166,255,0.15); color: var(--accent); }
.role-badge[data-role="build"]          { background: rgba(63,185,80,0.15);  color: var(--green); }
.role-badge[data-role="general"]        { background: rgba(188,140,255,0.15); color: var(--purple); }
.role-badge[data-role="small_model"]    { background: rgba(210,153,34,0.15); color: var(--orange); }
.role-badge[data-role="explore"]        { background: rgba(57,210,192,0.15);  color: var(--cyan); }
.role-badge[data-role="stable"]         { background: rgba(230,237,243,0.1);  color: var(--text-dim); }

.status-filter {
  display: flex;
  gap: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px;
}

.status-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  padding: 4px 12px;
  border-radius: 3px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.status-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.status-btn.active {
  background: var(--bg-card);
  color: var(--accent);
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}

.sort-dir-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.sort-dir-btn:hover {
  color: var(--text);
  border-color: var(--accent);
}

.empty-state {
  border-top: 1px solid var(--border);
}
</style>
