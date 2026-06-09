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
        <div class="filter-dropdowns">
          <select v-model="creatorFilter" class="sm-select" aria-label="Filter by creator">
            <option value="">All Creators</option>
            <option v-for="c in filteredCreatorOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <select v-model="familyFilter" class="sm-select" aria-label="Filter by family">
            <option value="">All Families</option>
            <option v-for="f in families" :key="f" :value="f">{{ formatFamily(f) }}</option>
          </select>
          <label class="sm-checkbox">
            <input v-model="toolsFilter" type="checkbox" />
            <span>Tools</span>
          </label>
          <label class="sm-checkbox">
            <input v-model="multiProviderFilter" type="checkbox" />
            <span>2+ Providers</span>
          </label>
          <div class="sm-segmented" role="group" aria-label="Model type filter">
            <button :class="{ active: modelFilter === 'all' }" @click="modelFilter = 'all'">All</button>
            <button :class="{ active: modelFilter === 'root' }" @click="modelFilter = 'root'">Root</button>
            <button :class="{ active: modelFilter === 'finetune' }" @click="modelFilter = 'finetune'">Fine</button>
          </div>
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
          <button class="view-toggle-btn" @click="viewMode = viewMode === 'flat' ? 'tree' : 'flat'" :title="viewMode === 'flat' ? 'Group by parent model' : 'Flat list'">{{ viewMode === 'flat' ? '⤵ Tree' : '≡ Flat' }}</button>
        </div>
      </div>
      <div class="sm-count">{{ filteredItems.length }} of {{ superItems.length }} super models</div>
    </div>

    <!-- Card list -->
    <template v-if="sortedItems.length > 0">
      <div v-if="viewMode === 'flat'" class="sm-list">
        <SuperModelCard
          v-for="item in sortedItems"
          :key="item.slug"
          :model="modelBySlug.get(item.slug)!"
          :creator-slug="item.creatorSlug ?? undefined"
          @click="openPanel(item)"
          @creator-click="openCreatorPanel"
        />
      </div>
      <div v-else class="sm-tree">
        <div
          v-for="entry in treeItems"
          :key="entry.item.slug"
          class="tree-entry"
          :class="{ 'tree-child': entry.depth > 0 }"
        >
          <SuperModelCard
            :model="modelBySlug.get(entry.item.slug)!"
            :creator-slug="entry.item.creatorSlug ?? undefined"
            @click="openPanel(entry.item)"
            @creator-click="openCreatorPanel"
          />
        </div>
      </div>
    </template>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <h3>No super models found</h3>
      <p>No super models match your current search or filters.</p>
      <button class="clear-btn" @click="clearAllFilters">Clear all filters</button>
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
import SuperModelCard from '@/components/SuperModelCard.vue';
import type { ModelData, CreatorData } from '@/types';

const store = useModelsStore();

const modelBySlug = computed(() => store.modelBySlug);

const creatorSlugMap = computed(() => {
  const map = new Map<string, string>();
  for (const c of store.visibleCreators) {
    map.set(c.name, c.id);
  }
  return map;
});

interface SuperItem {
  id: number;
  name: string;
  slug: string;
  creator: string | null;
  family: string | null;
  providers: { name: string; slug: string }[];
  datapointsCount: number;
  allTags: string[];
  workingCount: number;
  untestedCount: number;
  rateLimitedCount: number;
  brokenCount: number;
  best_context_length: number | null;
  any_tools: boolean;
  status: string;
  creatorSlug: string | null;
}

const superItems = computed<SuperItem[]>(() => {
  return store.visibleModels.map((m) => {
    const providerSet = new Map<string, string>();
    for (const p of m.providers) providerSet.set(p.provider_slug, p.provider);
    const providers = [...providerSet.entries()].map(([slug, name]) => ({ slug, name }));
    const dps = m.providers.filter((p) => !p._removed);
    const working = dps.filter((d) => d.status.result === 'working');
    const broken = dps.filter((d) => d.status.result === 'broken' || d.status.result === 'not_found');
    const rateLimited = dps.filter((d) => d.status.result === 'rate_limited');
    const untested = dps.filter((d) => d.status.result === 'untested');
    const allTags = [...new Set(dps.flatMap((d) => [...d.tags, ...d.best_for]))];

    let status = 'down';
    if (!dps.length) status = 'down';
    else if (working.length === dps.length) status = 'working';
    else if (working.length > 0) status = 'mixed';
    else status = 'down';

    return {
      id: m.super_id,
      name: m.name,
      slug: m.slug,
      creator: m.creator ?? null,
      family: m.family ?? null,
      providers,
      datapointsCount: dps.length,
      allTags,
      workingCount: working.length,
      untestedCount: untested.length,
      rateLimitedCount: rateLimited.length,
      brokenCount: broken.length,
      best_context_length: m.best_context,
      any_tools: dps.some((d) => d.supports_tools),
      status,
      creatorSlug: m.creator ? (creatorSlugMap.value.get(m.creator) ?? null) : null,
    };
  });
});

const searchQuery = ref('');
const creatorFilter = ref('');
const familyFilter = ref('');
const toolsFilter = ref(false);
const multiProviderFilter = ref(false);
const sortBy = ref('creator');
const sortDesc = ref(false);
const viewMode = ref<'flat' | 'tree'>('flat');
const modelFilter = ref<'all' | 'root' | 'finetune'>('all');

const searchedItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return superItems.value;
  return superItems.value.filter((m) =>
    m.name.toLowerCase().includes(q) ||
    m.providers.some((p) => p.name.toLowerCase().includes(q)) ||
    m.allTags.some((t) => t.toLowerCase().includes(q)),
  );
});

const families = computed(() => {
  const set = new Set<string>();
  for (const m of searchedItems.value) {
    if (m.family) set.add(m.family);
  }
  return [...set].sort();
});

const filteredCreatorOptions = computed(() => {
  const activeCreators = new Set<string>();
  for (const item of searchedItems.value) {
    if (item.creator) activeCreators.add(item.creator);
  }
  return store.visibleCreators.filter(c => activeCreators.has(c.name));
});

const filteredItems = computed(() => {
  let items = searchedItems.value;
  if (creatorFilter.value) items = items.filter(i => i.creatorSlug === creatorFilter.value);
  if (familyFilter.value) items = items.filter(i => i.family === familyFilter.value);
  if (toolsFilter.value) items = items.filter(i => i.any_tools);
  if (multiProviderFilter.value) items = items.filter(i => i.datapointsCount >= 2);
  if (modelFilter.value !== 'all') {
    items = items.filter(i => {
      const m = modelBySlug.value.get(i.slug);
      if (!m) return modelFilter.value === 'root';
      return modelFilter.value === 'root' ? !m.base_model : !!m.base_model;
    });
  }
  return items;
});

const sortedItems = computed(() => {
  const arr = [...filteredItems.value];
  arr.sort((a, b) => {
    let cmp = 0;
    switch (sortBy.value) {
      case 'creator':
        if (!a.creator && !b.creator) cmp = 0;
        else if (!a.creator) cmp = 1;
        else if (!b.creator) cmp = -1;
        else cmp = a.creator.localeCompare(b.creator);
        break;
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'providers': cmp = b.providers.length - a.providers.length; break;
      case 'instances': cmp = b.datapointsCount - a.datapointsCount; break;
      case 'context': cmp = (b.best_context_length ?? 0) - (a.best_context_length ?? 0); break;
      case 'status': {
        const score = (i: SuperItem) => (i.workingCount > 0 ? 3 : i.rateLimitedCount > 0 ? 2 : i.brokenCount > 0 ? 1 : 0);
        cmp = score(b) - score(a); break;
      }
      case 'tools': cmp = (b.any_tools ? 1 : 0) - (a.any_tools ? 1 : 0); break;
    }
    return sortDesc.value ? -cmp : cmp;
  });
  return arr;
});

const treeItems = computed(() => {
  const flat = sortedItems.value;
  const visibleSlugs = new Set(flat.map(i => i.slug));
  const childItems = new Map<string, SuperItem[]>();
  const isChildSlug = new Set<string>();

  for (const item of flat) {
    const m = modelBySlug.value.get(item.slug);
    const parentSlug = m?.base_model;
    if (parentSlug && visibleSlugs.has(parentSlug)) {
      isChildSlug.add(item.slug);
      if (!childItems.has(parentSlug)) childItems.set(parentSlug, []);
      childItems.get(parentSlug)!.push(item);
    }
  }

  // Sort children by name under each parent
  for (const [, children] of childItems) {
    children.sort((a, b) => a.name.localeCompare(b.name));
  }

  const result: { item: SuperItem; depth: number }[] = [];
  for (const item of flat) {
    if (isChildSlug.has(item.slug)) continue;
    result.push({ item, depth: 0 });
    for (const child of (childItems.get(item.slug) || [])) {
      result.push({ item: child, depth: 1 });
    }
  }
  return result;
});

const FAMILY_OVERRIDES: Record<string, string> = { gpt: 'GPT', glm: 'GLM', llm: 'LLM' };

function formatFamily(raw: string): string {
  return raw.split('-').map(w => FAMILY_OVERRIDES[w] ?? (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

function clearAllFilters() {
  searchQuery.value = '';
  creatorFilter.value = '';
  familyFilter.value = '';
  toolsFilter.value = false;
  multiProviderFilter.value = false;
  modelFilter.value = 'all';
  viewMode.value = 'flat';
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
.filter-dropdowns { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.sm-select {
  background: var(--bg-elevated, var(--bg-card)); border: 1px solid var(--border);
  color: var(--text); font-size: 0.72rem; padding: 5px 8px;
  border-radius: var(--radius-sm); cursor: pointer; outline: none;
  font-family: inherit;
}
.sm-checkbox {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 10px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated, var(--bg-card)); font-size: 0.68rem;
  color: var(--text-muted); cursor: pointer; font-family: inherit; white-space: nowrap;
}
.sm-checkbox input { cursor: pointer; accent-color: var(--accent); }

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

/* Segmented filter buttons */
.sm-segmented {
  display: inline-flex;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.sm-segmented button {
  background: none;
  border: none;
  border-right: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.68rem;
  padding: 5px 10px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, color 0.12s;
}
.sm-segmented button:last-child { border-right: none; }
.sm-segmented button.active {
  background: var(--accent-subtle);
  color: var(--accent);
  font-weight: 600;
}
.sm-segmented button:hover:not(.active) { background: var(--bg-hover); }

/* View toggle */
.view-toggle-btn {
  background: var(--bg-elevated, var(--bg-card));
  border: 1px solid var(--border);
  color: var(--text);
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.72rem;
  white-space: nowrap;
}
.view-toggle-btn:hover { border-color: var(--accent); color: var(--accent); }

/* Tree view */
.sm-tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tree-entry { position: relative; }
.tree-child { margin-left: 20px; }
.tree-child :deep(.sm-card) {
  border-left-color: var(--text-muted);
  padding-top: 6px;
  padding-bottom: 6px;
}

/* Card list */
.sm-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 8px;
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
  .sm-search { padding: 10px 12px; }
  .sm-search input { font-size: 0.85rem; min-height: 44px; }
  .sm-filters { flex-direction: column; align-items: stretch; gap: 8px; }
  .filter-dropdowns { flex-wrap: wrap; gap: 4px; }
  .sm-select { min-height: 44px; }
  .sm-checkbox { min-height: 40px; padding: 8px 12px; }
  .sort-select { min-height: 44px; width: 100%; }
  .sort-dir-btn { min-height: 44px; padding: 8px 16px; }
  .sm-count { text-align: right; }
}
</style>
