<template>
  <div>
    <div class="page-header">
      <h2>SuperModels</h2>
      <p>Browse all super models — click any model to see its full details across all providers</p>
    </div>

    <!-- Search + Filters -->
    <div class="super-list-controls">
      <div class="super-list-search">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name, provider, or tag…"
          spellcheck="false"
        />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">✕</button>
      </div>
      <div class="super-list-filters">
        <div class="filter-pills">
          <button
            v-for="f in statusPills"
            :key="f.key"
            :class="['filter-pill', { active: statusFilter === f.key }]"
            @click="statusFilter = f.key"
          >
            {{ f.label }}
            <span class="pill-count">{{ f.count }}</span>
          </button>
        </div>
        <div class="sort-controls">
          <select v-model="sortBy" class="sort-select">
            <option value="name">Sort: Name</option>
            <option value="providers">Sort: Providers</option>
            <option value="instances">Sort: Instances</option>
            <option value="context">Sort: Context</option>
            <option value="status">Sort: Status</option>
            <option value="tools">Sort: Tools</option>
            <option value="free">Sort: Free</option>
          </select>
          <button class="sort-dir-btn" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Descending' : 'Ascending'">
            <svg aria-hidden="true" v-if="sortDesc" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            <svg aria-hidden="true" v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
          </button>
        </div>
      </div>
      <div class="super-list-count">
        {{ filteredItems.length }} of {{ superItems.length }} super models
      </div>
    </div>

    <!-- Status summary bar -->
    <div class="super-status-bar">
      <div class="status-segment working" :style="{ flex: workingSupers }" :title="workingSupers + ' fully working'"></div>
      <div class="status-segment partial" :style="{ flex: partialSupers }" :title="partialSupers + ' partially working'"></div>
      <div class="status-segment untested" :style="{ flex: untestedSupers }" :title="untestedSupers + ' untested'"></div>
      <div class="status-segment broken" :style="{ flex: brokenSupers }" :title="brokenSupers + ' not working'"></div>
    </div>

    <!-- Table -->
    <div class="table-wrap vscroll-table super-list-table">
      <div class="vscroll-header-row">
        <div class="vscroll-header-cell col-name sortable" :class="{ sortActive: sortBy === 'name' }" @click="setSort('name')">
          Model <SortArrow :active="sortBy === 'name'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-status sortable" :class="{ sortActive: sortBy === 'status' }" @click="setSort('status')">
          Status <SortArrow :active="sortBy === 'status'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-providers sortable" :class="{ sortActive: sortBy === 'providers' }" @click="setSort('providers')">
          Providers <SortArrow :active="sortBy === 'providers'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-instances sortable" :class="{ sortActive: sortBy === 'instances' }" @click="setSort('instances')">
          Instances <SortArrow :active="sortBy === 'instances'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-context sortable" :class="{ sortActive: sortBy === 'context' }" @click="setSort('context')">
          Best Context <SortArrow :active="sortBy === 'context'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-tools sortable" :class="{ sortActive: sortBy === 'tools' }" @click="setSort('tools')">
          Tools <SortArrow :active="sortBy === 'tools'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-free sortable" :class="{ sortActive: sortBy === 'free' }" @click="setSort('free')">
          Free <SortArrow :active="sortBy === 'free'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-roles">Top Roles</div>
      </div>
      <DynamicScroller
        v-if="sortedItems.length > 0"
        ref="scrollerRef"
        :items="sortedItems"
        :min-item-size="56"
        key-field="id"
        class="vscroll-body"
      >
        <template #default="{ item, active }">
          <DynamicScrollerItem :item="item" :active="active">
          <div class="vscroll-row row-clickable" :class="{ 'row-has-removed': item.hasRemoved }" @click="$router.push(`/super/${item.id}`)" role="button" tabindex="0" :title="'View ' + item.name">
            <div class="vscroll-cell col-name">
              <span class="super-name" :title="item.name">{{ item.name }}</span>
              <span v-if="item.family" class="super-family">{{ item.family }}</span>
            </div>
            <div class="vscroll-cell col-status">
              <span v-if="item.workingCount > 0" class="badge badge-working">Working ({{ item.workingCount }})</span>
              <span v-else-if="item.untestedCount > 0" class="badge badge-untested">{{ item.untestedCount }} untested</span>
              <span v-else-if="item.rateLimitedCount > 0" class="badge badge-rate_limited">{{ item.rateLimitedCount }} rate limited</span>
              <span v-else-if="item.brokenCount > 0" class="badge badge-broken">{{ item.brokenCount }} broken</span>
              <span v-else class="badge badge-not_found">—</span>
            </div>
            <div class="vscroll-cell col-providers">
              <div class="provider-tags">
                <span v-for="p in item.providers.slice(0, 4)" :key="p" class="provider-tag">{{ p }}</span>
                <span v-if="item.providers.length > 4" class="provider-tag more">+{{ item.providers.length - 4 }}</span>
              </div>
            </div>
            <div class="vscroll-cell col-instances">
              <span class="instance-badge">{{ item.datapointsCount }}</span>
              <span class="instance-label">instance{{ item.datapointsCount !== 1 ? 's' : '' }}</span>
            </div>
            <div class="vscroll-cell col-context">
              <span class="context-len">{{ item.best_context_length ? formatContext(item.best_context_length) : '—' }}</span>
            </div>
            <div class="vscroll-cell col-tools">
              <span v-if="item.any_tools" class="check-yes">✓</span>
              <span v-else class="check-no">—</span>
            </div>
            <div class="vscroll-cell col-free">
              <span v-if="item.all_free" class="check-yes">All</span>
              <span v-else-if="item.hasPaid" class="check-mixed">Some</span>
              <span v-else class="check-no">—</span>
            </div>
            <div class="vscroll-cell col-roles">
              <div class="role-badges-inline">
                <span
                  v-for="r in item.topRoles"
                  :key="r.role"
                  class="role-badge"
                  :class="{ 'role-top': r.rank <= 3 }"
                  :title="r.role + ' rank #' + r.rank"
                >#{{ r.rank }} {{ r.label }}</span>
              </div>
            </div>
          </div>
          </DynamicScrollerItem>
        </template>
      </DynamicScroller>

      <div v-else class="empty-state">
        <div class="empty-state-inner">
          <svg class="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <h3>No super models found</h3>
          <p>No super models match your current search or filters.</p>
          <button class="clear-btn" @click="searchQuery = ''; statusFilter = 'all'">Clear all filters</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import { useModelsStore } from '@/store/models'

const ROLES = ['model', 'build', 'general', 'small_model', 'explore'] as const
const ROLE_SHORT: Record<string, string> = { model: 'Mod', build: 'Bld', general: 'Gen', small_model: 'Sml', explore: 'Exp' }

const SortArrow = defineComponent({
  props: { active: Boolean, desc: Boolean },
  setup(props) {
    return () => h('span', { class: ['sort-arrow', { active: props.active }] },
      props.active ? (props.desc ? ' ↓' : ' ↑') : ' ⇅'
    )
  }
})

const store = useModelsStore()
const scrollerRef = ref()

interface SuperItem {
  id: number
  name: string
  family: string | null
  providers: string[]
  datapointsCount: number
  allTags: string[]
  workingCount: number
  untestedCount: number
  rateLimitedCount: number
  brokenCount: number
  notFoundCount: number
  best_context_length: number | null
  any_tools: boolean
  all_free: boolean
  hasPaid: boolean
  hasRemoved: boolean
  topRoles: { role: string; label: string; rank: number }[]
}

const superItems = computed<SuperItem[]>(() => {
  return store.superModels.map(m => {
    const working = m.datapoints.filter(d => d.status.result === 'working')
    const broken = m.datapoints.filter(d => d.status.result === 'broken')
    const rateLimited = m.datapoints.filter(d => d.status.result === 'rate_limited')
    const untested = m.datapoints.filter(d => d.status.result === 'untested')
    const notFound = m.datapoints.filter(d => d.status.result === 'not_found')
    const families = new Set(m.datapoints.map(d => d.family).filter((f): f is string => !!f))
    const allTags = [...new Set(m.datapoints.flatMap(d => [...d.tags, ...d.best_for]))]

    const topRanked: { role: string; label: string; rank: number }[] = []
    for (const role of ROLES) {
      const arr = store.roleRankings[role] ?? []
      let bestRank = Infinity
      for (const dp of m.datapoints) {
        const idx = arr.indexOf(dp.id)
        if (idx !== -1 && idx + 1 < bestRank) bestRank = idx + 1
      }
      if (bestRank < Infinity) topRanked.push({ role, label: ROLE_SHORT[role] ?? role, rank: bestRank })
    }
    topRanked.sort((a, b) => a.rank - b.rank)

    return {
      id: m.id, name: m.name,
      family: families.size === 1 ? [...families][0] : null,
      providers: m.providers,
      datapointsCount: m.datapoints.length,
      allTags,
      workingCount: working.length,
      untestedCount: untested.length,
      rateLimitedCount: rateLimited.length,
      brokenCount: broken.length,
      notFoundCount: notFound.length,
      best_context_length: m.best_context_length,
      any_tools: m.any_tools,
      all_free: m.all_free,
      hasPaid: m.datapoints.some(d => !d.is_free),
      hasRemoved: m.datapoints.some(d => d._removed),
      topRoles: topRanked.slice(0, 3),
    }
  })
})

const searchQuery = ref('')
const statusFilter = ref('all')
const sortBy = ref('name')
const sortDesc = ref(false)

const searchedItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return superItems.value
  return superItems.value.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.providers.some(p => p.toLowerCase().includes(q)) ||
    m.allTags.some(t => t.toLowerCase().includes(q))
  )
})

const filteredItems = computed(() => {
  const items = searchedItems.value
  if (statusFilter.value === 'all') return items
  if (statusFilter.value === 'working') return items.filter(i => i.workingCount > 0)
  if (statusFilter.value === 'untested') return items.filter(i => i.untestedCount > 0 && i.workingCount === 0)
  if (statusFilter.value === 'partial') return items.filter(i => i.workingCount > 0 && (i.rateLimitedCount > 0 || i.brokenCount > 0))
  if (statusFilter.value === 'not_working') return items.filter(i => i.workingCount === 0)
  return items
})

const statusPills = computed(() => {
  const items = superItems.value
  return [
    { key: 'all', label: 'All', count: items.length },
    { key: 'working', label: 'Working', count: items.filter(i => i.workingCount > 0).length },
    { key: 'untested', label: 'Untested', count: items.filter(i => i.untestedCount > 0 && i.workingCount === 0).length },
    { key: 'partial', label: 'Mixed', count: items.filter(i => i.workingCount > 0 && (i.rateLimitedCount > 0 || i.brokenCount > 0)).length },
    { key: 'not_working', label: 'Down', count: items.filter(i => i.workingCount === 0).length },
  ]
})

const statusCounts = computed(() => ({
  working: superItems.value.filter(i => i.workingCount > 0).length,
  partial: superItems.value.filter(i => i.workingCount > 0 && (i.rateLimitedCount > 0 || i.brokenCount > 0)).length,
  untested: superItems.value.filter(i => i.untestedCount > 0 && i.workingCount === 0).length,
  broken: superItems.value.filter(i => i.workingCount === 0 && i.untestedCount === 0).length,
}))
const workingSupers = computed(() => statusCounts.value.working)
const partialSupers = computed(() => statusCounts.value.partial)
const untestedSupers = computed(() => statusCounts.value.untested)
const brokenSupers = computed(() => statusCounts.value.broken)

const sortedItems = computed(() => {
  const arr = [...filteredItems.value]
  arr.sort((a, b) => {
    let cmp = 0
    switch (sortBy.value) {
      case 'name': cmp = a.name.localeCompare(b.name); break
      case 'providers': cmp = b.providers.length - a.providers.length; break
      case 'instances': cmp = b.datapointsCount - a.datapointsCount; break
      case 'context': cmp = (b.best_context_length ?? 0) - (a.best_context_length ?? 0); break
      case 'status': {
        const score = (i: SuperItem) => i.workingCount > 0 ? 3 : i.untestedCount > 0 ? 2 : i.rateLimitedCount > 0 ? 1 : 0
        cmp = score(b) - score(a); break
      }
      case 'tools': cmp = (b.any_tools ? 0 : 1) - (a.any_tools ? 0 : 1); break
      case 'free': cmp = (b.all_free ? 0 : b.hasPaid ? 1 : 2) - (a.all_free ? 0 : a.hasPaid ? 1 : 2); break
    }
    return sortDesc.value ? -cmp : cmp
  })
  return arr
})

function setSort(field: string) {
  if (sortBy.value === field) sortDesc.value = !sortDesc.value
  else { sortBy.value = field; sortDesc.value = false }
}

watch([searchQuery, statusFilter, sortBy, sortDesc], () => {
  scrollerRef.value?.scrollToPosition(0)
})

function formatContext(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(n)
}
</script>

<style scoped>
.super-list-controls {
  margin-bottom: 16px;
}
.super-list-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-elevated, var(--surface));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 10px;
}
.super-list-search svg {
  color: var(--text-muted);
  flex-shrink: 0;
}
.super-list-search input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text);
  font-size: 0.82rem;
  outline: none;
  padding: 0;
}
.super-list-search input::placeholder {
  color: var(--text-muted);
}
.search-clear {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  font-size: 0.75rem;
}
.search-clear:hover {
  color: var(--text);
}

.super-list-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.filter-pills {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.filter-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-full, 999px);
  border: 1px solid var(--border);
  background: none;
  color: var(--text-dim);
  font-size: 0.72rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
}
.filter-pill:hover {
  color: var(--text);
  border-color: var(--text-muted);
}
.filter-pill.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-subtle);
}
.pill-count {
  font-size: 0.6rem;
  opacity: 0.7;
  font-weight: 600;
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sort-select {
  background: var(--bg-elevated, var(--surface));
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 0.72rem;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  outline: none;
}
.sort-dir-btn {
  background: var(--bg-elevated, var(--surface));
  border: 1px solid var(--border);
  color: var(--text);
  padding: 5px 7px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
}

.super-list-count {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.super-status-bar {
  display: flex;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 14px;
  gap: 1px;
}
.status-segment {
  min-width: 2px;
  transition: flex 0.3s;
}
.status-segment.working { background: var(--green); }
.status-segment.partial { background: var(--orange); }
.status-segment.untested { background: var(--accent); }
.status-segment.broken { background: var(--red); }

.super-list-table {
  height: calc(100vh - 340px);
}
.col-name      { width: 22%; min-width: 140px; }
.col-status    { width: 13%; min-width: 100px; }
.col-providers { width: 13%; min-width: 100px; }
.col-instances { width: 8%;  min-width: 65px; }
.col-context   { width: 10%; min-width: 75px; }
.col-tools     { width: 5%;  min-width: 45px; }
.col-free      { width: 6%;  min-width: 45px; }
.col-roles     { width: 23%; min-width: 140px; }

.row-has-removed {
  border-left: 3px solid var(--orange);
}

.super-name {
  font-weight: 600;
  color: var(--accent);
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.super-family {
  display: inline-block;
  font-size: 0.6rem;
  color: var(--text-muted);
  background: var(--accent-subtle);
  padding: 1px 6px;
  border-radius: var(--radius-full, 999px);
  margin-top: 2px;
}

.provider-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.provider-tag {
  display: inline-block;
  padding: 1px 5px;
  border-radius: var(--radius-sm, 4px);
  font-size: 0.6rem;
  font-weight: 500;
  background: var(--accent-subtle);
  color: var(--accent);
  white-space: nowrap;
}
.provider-tag.more {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.col-instances {
  text-align: center;
}
.instance-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: var(--radius-full, 999px);
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--accent-subtle);
  color: var(--accent);
  line-height: 1;
}
.instance-label {
  display: block;
  font-size: 0.55rem;
  color: var(--text-muted);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.check-yes {
  color: var(--green);
  font-weight: 700;
}
.check-no {
  color: var(--text-muted);
}
.check-mixed {
  color: var(--orange);
  font-weight: 700;
  font-size: 0.72rem;
}

.role-badges-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.role-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: var(--radius-full, 999px);
  background: var(--accent-subtle);
  font-size: 0.6rem;
  white-space: nowrap;
}
.role-badge.role-top {
  background: rgba(63,185,80,0.12);
  color: var(--green);
}

.sortActive {
  color: var(--accent);
}
</style>
