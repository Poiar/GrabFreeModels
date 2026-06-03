<template>
  <div>
    <div class="page-header">
      <h2>Families</h2>
      <p>Browse model families — each family contains one or more super models</p>
    </div>

    <div class="super-list-controls">
      <div class="super-list-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="searchQuery" type="text" placeholder="Search by family or model name…" spellcheck="false" />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">✕</button>
      </div>
      <div class="super-list-filters">
        <div class="filter-pills">
          <button v-for="f in statusPills" :key="f.key" :class="['filter-pill', { active: statusFilter === f.key }]" @click="statusFilter = f.key">
            {{ f.label }}
            <span class="pill-count">{{ f.count }}</span>
          </button>
        </div>
        <div class="sort-controls">
          <select v-model="sortBy" class="sort-select">
            <option value="name">Sort: Name</option>
            <option value="models">Sort: Models</option>
            <option value="providers">Sort: Providers</option>
            <option value="instances">Sort: Instances</option>
            <option value="working">Sort: Working</option>
          </select>
          <button class="sort-dir-btn" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Descending' : 'Ascending'">
            <svg v-if="sortDesc" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
          </button>
        </div>
      </div>
      <div class="super-list-count">
        {{ sortedItems.length }} of {{ filteredItems.length }} families
      </div>
    </div>

    <div class="super-status-bar">
      <div class="status-segment working" :style="{ flex: workingCount }" :title="workingCount + ' all working'"></div>
      <div class="status-segment partial" :style="{ flex: partialCount }" :title="partialCount + ' partially working'"></div>
      <div class="status-segment untested" :style="{ flex: untestedCount }" :title="untestedCount + ' untested'"></div>
      <div class="status-segment broken" :style="{ flex: brokenCount }" :title="brokenCount + ' not working'"></div>
    </div>

    <div class="table-wrap vscroll-table super-list-table">
      <div class="vscroll-header-row">
        <div class="vscroll-header-cell col-family-name sortable" :class="{ sortActive: sortBy === 'name' }" @click="setSort('name')">
          Family <SortArrow :active="sortBy === 'name'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-models sortable" :class="{ sortActive: sortBy === 'models' }" @click="setSort('models')">
          Models <SortArrow :active="sortBy === 'models'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-providers sortable" :class="{ sortActive: sortBy === 'providers' }" @click="setSort('providers')">
          Providers <SortArrow :active="sortBy === 'providers'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-instances sortable" :class="{ sortActive: sortBy === 'instances' }" @click="setSort('instances')">
          Instances <SortArrow :active="sortBy === 'instances'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-working sortable" :class="{ sortActive: sortBy === 'working' }" @click="setSort('working')">
          Working <SortArrow :active="sortBy === 'working'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-members">Members</div>
      </div>
      <DynamicScroller
        v-if="sortedItems.length > 0"
        ref="scrollerRef"
        :key="'scroller-' + isMobile"
        :items="sortedItems"
        :min-item-size="56"
        key-field="family"
        class="vscroll-body"
      >
        <template #default="{ item, active }">
          <DynamicScrollerItem :item="item" :active="active">
            <div class="vscroll-row row-clickable" @click="selectedFamily = item.family || null" role="button" :title="item.family ? item.family : 'Models without a family'">
              <div class="vscroll-cell col-family-name">
                <span class="family-name" :class="{ 'no-family': !item.family }" :title="item.family ? item.family : 'Models without a family'">
                  {{ item.family || 'Unknown' }}
                </span>
              </div>
              <div class="vscroll-cell col-models" data-label="Models" aria-label="Models">
                <span class="instance-badge">{{ item.modelCount }}</span>
              </div>
              <div class="vscroll-cell col-providers" data-label="Providers" aria-label="Providers">
                <div class="provider-tags">
                  <span v-for="p in item.providers.slice(0, 5)" :key="p" class="provider-tag">{{ p }}</span>
                  <span v-if="item.providers.length > 5" class="provider-tag more">+{{ item.providers.length - 5 }}</span>
                </div>
              </div>
              <div class="vscroll-cell col-instances" data-label="Instances" aria-label="Instances">
                <span class="instance-badge">{{ item.instanceCount }}</span>
              </div>
              <div class="vscroll-cell col-working" data-label="Status" aria-label="Status">
                <span v-if="item.workingCount > 0" class="badge badge-working">{{ item.workingCount }} working</span>
                <span v-else-if="item.untestedCount > 0" class="badge badge-untested">{{ item.untestedCount }} untested</span>
                <span v-else-if="item.rateLimitedCount > 0" class="badge badge-rate_limited">{{ item.rateLimitedCount }} rate limited</span>
                <span v-else class="badge badge-broken">—</span>
              </div>
              <div class="vscroll-cell col-members" data-label="Members" aria-label="Members">
                <div class="member-names">
                  <span v-for="name in item.memberNames.slice(0, 4)" :key="name" class="member-chip">{{ name }}</span>
                  <span v-if="item.memberNames.length > 4" class="member-chip more">+{{ item.memberNames.length - 4 }}</span>
                </div>
              </div>
            </div>
          </DynamicScrollerItem>
        </template>
      </DynamicScroller>
      <div v-else class="empty-state">
        <div class="empty-state-inner">
          <svg class="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <h3>No families found</h3>
          <p>No families match your current search or filters.</p>
          <button class="clear-btn" @click="searchQuery = ''; statusFilter = 'all'">Clear all filters</button>
        </div>
      </div>
    </div>

    <!-- Family detail panel -->
    <div v-if="selectedFamily" class="family-detail-overlay" @click.self="selectedFamily = null">
      <div class="family-detail-panel">
        <div class="detail-header">
          <h3>{{ selectedFamily || 'Unknown Family' }}</h3>
          <button class="detail-close" @click="selectedFamily = null">✕</button>
        </div>
        <div class="detail-body">
          <div class="supers-table">
            <div class="vscroll-header-row">
              <div class="vscroll-header-cell col-name">Model</div>
              <div class="vscroll-header-cell col-status">Status</div>
              <div class="vscroll-header-cell col-providers">Providers</div>
              <div class="vscroll-header-cell col-context">Context</div>
              <div class="vscroll-header-cell col-tools">Tools</div>
            </div>
            <div v-for="m in familyMasters" :key="m.id" class="vscroll-row row-clickable" @click="$router.push(`/super/${m.id}`)">
              <div class="vscroll-cell col-name" data-label="Model" aria-label="Model">
                <span class="model-name" :title="m.name">{{ m.name }}</span>
              </div>
              <div class="vscroll-cell col-status" data-label="Status" aria-label="Status">
                <span v-if="m.workingCount > 0" class="badge badge-working">Working ({{ m.workingCount }})</span>
                <span v-else-if="m.untestedCount > 0" class="badge badge-untested">Untested</span>
                <span v-else class="badge badge-broken">—</span>
              </div>
              <div class="vscroll-cell col-providers" data-label="Providers" aria-label="Providers">
                <div class="provider-tags">
                  <span v-for="p in m.providers.slice(0, 4)" :key="p" class="provider-tag">{{ p }}</span>
                  <span v-if="m.providers.length > 4" class="provider-tag more">+{{ m.providers.length - 4 }}</span>
                </div>
              </div>
              <div class="vscroll-cell col-context" data-label="Context" aria-label="Context">
                <span class="context-len">{{ m.best_context_length ? formatContext(m.best_context_length) : '—' }}</span>
              </div>
              <div class="vscroll-cell col-tools" data-label="Tools" aria-label="Tools">
                <span v-if="m.any_tools" class="check-yes">✓</span>
                <span v-else class="check-no">—</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useModelsStore } from '@/store/models'
import { useBreakpoint } from '@/composables/useBreakpoint'

const SortArrow = defineComponent({
  props: { active: Boolean, desc: Boolean },
  setup(props) {
    return () => h('span', { class: ['sort-arrow', { active: props.active }] },
      props.active ? (props.desc ? ' ↓' : ' ↑') : ' ⇅'
    )
  }
})

const store = useModelsStore()
const { isMobile } = useBreakpoint()
const scrollerRef = ref()
const selectedFamily = ref<string | null>(null)

interface FamilyItem {
  family: string
  modelCount: number
  instanceCount: number
  providers: string[]
  memberNames: string[]
  workingCount: number
  untestedCount: number
  rateLimitedCount: number
  brokenCount: number
}

const familyItems = computed<FamilyItem[]>(() => {
  const map = new Map<string, { supers: any[], allProviders: Set<string>, working: number, untested: number, rateLimited: number, broken: number }>()

  for (const m of store.superModels) {
    const families = new Set(m.datapoints.map(d => d.family).filter((f): f is string => !!f))
    if (families.size === 0)     families.add('')
    for (const fam of families) {
      if (!map.has(fam)) map.set(fam, { supers: [], allProviders: new Set(), working: 0, untested: 0, rateLimited: 0, broken: 0 })
      const entry = map.get(fam)!
      entry.supers.push(m)
      for (const p of m.providers) entry.allProviders.add(p)
      for (const d of m.datapoints) {
        if (d.family !== fam && d.family != null) continue
        if (d.status.result === 'working') entry.working++
        else if (d.status.result === 'untested') entry.untested++
        else if (d.status.result === 'rate_limited') entry.rateLimited++
        else if (d.status.result === 'broken') entry.broken++
      }
    }
  }

  const items: FamilyItem[] = []
  for (const [family, entry] of map) {
    items.push({
      family,
      modelCount: entry.supers.length,
      instanceCount: entry.supers.reduce((s: number, m: any) => s + m.datapoints.filter((d: any) => (d.family === family || d.family == null && family === '')).length, 0),
      providers: [...entry.allProviders].sort(),
      memberNames: entry.supers.map(m => m.name).sort(),
      workingCount: entry.working,
      untestedCount: entry.untested,
      rateLimitedCount: entry.rateLimited,
      brokenCount: entry.broken,
    })
  }
  return items
})

const searchQuery = ref('')
const statusFilter = ref('all')
const sortBy = ref('name')
const sortDesc = ref(false)

const searchedItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return familyItems.value
  return familyItems.value.filter(f =>
    f.family.toLowerCase().includes(q) ||
    f.memberNames.some(n => n.toLowerCase().includes(q))
  )
})

const filteredItems = computed(() => {
  const items = searchedItems.value
  if (statusFilter.value === 'all') return items
  if (statusFilter.value === 'working') return items.filter(i => i.workingCount > 0 && i.brokenCount === 0 && i.rateLimitedCount === 0)
  if (statusFilter.value === 'partial') return items.filter(i => i.workingCount > 0 && (i.brokenCount > 0 || i.rateLimitedCount > 0))
  if (statusFilter.value === 'untested') return items.filter(i => i.untestedCount > 0 && i.workingCount === 0)
  if (statusFilter.value === 'not_working') return items.filter(i => i.workingCount === 0 && i.untestedCount === 0)
  return items
})

const statusPills = computed(() => {
  const items = familyItems.value
  return [
    { key: 'all', label: 'All', count: items.length },
    { key: 'working', label: 'Working', count: items.filter(i => i.workingCount > 0 && i.brokenCount === 0 && i.rateLimitedCount === 0).length },
    { key: 'partial', label: 'Mixed', count: items.filter(i => i.workingCount > 0 && (i.brokenCount > 0 || i.rateLimitedCount > 0)).length },
    { key: 'untested', label: 'Untested', count: items.filter(i => i.untestedCount > 0 && i.workingCount === 0).length },
    { key: 'not_working', label: 'Down', count: items.filter(i => i.workingCount === 0 && i.untestedCount === 0).length },
  ]
})

const sortedItems = computed(() => {
  const arr = [...filteredItems.value]
  arr.sort((a: FamilyItem, b: FamilyItem) => {
    let cmp = 0
    switch (sortBy.value) {
      case 'name': cmp = a.family.localeCompare(b.family); break
      case 'models': cmp = b.modelCount - a.modelCount; break
      case 'providers': cmp = b.providers.length - a.providers.length; break
      case 'instances': cmp = b.instanceCount - a.instanceCount; break
      case 'working': cmp = b.workingCount - a.workingCount; break
    }
    return sortDesc.value ? -cmp : cmp
  })
  return arr
})

const workingCount = computed(() => familyItems.value.filter(i => i.workingCount > 0 && i.brokenCount === 0 && i.rateLimitedCount === 0).length)
const partialCount = computed(() => familyItems.value.filter(i => i.workingCount > 0 && (i.brokenCount > 0 || i.rateLimitedCount > 0)).length)
const untestedCount = computed(() => familyItems.value.filter(i => i.untestedCount > 0 && i.workingCount === 0).length)
const brokenCount = computed(() => familyItems.value.filter(i => i.workingCount === 0 && i.untestedCount === 0).length)

function setSort(field: string) {
  if (sortBy.value === field) sortDesc.value = !sortDesc.value
  else { sortBy.value = field; sortDesc.value = false }
}

watch([searchQuery, statusFilter, sortBy, sortDesc], () => scrollerRef.value?.scrollToPosition(0))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedFamily.value) selectedFamily.value = null
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function formatContext(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(n)
}

const familyMasters = computed(() => {
  if (!selectedFamily.value) return []
  const fam = selectedFamily.value
  const supers = store.superModels.filter(m => {
    const families = new Set(m.datapoints.map(d => d.family).filter((f): f is string => !!f))
    if (fam === '') return families.size === 0
    return families.has(fam)
  })
  return supers.map(m => ({
    id: m.id,
    name: m.name,
    providers: m.providers,
    best_context_length: m.best_context_length,
    any_tools: m.any_tools,
    workingCount: m.datapoints.filter(d => d.status.result === 'working').length,
    untestedCount: m.datapoints.filter(d => d.status.result === 'untested').length,
  })).sort((a, b) => a.name.localeCompare(b.name))
})
</script>

<style scoped>
.super-list-controls { margin-bottom: 16px; }
.super-list-search {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  background: var(--bg-elevated, var(--surface)); border: 1px solid var(--border);
  border-radius: var(--radius-sm); margin-bottom: 10px;
}
.super-list-search svg { color: var(--text-muted); flex-shrink: 0; }
.super-list-search input { flex: 1; background: none; border: none; color: var(--text); font-size: 0.82rem; outline: none; padding: 0; }
.super-list-search input::placeholder { color: var(--text-muted); }
.search-clear { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 2px; font-size: 0.75rem; }
.search-clear:hover { color: var(--text); }

.super-list-filters { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
.filter-pills { display: flex; gap: 4px; flex-wrap: wrap; }
.filter-pill {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: var(--radius-full, 999px);
  border: 1px solid var(--border); background: none;
  color: var(--text-dim); font-size: 0.72rem; font-weight: 500;
  cursor: pointer; transition: all 0.12s;
}
.filter-pill:hover { color: var(--text); border-color: var(--text-muted); }
.filter-pill.active { color: var(--accent); border-color: var(--accent); background: var(--accent-subtle); }
.pill-count { font-size: 0.6rem; opacity: 0.7; font-weight: 600; }

.sort-controls { display: flex; align-items: center; gap: 6px; }
.sort-select {
  background: var(--bg-elevated, var(--surface)); border: 1px solid var(--border);
  color: var(--text); font-size: 0.72rem; padding: 5px 8px;
  border-radius: var(--radius-sm); cursor: pointer; outline: none;
}
.sort-dir-btn {
  background: var(--bg-elevated, var(--surface)); border: 1px solid var(--border);
  color: var(--text); padding: 5px 7px; border-radius: var(--radius-sm);
  cursor: pointer; display: flex; align-items: center;
}

.super-list-count { font-size: 0.68rem; color: var(--text-muted); }

.super-status-bar {
  display: flex; height: 4px; border-radius: 2px; overflow: hidden; margin-bottom: 14px; gap: 1px;
}
.status-segment { min-width: 2px; transition: flex 0.3s; }
.status-segment.working { background: var(--green); }
.status-segment.partial { background: var(--orange); }
.status-segment.untested { background: var(--accent); }
.status-segment.broken { background: var(--red, #f85149); }

.super-list-table { height: calc(100vh - 340px); }

.col-family-name { width: 14%; min-width: 100px; }
.col-models      { width: 8%;  min-width: 60px; }
.col-providers   { width: 20%; min-width: 140px; }
.col-instances   { width: 9%;  min-width: 65px; }
.col-working     { width: 12%; min-width: 90px; }
.col-members     { width: 37%; min-width: 200px; }

.sortActive { color: var(--accent); }

.family-name {
  font-weight: 600; color: var(--accent);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 100%;
}
.family-name.no-family {
  color: var(--text-muted); font-weight: 400; font-style: italic;
}

.instance-badge {
  display: inline-block; padding: 3px 8px; border-radius: var(--radius-full, 999px);
  font-size: 0.72rem; font-weight: 700;
  background: var(--accent-subtle); color: var(--accent); line-height: 1;
}

.provider-tags { display: flex; flex-wrap: wrap; gap: 3px; }
.provider-tag {
  display: inline-block; padding: 1px 5px; border-radius: var(--radius-sm, 4px);
  font-size: 0.6rem; font-weight: 500;
  background: var(--accent-subtle); color: var(--accent); white-space: nowrap;
}
.provider-tag.more { background: var(--bg-hover); color: var(--text-muted); }

.member-names { display: flex; flex-wrap: wrap; gap: 3px; }
.member-chip {
  display: inline-block; padding: 2px 7px; border-radius: var(--radius-full, 999px);
  font-size: 0.62rem; font-weight: 500;
  background: rgba(88,166,255,0.08); color: var(--text-dim); white-space: nowrap;
}
.member-chip.more { background: var(--bg-hover); color: var(--text-muted); }

.family-detail-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  z-index: 100; display: flex; align-items: flex-start; justify-content: center; padding-top: 60px;
}
.family-detail-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  width: min(800px, 92vw);
  max-height: 75vh;
  overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4);
}
.detail-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
}
.detail-header h3 { font-size: 0.95rem; font-weight: 700; }
.detail-close {
  background: none; border: none; color: var(--text-muted); cursor: pointer;
  font-size: 1rem; padding: 2px 6px;
}
.detail-close:hover { color: var(--text); }
.detail-body { overflow-y: auto; padding: 0 0 12px; }
.supers-table { padding: 0 12px; }
.supers-table .vscroll-header-row { padding: 10px 10px 8px; }
.supers-table .vscroll-row { padding: 10px; }
.supers-table .col-name      { width: 28%; }
.supers-table .col-status    { width: 18%; }
.supers-table .col-providers { width: 26%; }
.supers-table .col-context   { width: 14%; }
.supers-table .col-tools     { width: 7%; }

.model-name {
  font-weight: 600; color: var(--accent);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 220px;
}
.context-len {
  font-size: 0.72rem; font-weight: 600;
  background: rgba(63,185,80,0.10); color: var(--green);
  padding: 1px 7px; border-radius: var(--radius-full, 999px);
}
.check-yes { color: var(--green); font-weight: 700; }
.check-no { color: var(--text-muted); }
.empty-state { padding: 48px 0; text-align: center; }
.empty-state p { color: var(--text-muted); font-size: 0.85rem; }
</style>
