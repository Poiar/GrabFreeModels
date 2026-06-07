<template>
  <div class="model-list-page">
    <!-- Stale warning -->
    <div v-if="store.isStale" class="stale-banner">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>Data may be stale (loaded over 1 hour ago).</span>
      <button class="refresh-btn refresh-btn-sm" @click="store.loadData()">Refresh</button>
    </div>

    <!-- Page header -->
    <div class="ml-header">
      <h2>Models</h2>
      <p class="ml-subtitle">
        {{ filteredModels.length }} models from {{ store.creators.length }} creators
      </p>
    </div>

    <!-- Controls -->
    <div class="ml-controls">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search models..."
        class="ml-search"
        aria-label="Search models"
      />
      <select v-model="creatorFilter" class="ml-select" aria-label="Filter by creator">
        <option value="">All Creators</option>
        <option v-for="c in store.creators" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select v-model="statusFilter" class="ml-select" aria-label="Filter by status">
        <option value="">All</option>
        <option value="working">Working</option>
        <option value="mixed">Mixed</option>
        <option value="untested">Untested</option>
        <option value="down">Down</option>
      </select>
      <label class="ml-checkbox" title="Show only models requiring a credit card">
        <input v-model="cardRequiredFilter" type="checkbox" />
        <span>Card req.</span>
      </label>
      <div class="ml-sort">
        <select v-model="sortKey" class="ml-select" aria-label="Sort by">
          <option value="name">Name</option>
          <option value="context">Context</option>
          <option value="providers">Providers</option>
        </select>
        <button
          class="ml-sort-dir"
          :title="sortAsc ? 'Ascending' : 'Descending'"
          @click="sortAsc = !sortAsc"
        >
          {{ sortAsc ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <!-- Export buttons -->
    <div class="ml-export">
      <button class="export-btn" @click="exportJSON">Export JSON</button>
      <button class="export-btn" @click="exportCSV">Export CSV</button>
    </div>

    <!-- Model list -->
    <div class="ml-list">
      <ModelCard
        v-for="{ model, creator } in filteredAndSortedModels"
        :key="model.super_id"
        :model="model"
        :creator="creator"
        @model-click="openDetail(model, creator)"
        @provider-click="openDetail(model, creator)"
      />
    </div>

    <!-- Error state -->
    <div v-if="store.error && !store.loading" class="ml-error">
      <p>Could not load model data. The server may be unavailable.</p>
      <p class="ml-error-detail">{{ store.error }}</p>
      <button class="refresh-btn" @click="store.loadData()">Retry</button>
    </div>

    <!-- Empty state -->
    <div v-if="!store.error && filteredAndSortedModels.length === 0 && !store.loading" class="ml-empty">
      <p>No models match your filters.</p>
      <button class="refresh-btn" @click="clearFilters">Clear filters</button>
    </div>

    <!-- Detail panel -->
    <ModelDetailPanel
      v-if="detailModel"
      :open="!!detailModel"
      :model="detailModel.model"
      :creator="detailModel.creator"
      @close="closeDetail"
      @navigate-to="openDetail($event.model, $event.creator)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ModelCard from '@/components/ModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';
import { useModelsStore } from '@/store/models';
import type { ModelData, CreatorData } from '@/types';

const store = useModelsStore();
const route = useRoute();
const router = useRouter();

function getQueryParam(key: string, fallback: string): string {
  const v = route.query[key];
  return typeof v === 'string' ? v : fallback;
}

const searchQuery = ref(getQueryParam('q', ''));
const creatorFilter = ref(getQueryParam('creator', ''));
const statusFilter = ref(getQueryParam('status', ''));
const cardRequiredFilter = ref(getQueryParam('card', '') === '1');
const sortKey = ref(getQueryParam('sort', 'name'));
const sortAsc = ref(getQueryParam('asc', 'true') !== 'false');

// Sync filter state → URL query params
watch(
  [searchQuery, creatorFilter, statusFilter, cardRequiredFilter, sortKey, sortAsc],
  () => {
    const q: Record<string, string> = {};
    if (searchQuery.value) q.q = searchQuery.value;
    if (creatorFilter.value) q.creator = creatorFilter.value;
    if (statusFilter.value) q.status = statusFilter.value;
    if (cardRequiredFilter.value) q.card = '1';
    if (sortKey.value !== 'name') q.sort = sortKey.value;
    if (!sortAsc.value) q.asc = 'false';
    router.replace({ query: Object.keys(q).length ? q : {} });
  },
);

const detailModel = ref<{ model: ModelData; creator: CreatorData } | null>(null);

function openDetail(model: ModelData, creator: CreatorData) {
  detailModel.value = { model, creator };
  router.push({ name: 'ModelDetail', params: { slug: model.slug } });
}

function closeDetail() {
  detailModel.value = null;
  router.push({ name: 'Models' });
}

// Watch route slug param — open detail on direct navigation
watch(
  [() => route.params.slug, () => store.creators],
  ([slug]) => {
    if (!slug || Array.isArray(slug)) {
      if (!detailModel.value) return;
      detailModel.value = null;
      return;
    }
    for (const creator of store.creators) {
      for (const model of creator.models) {
        if (model.slug === slug) {
          detailModel.value = { model, creator };
          return;
        }
      }
    }
  },
  { immediate: true },
);

function getModelStatus(model: ModelData): string {
  const active = model.providers.filter((p) => !p._removed);
  if (!active.length) return 'down';
  const working = active.filter((p) => p.status.result === 'working').length;
  if (working === active.length) return 'working';
  if (working > 0) return 'mixed';
  return 'down';
}

const filteredModels = computed(() => {
  let models = store.allModels;

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    models = models.filter((m) => m.name.toLowerCase().includes(q));
  }

  if (creatorFilter.value) {
    models = models.filter((m) => {
      const creator = store.creators.find((c) =>
        c.models.some((mod) => mod.super_id === m.super_id),
      );
      return creator?.id === creatorFilter.value;
    });
  }

  if (statusFilter.value) {
    models = models.filter((m) => getModelStatus(m) === statusFilter.value);
  }

  if (cardRequiredFilter.value) {
    models = models.filter((m) =>
      m.providers.some((p) => !p._removed && p.limitations?.requires_card),
    );
  }

  return models;
});

const filteredAndSortedModels = computed(() => {
  const list = filteredModels.value.map((model) => {
    const creator = store.creators.find((c) =>
      c.models.some((m) => m.super_id === model.super_id),
    )!;
    return { model, creator };
  });

  list.sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortKey.value) {
      case 'name':
        aVal = a.model.name;
        bVal = b.model.name;
        break;
      case 'context':
        aVal = a.model.best_context;
        bVal = b.model.best_context;
        break;
      case 'providers':
        aVal = a.model.providers.length;
        bVal = b.model.providers.length;
        break;
      default:
        return 0;
    }
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
    return sortAsc.value ? cmp : -cmp;
  });

  return list;
});

function clearFilters() {
  searchQuery.value = '';
  creatorFilter.value = '';
  statusFilter.value = '';
  cardRequiredFilter.value = false;
}

function exportJSON() {
  const data = filteredAndSortedModels.value.map(({ model, creator }) => ({
    name: model.name,
    creator: creator.name,
    providers: model.providers.map((p) => ({
      provider: p.provider,
      context: p.context_length,
      tools: p.supports_tools,
      status: p.status.result,
      limitations: p.limitations,
    })),
  }));
  downloadFile(JSON.stringify(data, null, 2), 'models.json', 'application/json');
}

function exportCSV() {
  const rows = [
    ['Model', 'Creator', 'Provider', 'Context', 'Tools', 'Status', 'Limitations'],
  ];
  for (const { model, creator } of filteredAndSortedModels.value) {
    for (const p of model.providers) {
      const l = p.limitations;
      const limitStr = l ? [l.rate_limit, l.daily_requests ? `${l.daily_requests}/day` : '', l.requires_card ? 'Card req.' : ''].filter(Boolean).join('; ') : '';
      rows.push([
        model.name,
        creator.name,
        p.provider,
        String(p.context_length || ''),
        String(!!p.supports_tools),
        p.status.result,
        limitStr,
      ]);
    }
  }
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  downloadFile(csv, 'models.csv', 'text/csv');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.model-list-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.stale-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid var(--orange);
  border-radius: 8px;
  font-size: 0.78rem;
  color: var(--orange);
}

.ml-header {
  margin-bottom: 16px;
}
.ml-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0 0 4px;
}
.ml-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}

.ml-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.ml-search {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 0.82rem;
  font-family: inherit;
}
.ml-search:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.ml-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
}

.ml-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  font-size: 0.72rem;
  color: var(--text-muted);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.ml-checkbox input {
  cursor: pointer;
  accent-color: var(--accent);
}

.ml-sort {
  display: flex;
  gap: 4px;
}

.ml-sort-dir {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-size: 0.78rem;
}

.ml-export {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.export-btn {
  padding: 6px 14px;
  font-size: 0.72rem;
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}
.export-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.ml-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ml-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.ml-error {
  text-align: center;
  padding: 40px 20px;
  color: var(--red, #ef4444);
}
.ml-error-detail {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 8px 0 16px;
}

.refresh-btn {
  padding: 6px 12px;
  font-size: 0.72rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}
.refresh-btn:hover {
  border-color: var(--accent);
}
.refresh-btn-sm {
  padding: 4px 10px;
  font-size: 0.68rem;
  margin-left: auto;
}

@media (max-width: 768px) {
  .model-list-page {
    padding: 12px;
  }
  .ml-controls {
    flex-direction: column;
  }
  .ml-search {
    min-width: auto;
  }
}
</style>
