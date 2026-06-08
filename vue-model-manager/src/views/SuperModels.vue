<template>
  <div>
    <div class="page-header">
      <h2>Super Models</h2>
      <p>Each canonical model with its provider instances — click to see all instances</p>
    </div>

    <!-- Search + Filters -->
    <div class="sm-controls">
      <div class="sm-search">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name, provider, or tag…"
          spellcheck="false"
        />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">&times;</button>
      </div>
      <div class="sm-filters">
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
        <div class="sm-sort">
          <select v-model="sortBy" class="sort-select">
            <option value="name">Sort: Name</option>
            <option value="providers">Sort: Providers</option>
            <option value="instances">Sort: Instances</option>
            <option value="context">Sort: Context</option>
            <option value="status">Sort: Status</option>
            <option value="tools">Sort: Tools</option>
          </select>
          <button class="sort-dir-btn" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Descending' : 'Ascending'">
            {{ sortDesc ? '↓' : '↑' }}
          </button>
        </div>
      </div>
      <div class="sm-count">{{ filteredItems.length }} of {{ superItems.length }} super models</div>
    </div>

    <!-- Status summary bar -->
    <div class="sm-status-bar">
      <div class="status-segment working" :style="{ flex: workingSupers }" :title="workingSupers + ' fully working'"></div>
      <div class="status-segment partial" :style="{ flex: partialSupers }" :title="partialSupers + ' partially working'"></div>
      <div class="status-segment untested" :style="{ flex: untestedSupers }" :title="untestedSupers + ' untested'"></div>
      <div class="status-segment broken" :style="{ flex: brokenSupers }" :title="brokenSupers + ' not working'"></div>
    </div>

    <!-- Table -->
    <div class="sm-table">
      <div class="sm-header-row">
        <div class="sm-h-cell col-name sortable" :class="{ sortActive: sortBy === 'name' }" @click="setSort('name')">
          Model <span class="sort-arrow">{{ sortBy === 'name' ? (sortDesc ? ' ↓' : ' ↑') : ' ⇅' }}</span>
        </div>
        <div class="sm-h-cell col-status sortable" :class="{ sortActive: sortBy === 'status' }" @click="setSort('status')">
          Status <span class="sort-arrow">{{ sortBy === 'status' ? (sortDesc ? ' ↓' : ' ↑') : ' ⇅' }}</span>
        </div>
        <div class="sm-h-cell col-providers sortable" :class="{ sortActive: sortBy === 'providers' }" @click="setSort('providers')">
          Providers <span class="sort-arrow">{{ sortBy === 'providers' ? (sortDesc ? ' ↓' : ' ↑') : ' ⇅' }}</span>
        </div>
        <div class="sm-h-cell col-instances sortable" :class="{ sortActive: sortBy === 'instances' }" @click="setSort('instances')">
          Instances <span class="sort-arrow">{{ sortBy === 'instances' ? (sortDesc ? ' ↓' : ' ↑') : ' ⇅' }}</span>
        </div>
        <div class="sm-h-cell col-context sortable" :class="{ sortActive: sortBy === 'context' }" @click="setSort('context')">
          Best Context <span class="sort-arrow">{{ sortBy === 'context' ? (sortDesc ? ' ↓' : ' ↑') : ' ⇅' }}</span>
        </div>
        <div class="sm-h-cell col-tools sortable" :class="{ sortActive: sortBy === 'tools' }" @click="setSort('tools')">
          Tools <span class="sort-arrow">{{ sortBy === 'tools' ? (sortDesc ? ' ↓' : ' ↑') : ' ⇅' }}</span>
        </div>
        <div class="sm-h-cell col-roles">Top Roles</div>
      </div>
      <DynamicScroller
        v-if="sortedItems.length > 0"
        :items="sortedItems"
        :min-item-size="48"
        key-field="id"
        class="sm-scroller"
      >
        <template #default="{ item, active }">
          <DynamicScrollerItem :item="item" :active="active">
            <div
              class="sm-row"
              :class="{ 'row-has-removed': item.hasRemoved }"
              @click="openPanel(item)"
              role="button"
              tabindex="0"
              :title="'View ' + item.name"
            >
              <div class="sm-cell col-name">
                <span class="sm-name">{{ item.name }}</span>
                <span v-if="item.family" class="sm-family">{{ item.family }}</span>
              </div>
              <div class="sm-cell col-status">
                <span v-if="item.workingCount > 0" class="badge badge-working">Working ({{ item.workingCount }})</span>
                <span v-else-if="item.untestedCount > 0" class="badge badge-untested">{{ item.untestedCount }} untested</span>
                <span v-else-if="item.rateLimitedCount > 0" class="badge badge-rate_limited">{{ item.rateLimitedCount }} rate ltd</span>
                <span v-else-if="item.brokenCount > 0" class="badge badge-broken">{{ item.brokenCount }} broken</span>
                <span v-else class="badge badge-not_found">—</span>
              </div>
              <div class="sm-cell col-providers">
                <div class="provider-tags">
                  <span v-for="p in item.providers.slice(0, 4)" :key="p" class="provider-tag">{{ p }}</span>
                  <span v-if="item.providers.length > 4" class="provider-tag more">+{{ item.providers.length - 4 }}</span>
                </div>
              </div>
              <div class="sm-cell col-instances">
                <span class="instance-badge">{{ item.datapointsCount }}</span>
                <span class="instance-label">instance{{ item.datapointsCount !== 1 ? 's' : '' }}</span>
              </div>
              <div class="sm-cell col-context">
                <span class="context-len">{{ item.best_context_length ? formatContext(item.best_context_length) : '—' }}</span>
              </div>
              <div class="sm-cell col-tools">
                <span v-if="item.any_tools" class="check-yes">Yes</span>
                <span v-else class="check-no">—</span>
              </div>
              <div class="sm-cell col-roles">
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
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <h3>No super models found</h3>
        <p>No super models match your current search or filters.</p>
        <button class="clear-btn" @click="searchQuery = ''; statusFilter = 'all'">Clear all filters</button>
      </div>
    </div>

    <!-- Super model detail panel -->
    <SuperModelPanel
      v-if="panelModel"
      :open="!!panelModel"
      :model="panelModel"
      :model-index="panelIndex"
      :model-list="panelModelList"
      @close="panelModel = null"
      @navigate-to="navigatePanel"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import { useModelsStore } from '@/store/models';
import SuperModelPanel from '@/components/SuperModelPanel.vue';
import type { ModelData } from '@/types';

const ROLES = ['model', 'build', 'general', 'small_model', 'explore'] as const;
const ROLE_SHORT: Record<string, string> = { model: 'Mod', build: 'Bld', general: 'Gen', small_model: 'Sml', explore: 'Exp' };

const store = useModelsStore();

interface SuperItem {
  id: number;
  name: string;
  slug: string;
  family: string | null;
  providers: string[];
  datapointsCount: number;
  allTags: string[];
  workingCount: number;
  untestedCount: number;
  rateLimitedCount: number;
  brokenCount: number;
  best_context_length: number | null;
  any_tools: boolean;
  hasRemoved: boolean;
  topRoles: { role: string; label: string; rank: number }[];
}

const superItems = computed<SuperItem[]>(() => {
  return store.visibleModels.map((m) => {
    const providers = [...new Set(m.providers.map((p) => p.provider))];
    const dps = m.providers.filter((p) => !p._removed);
    const working = dps.filter((d) => d.status.result === 'working');
    const broken = dps.filter((d) => d.status.result === 'broken');
    const rateLimited = dps.filter((d) => d.status.result === 'rate_limited');
    const untested = dps.filter((d) => d.status.result === 'untested');
    const families = [...new Set(dps.map((d) => d.family).filter((f): f is string => !!f))];
    const allTags = [...new Set(dps.flatMap((d) => [...d.tags, ...d.best_for]))];

    const topRanked: { role: string; label: string; rank: number }[] = [];
    for (const role of ROLES) {
      const arr = store.roleRankings[role] ?? [];
      let bestRank = Infinity;
      for (const dp of dps) {
        const idx = arr.indexOf(dp.full_id);
        if (idx !== -1 && idx + 1 < bestRank) bestRank = idx + 1;
      }
      if (bestRank < Infinity) topRanked.push({ role, label: ROLE_SHORT[role] ?? role, rank: bestRank });
    }
    topRanked.sort((a, b) => a.rank - b.rank);

    return {
      id: m.super_id,
      name: m.name,
      slug: m.slug,
      family: families.length === 1 ? families[0] : null,
      providers,
      datapointsCount: dps.length,
      allTags,
      workingCount: working.length,
      untestedCount: untested.length,
      rateLimitedCount: rateLimited.length,
      brokenCount: broken.length,
      best_context_length: m.best_context,
      any_tools: dps.some((d) => d.supports_tools),
      hasRemoved: m.providers.some((d) => d._removed),
      topRoles: topRanked.slice(0, 3),
    };
  });
});

const searchQuery = ref('');
const statusFilter = ref('all');
const sortBy = ref('name');
const sortDesc = ref(false);

const searchedItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return superItems.value;
  return superItems.value.filter((m) =>
    m.name.toLowerCase().includes(q) ||
    m.providers.some((p) => p.toLowerCase().includes(q)) ||
    m.allTags.some((t) => t.toLowerCase().includes(q)),
  );
});

const filteredItems = computed(() => {
  const items = searchedItems.value;
  if (statusFilter.value === 'all') return items;
  if (statusFilter.value === 'working') return items.filter((i) => i.workingCount > 0);
  if (statusFilter.value === 'untested') return items.filter((i) => i.untestedCount > 0 && i.workingCount === 0);
  if (statusFilter.value === 'partial') return items.filter((i) => i.workingCount > 0 && (i.rateLimitedCount > 0 || i.brokenCount > 0));
  if (statusFilter.value === 'not_working') return items.filter((i) => i.workingCount === 0);
  return items;
});

const statusPills = computed(() => {
  const items = superItems.value;
  return [
    { key: 'all', label: 'All', count: items.length },
    { key: 'working', label: 'Working', count: items.filter((i) => i.workingCount > 0).length },
    { key: 'untested', label: 'Untested', count: items.filter((i) => i.untestedCount > 0 && i.workingCount === 0).length },
    { key: 'partial', label: 'Mixed', count: items.filter((i) => i.workingCount > 0 && (i.rateLimitedCount > 0 || i.brokenCount > 0)).length },
    { key: 'not_working', label: 'Down', count: items.filter((i) => i.workingCount === 0).length },
  ];
});

const statusCounts = computed(() => ({
  working: superItems.value.filter((i) => i.workingCount > 0).length,
  partial: superItems.value.filter((i) => i.workingCount > 0 && (i.rateLimitedCount > 0 || i.brokenCount > 0)).length,
  untested: superItems.value.filter((i) => i.untestedCount > 0 && i.workingCount === 0).length,
  broken: superItems.value.filter((i) => i.workingCount === 0 && i.untestedCount === 0).length,
}));
const workingSupers = computed(() => statusCounts.value.working);
const partialSupers = computed(() => statusCounts.value.partial);
const untestedSupers = computed(() => statusCounts.value.untested);
const brokenSupers = computed(() => statusCounts.value.broken);

const sortedItems = computed(() => {
  const arr = [...filteredItems.value];
  arr.sort((a, b) => {
    let cmp = 0;
    switch (sortBy.value) {
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'providers': cmp = b.providers.length - a.providers.length; break;
      case 'instances': cmp = b.datapointsCount - a.datapointsCount; break;
      case 'context': cmp = (b.best_context_length ?? 0) - (a.best_context_length ?? 0); break;
      case 'status': {
        const score = (i: SuperItem) => (i.workingCount > 0 ? 3 : i.untestedCount > 0 ? 2 : i.rateLimitedCount > 0 ? 1 : 0);
        cmp = score(b) - score(a); break;
      }
      case 'tools': cmp = (b.any_tools ? 1 : 0) - (a.any_tools ? 1 : 0); break;
    }
    return sortDesc.value ? -cmp : cmp;
  });
  return arr;
});

function setSort(field: string) {
  if (sortBy.value === field) sortDesc.value = !sortDesc.value;
  else { sortBy.value = field; sortDesc.value = false; }
}

function formatContext(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(n);
}

// ── Super model detail panel ──
const panelModel = ref<ModelData | null>(null);
const panelIndex = ref(0);

// Build the list of full ModelData objects matching the sorted/filtered super items
const panelModelList = computed((): ModelData[] => {
  const sortedSlugs = new Set(sortedItems.value.map(i => i.slug));
  const result: ModelData[] = [];
  for (const m of store.visibleModels) {
    if (sortedSlugs.has(m.slug)) result.push(m);
  }
  // Reorder to match sortedItems
  result.sort((a, b) => {
    const ai = sortedItems.value.findIndex(i => i.slug === a.slug);
    const bi = sortedItems.value.findIndex(i => i.slug === b.slug);
    return ai - bi;
  });
  return result;
});

function openPanel(item: SuperItem) {
  const idx = panelModelList.value.findIndex(m => m.slug === item.slug);
  if (idx === -1) return;
  const model = panelModelList.value[idx];
  if (!model) return;
  panelIndex.value = idx;
  panelModel.value = model;
}

function navigatePanel(index: number) {
  const model = panelModelList.value[index];
  if (!model) return;
  panelIndex.value = index;
  panelModel.value = model;
}
</script>

<style scoped>
.page-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.page-header p { font-size: 0.78rem; color: var(--text-muted); margin: 0 0 20px; }

/* Controls */
.sm-controls { margin-bottom: 12px; }
.sm-search {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: var(--bg-elevated, var(--bg-card));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 10px;
}
.sm-search svg { color: var(--text-muted); flex-shrink: 0; }
.sm-search input {
  flex: 1; background: none; border: none; color: var(--text);
  font-size: 0.82rem; outline: none; padding: 0;
}
.sm-search input::placeholder { color: var(--text-muted); }
.search-clear { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 2px; font-size: 0.85rem; }
.search-clear:hover { color: var(--text); }

.sm-filters { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
.filter-pills { display: flex; gap: 4px; flex-wrap: wrap; }
.filter-pill {
  display: flex; align-items: center; gap: 5px; padding: 5px 10px;
  border-radius: 999px; border: 1px solid var(--border);
  background: none; color: var(--text-dim); font-size: 0.72rem;
  font-weight: 500; cursor: pointer; transition: all 0.12s;
}
.filter-pill:hover { color: var(--text); border-color: var(--text-muted); }
.filter-pill.active { color: var(--accent); border-color: var(--accent); background: var(--accent-subtle); }
.pill-count { font-size: 0.6rem; opacity: 0.7; font-weight: 600; }

.sm-sort { display: flex; align-items: center; gap: 6px; }
.sort-select {
  background: var(--bg-elevated, var(--bg-card)); border: 1px solid var(--border);
  color: var(--text); font-size: 0.72rem; padding: 5px 8px;
  border-radius: var(--radius-sm); cursor: pointer; outline: none;
}
.sort-dir-btn {
  background: var(--bg-elevated, var(--bg-card)); border: 1px solid var(--border);
  color: var(--text); padding: 5px 8px; border-radius: var(--radius-sm);
  cursor: pointer; font-family: monospace;
}

.sm-count { font-size: 0.68rem; color: var(--text-muted); }

/* Status bar */
.sm-status-bar { display: flex; height: 4px; border-radius: 2px; overflow: hidden; margin-bottom: 14px; gap: 1px; }
.status-segment { min-width: 2px; transition: flex 0.3s; }
.status-segment.working { background: var(--green); }
.status-segment.partial { background: var(--orange); }
.status-segment.untested { background: var(--accent); }
.status-segment.broken { background: var(--red); }

/* Table */
.sm-table { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
.sm-header-row {
  display: flex; align-items: center; padding: 8px 16px;
  background: var(--bg-elevated, var(--bg-card)); border-bottom: 1px solid var(--border);
  font-size: 0.65rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-dim);
}
.sm-scroller { height: calc(100vh - 400px); }

.sm-row {
  display: flex; align-items: center; padding: 8px 16px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer; transition: background 0.1s;
}
.sm-row:hover { background: var(--bg-hover); }
.sm-row.row-has-removed { border-left: 3px solid var(--orange); }

.sm-cell { overflow: hidden; }
.sm-h-cell { overflow: hidden; display: flex; align-items: center; gap: 2px; }
.sm-h-cell.sortable { cursor: pointer; user-select: none; }
.sm-h-cell.sortable:hover { color: var(--text); }
.sortActive { color: var(--accent) !important; }
.sort-arrow { font-family: monospace; font-size: 0.5rem; }

.col-name      { width: 22%; min-width: 140px; }
.col-status    { width: 13%; min-width: 110px; }
.col-providers { width: 14%; min-width: 100px; }
.col-instances { width: 8%;  min-width: 70px; }
.col-context   { width: 10%; min-width: 75px; }
.col-tools     { width: 6%;  min-width: 50px; }
.col-roles     { width: 27%; min-width: 150px; }

.sm-name { font-weight: 600; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.sm-family { display: inline-block; font-size: 0.6rem; color: var(--text-muted); background: var(--accent-subtle); padding: 1px 6px; border-radius: 999px; margin-top: 2px; }

/* Badges */
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.65rem; font-weight: 600; }
.badge-working { background: rgba(63,185,80,0.12); color: var(--green); }
.badge-untested { background: var(--accent-subtle); color: var(--accent); }
.badge-rate_limited { background: rgba(251,191,36,0.12); color: var(--orange); }
.badge-broken { background: rgba(248,113,113,0.12); color: var(--red); }
.badge-not_found { color: var(--text-muted); }

/* Provider tags */
.provider-tags { display: flex; flex-wrap: wrap; gap: 3px; }
.provider-tag { display: inline-block; padding: 1px 5px; border-radius: 4px; font-size: 0.6rem; font-weight: 500; background: var(--accent-subtle); color: var(--accent); white-space: nowrap; }
.provider-tag.more { background: var(--bg-hover); color: var(--text-muted); }

/* Instances */
.col-instances { text-align: center; }
.instance-badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; background: var(--accent-subtle); color: var(--accent); line-height: 1; }
.instance-label { display: block; font-size: 0.55rem; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.03em; }

/* Context / Tools */
.context-len { font-size: 0.75rem; font-weight: 500; color: var(--text-dim); }
.check-yes { color: var(--green); font-weight: 700; font-size: 0.72rem; }
.check-no { color: var(--text-muted); }

/* Role badges */
.role-badges-inline { display: flex; flex-wrap: wrap; gap: 4px; }
.role-badge { display: inline-block; padding: 2px 6px; border-radius: 999px; background: var(--accent-subtle); font-size: 0.6rem; white-space: nowrap; color: var(--text-dim); }
.role-badge.role-top { background: rgba(63,185,80,0.12); color: var(--green); }

/* Empty */
.empty-state { text-align: center; padding: 60px 24px; color: var(--text-muted); }
.empty-state h3 { font-size: 1rem; margin: 12px 0 4px; color: var(--text); }
.empty-state p { font-size: 0.78rem; margin-bottom: 16px; }
.clear-btn {
  background: var(--accent-subtle); border: 1px solid var(--accent);
  color: var(--accent); padding: 6px 14px; border-radius: var(--radius-sm);
  cursor: pointer; font-size: 0.75rem;
}

@media (max-width: 768px) {
  .sm-search { padding: 10px 12px; }
  .sm-search input { font-size: 0.85rem; min-height: 44px; }
  .sm-filters { flex-direction: column; align-items: stretch; gap: 8px; }
  .filter-pill { min-height: 40px; padding: 8px 12px; }
  .sort-select { min-height: 44px; width: 100%; }
  .sort-dir-btn { min-height: 44px; padding: 8px 16px; }
  .sm-name { max-width: 200px; }
  .sm-count { text-align: right; }
}
</style>
