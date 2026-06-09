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
      <h2>Instances</h2>
      <p class="ml-subtitle">
        {{ filteredAndSortedDatapoints.length }} instance{{ filteredAndSortedDatapoints.length !== 1 ? 's' : '' }} across {{ providerCount }} provider{{ providerCount !== 1 ? 's' : '' }}<template v-if="store.isSourceFilterActive"> <span class="filtered-note">(filtered)</span></template>
      </p>
    </div>

    <!-- Controls -->
    <div class="ml-controls">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search instances..."
        class="ml-search"
        aria-label="Search instances"
      />
      <select v-model="providerFilter" class="ml-select" aria-label="Filter by provider">
        <option value="">All Providers</option>
        <option v-for="p in store.visibleProviderRefs" :key="p.slug" :value="p.slug">{{ p.name }}</option>
      </select>
      <select v-model="creatorFilter" class="ml-select" aria-label="Filter by creator">
        <option value="">All Creators</option>
        <option v-for="c in store.visibleCreators" :key="c.id" :value="c.id">{{ c.name }}</option>
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
      <div class="ml-segmented" role="group" aria-label="Model type filter">
        <button :class="{ active: modelFilter === 'all' }" @click="modelFilter = 'all'">All</button>
        <button :class="{ active: modelFilter === 'root' }" @click="modelFilter = 'root'">Root</button>
        <button :class="{ active: modelFilter === 'finetune' }" @click="modelFilter = 'finetune'">Fine</button>
      </div>
      <div class="ml-sort">
        <select v-model="sortKey" class="ml-select" aria-label="Sort by">
          <option value="name">Sort: Name</option>
          <option value="provider">Sort: Provider</option>
          <option value="context">Sort: Context</option>
          <option value="status">Sort: Status</option>
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

    <!-- Derivation method filter chips -->
    <div class="ml-deriv-bar">
      <button
        v-for="chip in DERIV_CHIPS"
        :key="chip.value"
        class="ml-deriv-chip"
        :class="[chip.cssClass, { active: derivFilter === chip.value }]"
        @click="derivFilter = chip.value"
      >
        {{ chip.label }}
        <span class="ml-deriv-count">{{ modelDerivationCounts[chip.value] ?? 0 }}</span>
      </button>
    </div>

    <!-- Export buttons -->
    <div class="ml-export">
      <button class="export-btn" @click="exportJSON">Export JSON</button>
      <button class="export-btn" @click="exportCSV">Export CSV</button>
    </div>

    <!-- Instance list -->
    <div class="ml-list">
      <InstanceCard
        v-for="item in filteredAndSortedDatapoints"
        :key="item.dp.full_id"
        :dp="item.dp"
        :model="item.model"
        :creator="item.creator"
        :sibling-count="item.siblingCount"
        @click="openDetail(item.model, item.creator)"
      />
    </div>

    <!-- Error state -->
    <div v-if="store.error && !store.loading" class="ml-error">
      <p>Could not load model data. The server may be unavailable.</p>
      <p class="ml-error-detail">{{ store.error }}</p>
      <button class="refresh-btn" @click="store.loadData()">Retry</button>
    </div>

    <!-- Empty state -->
    <div v-if="!store.error && filteredAndSortedDatapoints.length === 0 && !store.loading" class="ml-empty">
      <p>No instances match your filters.</p>
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
import InstanceCard from '@/components/InstanceCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';
import { useModelsStore } from '@/store/models';
import type { ModelData, CreatorData, ProviderDatapoint } from '@/types';

const store = useModelsStore();
const route = useRoute();
const router = useRouter();

function getQueryParam(key: string, fallback: string): string {
  const v = route.query[key];
  return typeof v === 'string' ? v : fallback;
}

const searchQuery = ref(getQueryParam('q', ''));
const providerFilter = ref(getQueryParam('provider', ''));
const creatorFilter = ref(getQueryParam('creator', ''));
const statusFilter = ref(getQueryParam('status', ''));
const cardRequiredFilter = ref(getQueryParam('card', '') === '1');
const sortKey = ref(getQueryParam('sort', 'name'));
const sortAsc = ref(getQueryParam('asc', 'true') !== 'false');
const modelFilter = ref<'all' | 'root' | 'finetune'>('all');
const derivFilter = ref(getQueryParam('deriv', 'all'));

const DERIV_META: Record<string, { label: string; cssClass: string }> = {
  finetune: { label: 'FT', cssClass: 'deriv-ft' },
  merge: { label: 'Merge', cssClass: 'deriv-merge' },
  distillation: { label: 'Distill', cssClass: 'deriv-distill' },
  dpo: { label: 'DPO', cssClass: 'deriv-dpo' },
  continued_pretraining: { label: 'CPT', cssClass: 'deriv-cpt' },
  lora_adapter: { label: 'LoRA', cssClass: 'deriv-lora' },
};

const DERIV_CHIPS = [
  { value: 'all', label: 'All', cssClass: '' },
  { value: 'foundation', label: 'Foundation', cssClass: 'deriv-foundation' },
  ...Object.entries(DERIV_META).map(([value, meta]) => ({ value, label: meta.label, cssClass: meta.cssClass })),
];

// Sync filter state → URL query params
watch(
  [searchQuery, providerFilter, creatorFilter, statusFilter, cardRequiredFilter, sortKey, sortAsc, derivFilter],
  () => {
    const q: Record<string, string> = {};
    if (searchQuery.value) q.q = searchQuery.value;
    if (providerFilter.value) q.provider = providerFilter.value;
    if (creatorFilter.value) q.creator = creatorFilter.value;
    if (statusFilter.value) q.status = statusFilter.value;
    if (cardRequiredFilter.value) q.card = '1';
    if (sortKey.value !== 'name') q.sort = sortKey.value;
    if (!sortAsc.value) q.asc = 'false';
    if (derivFilter.value !== 'all') q.deriv = derivFilter.value;
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
  router.back();
}

// Watch route slug param — open detail on direct navigation
watch(
  [() => route.params.slug, () => store.visibleCreators],
  ([slug]) => {
    if (!slug || Array.isArray(slug)) {
      if (!detailModel.value) return;
      detailModel.value = null;
      return;
    }
    for (const creator of store.visibleCreators) {
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

// Flatten all visible datapoints with parent model + creator context
interface DatapointItem {
  dp: ProviderDatapoint;
  model: ModelData;
  creator: CreatorData;
  siblingCount: number;
}

const providerCount = computed(() => {
  const slugs = new Set<string>();
  for (const m of store.visibleModels) {
    for (const p of m.providers) {
      if (!p._removed) slugs.add(p.provider_slug);
    }
  }
  return slugs.size;
});

const filteredDatapoints = computed(() => {
  const items: DatapointItem[] = [];

  for (const creator of store.visibleCreators) {
    for (const model of creator.models) {
      const active = model.providers.filter((p) => !p._removed);
      const siblingCount = active.length - 1;
      for (const dp of active) {
        // Search filter
        if (searchQuery.value) {
          const q = searchQuery.value.toLowerCase();
          if (
            !dp.provider.toLowerCase().includes(q) &&
            !model.name.toLowerCase().includes(q) &&
            !creator.name.toLowerCase().includes(q)
          )
            continue;
        }

        // Provider filter
        if (providerFilter.value && dp.provider_slug !== providerFilter.value) continue;

        // Creator filter
        if (creatorFilter.value && creator.id !== creatorFilter.value) continue;

        // Status filter
        if (statusFilter.value && dp.status.result !== statusFilter.value) continue;

        // Card required filter
        if (cardRequiredFilter.value && !(dp.limitations?.requires_card)) continue;

        // Root/fine-tune filter
        if (modelFilter.value === 'root' && model.base_model) continue;
        if (modelFilter.value === 'finetune' && !model.base_model) continue;

        items.push({ dp, model, creator, siblingCount });
      }
    }
  }

  return items;
});

const modelDerivationCounts = computed(() => {
  const seenModels = new Set<string>();
  const counts: Record<string, number> = {};
  for (const chip of DERIV_CHIPS) {
    counts[chip.value] = 0;
  }

  for (const item of filteredDatapoints.value) {
    if (seenModels.has(item.model.slug)) continue;
    seenModels.add(item.model.slug);

    counts.all++;

    const method = item.model.derivation_method;
    if (method && counts[method] !== undefined) {
      counts[method]++;
    } else {
      counts.foundation++;
    }
  }

  return counts;
});

const filteredAndSortedDatapoints = computed(() => {
  // Apply derivation filter on top of filteredDatapoints
  let list = filteredDatapoints.value;
  if (derivFilter.value !== 'all') {
    list = list.filter((item) => {
      if (derivFilter.value === 'foundation') return !item.model.derivation_method;
      return item.model.derivation_method === derivFilter.value;
    });
  }
  list = [...list];

  list.sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortKey.value) {
      case 'name':
        aVal = a.model.name;
        bVal = b.model.name;
        break;
      case 'provider':
        aVal = a.dp.provider;
        bVal = b.dp.provider;
        break;
      case 'context':
        aVal = a.dp.context_length;
        bVal = b.dp.context_length;
        break;
      case 'status':
        aVal = a.dp.status.result;
        bVal = b.dp.status.result;
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
  providerFilter.value = '';
  creatorFilter.value = '';
  statusFilter.value = '';
  cardRequiredFilter.value = false;
  modelFilter.value = 'all';
  derivFilter.value = 'all';
}

function exportJSON() {
  const data = filteredAndSortedDatapoints.value.map(({ dp, model, creator }) => ({
    provider: dp.provider,
    model: model.name,
    creator: creator.name,
    context: dp.context_length,
    tools: dp.supports_tools,
    status: dp.status.result,
    limitations: dp.limitations,
  }));
  downloadFile(JSON.stringify(data, null, 2), 'instances.json', 'application/json');
}

function exportCSV() {
  const rows = [
    ['Provider', 'Model', 'Creator', 'Context', 'Tools', 'Status', 'Limitations'],
  ];
  for (const { dp, model, creator } of filteredAndSortedDatapoints.value) {
    const l = dp.limitations;
    const limitStr = l ? [l.rate_limit, l.daily_requests ? `${l.daily_requests}/day` : '', l.requires_card ? 'Card req.' : ''].filter(Boolean).join('; ') : '';
    rows.push([
      dp.provider,
      model.name,
      creator.name,
      String(dp.context_length || ''),
      String(!!dp.supports_tools),
      dp.status.result,
      limitStr,
    ]);
  }
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  downloadFile(csv, 'instances.csv', 'text/csv');
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

.filtered-note {
  color: var(--accent);
  font-weight: 600;
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

.ml-segmented {
  display: inline-flex;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.ml-segmented button {
  background: none;
  border: none;
  border-right: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.72rem;
  padding: 8px 12px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, color 0.12s;
}
.ml-segmented button:last-child { border-right: none; }
.ml-segmented button.active {
  background: var(--accent-subtle);
  color: var(--accent);
  font-weight: 600;
}
.ml-segmented button:hover:not(.active) { background: var(--bg-hover); }

/* Derivation filter chips */
.ml-deriv-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 14px;
}

.ml-deriv-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 11px;
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;
}

.ml-deriv-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.ml-deriv-chip.deriv-ft { border-color: rgba(99, 102, 241, 0.35); color: #818cf8; }
.ml-deriv-chip.deriv-merge { border-color: rgba(168, 85, 247, 0.35); color: #a855f7; }
.ml-deriv-chip.deriv-distill { border-color: rgba(236, 72, 153, 0.35); color: #ec4899; }
.ml-deriv-chip.deriv-dpo { border-color: rgba(34, 211, 238, 0.35); color: #22d3ee; }
.ml-deriv-chip.deriv-cpt { border-color: rgba(250, 204, 21, 0.35); color: #eab308; }
.ml-deriv-chip.deriv-lora { border-color: rgba(52, 211, 153, 0.35); color: #34d399; }
.ml-deriv-chip.deriv-foundation { border-color: rgba(156, 163, 175, 0.35); color: #9ca3af; }

.ml-deriv-chip.active {
  background: var(--accent-subtle);
  border-color: var(--accent);
  color: var(--accent);
}

.ml-deriv-chip.deriv-ft.active { background: rgba(99, 102, 241, 0.14); border-color: #818cf8; color: #818cf8; }
.ml-deriv-chip.deriv-merge.active { background: rgba(168, 85, 247, 0.14); border-color: #a855f7; color: #a855f7; }
.ml-deriv-chip.deriv-distill.active { background: rgba(236, 72, 153, 0.14); border-color: #ec4899; color: #ec4899; }
.ml-deriv-chip.deriv-dpo.active { background: rgba(34, 211, 238, 0.14); border-color: #22d3ee; color: #22d3ee; }
.ml-deriv-chip.deriv-cpt.active { background: rgba(250, 204, 21, 0.14); border-color: #eab308; color: #eab308; }
.ml-deriv-chip.deriv-lora.active { background: rgba(52, 211, 153, 0.14); border-color: #34d399; color: #34d399; }
.ml-deriv-chip.deriv-foundation.active { background: rgba(156, 163, 175, 0.14); border-color: #9ca3af; color: #9ca3af; }

.ml-deriv-count {
  font-size: 0.6rem;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  opacity: 0.8;
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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
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
