<template>
  <div class="sm-page">
    <div class="page-header">
      <h2>Super Models</h2>
      <p>Each canonical model with its provider instances — click to see all instances</p>
    </div>

    <!-- Search + Filters -->
    <div class="sm-controls">
      <div class="sm-search">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="searchQuery" type="text" placeholder="Search by name, provider, or tag…" spellcheck="false" />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">&times;</button>
      </div>
      <div class="sm-filters">
        <div class="filter-pills">
          <button v-for="f in statusPills" :key="f.key" :class="['filter-pill', { active: statusFilter === f.key }]" @click="statusFilter = f.key">
            {{ f.label }} <span class="pill-count">{{ f.count }}</span>
          </button>
        </div>
        <div class="sm-sort">
          <select v-model="sortBy" class="sort-select">
            <option value="creator">Sort: Creator</option>
            <option value="name">Sort: Name</option>
            <option value="providers">Sort: Providers</option>
            <option value="instances">Sort: Instances</option>
            <option value="context">Sort: Context</option>
            <option value="status">Sort: Status</option>
            <option value="tools">Sort: Tools</option>
          </select>
          <button class="sort-dir-btn" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Descending' : 'Ascending'">{{ sortDesc ? '↓' : '↑' }}</button>
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

    <!-- Card list -->
    <div v-if="sortedItems.length > 0" class="sm-list">
      <div
        v-for="item in sortedItems"
        :key="item.id"
        class="sm-card"
        :class="[`card-${item.status}`, { 'card-has-removed': item.hasRemoved }]"
        @click="openPanel(item)"
        role="button"
        tabindex="0"
      >
        <!-- Header -->
        <div class="sm-header">
          <div class="sm-header-left">
            <span
              class="sm-badge sm-badge-creator"
              :class="{ 'is-link': item.creator }"
              @click.stop="item.creator ? openCreatorPanel(item.creator) : null"
            >{{ item.creator || '—' }}<button v-if="item.creator" class="copy-btn-badge" title="Copy creator" @click.stop="copyText(item.creator!)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></span>
            <span class="sm-badge-sep">/</span>
            <span class="sm-badge sm-badge-model">{{ item.name }}<button class="copy-btn-badge" title="Copy name" @click.stop="copyText(item.name)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></span>
            <span v-if="item.family" class="sm-family-badge">{{ item.family }}</span>
          </div>
          <div class="sm-header-right">
            <span v-for="r in item.topRoles" :key="r.role" class="sm-ranking-badge" :title="r.role + ' rank #' + r.rank">
              #{{ r.rank }} {{ r.label }}
            </span>
          </div>
        </div>

        <!-- Stats -->
        <div class="sm-stats">
          <span class="sm-stat">{{ item.datapointsCount }} provider{{ item.datapointsCount !== 1 ? 's' : '' }}</span>
          <span class="sm-stat-divider">|</span>
          <span v-if="item.workingCount > 0" class="sm-stat sm-stat-working">{{ item.workingCount }} working</span>
          <span v-else-if="item.untestedCount > 0" class="sm-stat sm-stat-untested">{{ item.untestedCount }} untested</span>
          <span v-else-if="item.brokenCount > 0" class="sm-stat sm-stat-broken">{{ item.brokenCount }} broken</span>
          <span v-else class="sm-stat sm-stat-none">—</span>
          <span class="sm-stat-divider">|</span>
          <span class="sm-stat">Max: {{ item.best_context_length ? formatContext(item.best_context_length) : '—' }} ctx</span>
          <span v-if="item.any_tools" class="sm-stat-divider">|</span>
          <span v-if="item.any_tools" class="sm-stat sm-stat-tools">Tools</span>
          <span class="sm-status-pulse" :class="`pulse-${item.status}`"></span>
        </div>

        <!-- Provider tags -->
        <div class="sm-providers">
          <span v-for="p in item.providers.slice(0, 6)" :key="p" class="provider-tag">{{ p }}</span>
          <span v-if="item.providers.length > 6" class="provider-tag more">+{{ item.providers.length - 6 }}</span>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <h3>No super models found</h3>
      <p>No super models match your current search or filters.</p>
      <button class="clear-btn" @click="searchQuery = ''; statusFilter = 'all'">Clear all filters</button>
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

    <!-- Creator detail panel -->
    <CreatorPanel
      v-if="panelCreator"
      :open="!!panelCreator"
      :creator="panelCreator"
      :creator-index="creatorIndex"
      :creator-list="creatorList"
      @close="panelCreator = null"
      @navigate-to="navigateCreatorPanel"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '@/store/models';
import SuperModelPanel from '@/components/SuperModelPanel.vue';
import CreatorPanel from '@/components/CreatorPanel.vue';
import { useToast } from '@/composables/useToast';
import type { ModelData, CreatorData } from '@/types';

const ROLES = ['model', 'build', 'general', 'small_model', 'explore'] as const;
const ROLE_SHORT: Record<string, string> = { model: 'Mod', build: 'Bld', general: 'Gen', small_model: 'Sml', explore: 'Exp' };

const store = useModelsStore();

interface SuperItem {
  id: number;
  name: string;
  slug: string;
  creator: string | null;
  base_creator: string | null;
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
  status: string;
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

    let status = 'down';
    if (!dps.length) status = 'down';
    else if (working.length === dps.length) status = 'working';
    else if (working.length > 0) status = 'mixed';
    else status = 'down';

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
      creator: m.creator ?? null,
      base_creator: m.base_creator ?? null,
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
      status,
      topRoles: topRanked.slice(0, 3),
    };
  });
});

const searchQuery = ref('');
const statusFilter = ref('all');
const sortBy = ref('creator');
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
      case 'creator': cmp = (a.creator || '').localeCompare(b.creator || ''); break;
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

function formatContext(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(n);
}

const { success: toastSuccess } = useToast();

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toastSuccess(`"${text}" copied`); } catch { /* noop */ }
}

// ── Super model detail panel ──
const panelModel = ref<ModelData | null>(null);
const panelIndex = ref(0);

const panelModelList = computed((): ModelData[] => {
  const sortedSlugs = new Set(sortedItems.value.map(i => i.slug));
  const result: ModelData[] = [];
  for (const m of store.visibleModels) {
    if (sortedSlugs.has(m.slug)) result.push(m);
  }
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

// ── Creator detail panel ──
const panelCreator = ref<CreatorData | null>(null);
const creatorIndex = ref(0);

const creatorList = computed((): CreatorData[] => {
  const seen = new Set<string>();
  const result: CreatorData[] = [];
  const visibleCreators = new Set<string>();
  for (const item of filteredItems.value) {
    if (item.creator) visibleCreators.add(item.creator);
  }
  for (const c of store.visibleCreators) {
    if (visibleCreators.has(c.name) && !seen.has(c.name)) {
      seen.add(c.name);
      result.push(c);
    }
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
});

function openCreatorPanel(creatorName: string) {
  const idx = creatorList.value.findIndex(c => c.name === creatorName);
  if (idx === -1) return;
  creatorIndex.value = idx;
  panelCreator.value = creatorList.value[idx];
}

function navigateCreatorPanel(index: number) {
  const creator = creatorList.value[index];
  if (!creator) return;
  creatorIndex.value = index;
  panelCreator.value = creator;
}
</script>

<style scoped>
.sm-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

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

/* Card list */
.sm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sm-card {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s, border-left-color 0.3s, box-shadow 0.15s;
}

.sm-card.card-working { border-left-color: var(--green); }
.sm-card.card-mixed { border-left-color: var(--orange); }
.sm-card.card-down { border-left-color: var(--red); }

.sm-card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
}

.sm-card.card-has-removed {
  border-left-color: var(--orange);
}

/* Header — mirrors ModelCard */
.sm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.sm-header-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.sm-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
}

.sm-badge-creator {
  background: var(--accent-subtle);
  color: var(--accent);
}

.sm-badge-creator.is-link {
  cursor: pointer;
}

.sm-badge-creator.is-link:hover {
  filter: brightness(1.2);
}

.sm-badge-model {
  background: rgba(52, 211, 153, 0.12);
  color: var(--green);
}

.sm-badge-sep {
  font-size: 0.65rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.sm-header-right {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.sm-family-badge {
  font-size: 0.62rem;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.sm-ranking-badge {
  padding: 2px 8px;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.15);
  color: var(--green);
}

/* Copy button inside badges */
.copy-btn-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  border-radius: 2px;
  flex-shrink: 0;
  opacity: 0.5;
  transition: opacity 0.12s;
}

.sm-badge:hover .copy-btn-badge,
.copy-btn-badge:focus-visible {
  opacity: 1;
}

/* Stats row — mirrors ModelCard */
.sm-stats {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.sm-stat-divider {
  color: var(--border);
}

.sm-stat-working { color: var(--green); font-weight: 600; }
.sm-stat-untested { color: var(--accent); }
.sm-stat-broken { color: var(--red); }
.sm-stat-none { color: var(--text-muted); }
.sm-stat-tools { color: var(--green); font-weight: 600; }

.sm-status-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: auto;
  flex-shrink: 0;
}

.sm-status-pulse.pulse-working {
  background: var(--green);
  box-shadow: 0 0 6px var(--green-glow);
  animation: pulse-dot 2s var(--ease-smooth, ease-in-out) infinite;
}

.sm-status-pulse.pulse-mixed {
  background: var(--orange);
  box-shadow: 0 0 6px var(--orange-glow);
  animation: pulse-dot 1.5s var(--ease-smooth, ease-in-out) infinite;
}

.sm-status-pulse.pulse-down {
  background: var(--red);
  box-shadow: 0 0 6px var(--red-glow);
  animation: pulse-dot-error 1.5s var(--ease-smooth, ease-in-out) infinite;
}

/* Provider tags */
.sm-providers {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.provider-tag {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
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
  .sm-page { padding: 12px; }
  .sm-card { padding: 10px 12px; }
  .sm-header-right { display: none; }
  .sm-search { padding: 10px 12px; }
  .sm-search input { font-size: 0.85rem; min-height: 44px; }
  .sm-filters { flex-direction: column; align-items: stretch; gap: 8px; }
  .filter-pill { min-height: 40px; padding: 8px 12px; }
  .sort-select { min-height: 44px; width: 100%; }
  .sort-dir-btn { min-height: 44px; padding: 8px 16px; }
  .sm-count { text-align: right; }
}
</style>
