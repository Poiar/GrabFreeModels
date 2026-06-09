<template>
  <div class="catalog-page">
    <div class="page-header">
      <h2>Model Catalog</h2>
      <p>Browse and filter all models with faceted search</p>
    </div>

    <!-- Active filters bar -->
    <div class="active-filters-bar">
      <span class="filter-count-badge">{{ activeFilterCount }} active filter{{ activeFilterCount !== 1 ? 's' : '' }}</span>
      <span v-if="filteredModels.length > 0" class="result-count">{{ filteredModels.length }} model{{ filteredModels.length !== 1 ? 's' : '' }}</span>
      <button v-if="activeFilterCount > 0" class="clear-all-btn" @click="clearAllFilters">Clear all</button>
    </div>

    <!-- Facet controls (collapsible) -->
    <div class="facet-toggle-bar">
      <button class="facet-toggle-btn" @click="facetPanelOpen = !facetPanelOpen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="12" y1="18" x2="20" y2="18" />
        </svg>
        Filters
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: facetPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>

    <div v-show="facetPanelOpen" class="facet-panel glass-card">
      <div class="facet-grid">
        <!-- Search -->
        <div class="facet-group">
          <label class="facet-label">Search</label>
          <input v-model="searchQuery" type="text" placeholder="Search models..." class="facet-search-input" />
        </div>

        <!-- Family facet -->
        <div class="facet-group">
          <label class="facet-label">Family</label>
          <div class="facet-checkbox-list">
            <label v-for="f in familyOptions" :key="f" class="facet-checkbox">
              <input type="checkbox" :checked="selectedFamilies.has(f)" @change="toggleFamily(f)" />
              <span>{{ formatFamily(f) }}</span>
            </label>
            <div v-if="familyOptions.length === 0" class="facet-empty">No families</div>
          </div>
        </div>

        <!-- Provider facet -->
        <div class="facet-group">
          <label class="facet-label">Provider</label>
          <input v-model="providerSearch" type="text" placeholder="Filter providers..." class="facet-search-input facet-search-sm" />
          <div class="facet-checkbox-list">
            <label v-for="p in filteredProviderOptions" :key="p.slug" class="facet-checkbox">
              <input type="checkbox" :checked="selectedProviders.has(p.slug)" @change="toggleProvider(p.slug)" />
              <span>{{ p.name }}</span>
            </label>
            <div v-if="filteredProviderOptions.length === 0" class="facet-empty">No providers</div>
          </div>
        </div>

        <!-- Modality facet -->
        <div class="facet-group">
          <label class="facet-label">Modality</label>
          <div class="facet-checkbox-list">
            <label v-for="m in modalityOptions" :key="m" class="facet-checkbox">
              <input type="checkbox" :checked="selectedModalities.has(m)" @change="toggleModality(m)" />
              <span>{{ formatModality(m) }}</span>
            </label>
          </div>
        </div>

        <!-- Toggles -->
        <div class="facet-group">
          <label class="facet-label">Capabilities</label>
          <div class="facet-toggles">
            <label class="facet-toggle">
              <input type="checkbox" v-model="toolsOnly" />
              <span>Tools</span>
            </label>
            <label class="facet-toggle">
              <input type="checkbox" v-model="reasoningOnly" />
              <span>Reasoning</span>
            </label>
            <label class="facet-toggle">
              <input type="checkbox" v-model="openWeightsOnly" />
              <span>Open Weights</span>
            </label>
          </div>
        </div>

        <!-- Context range -->
        <div class="facet-group">
          <label class="facet-label">Context Length</label>
          <div class="facet-range">
            <input v-model.number="minContext" type="number" placeholder="Min" class="facet-range-input" min="0" />
            <span class="facet-range-sep">to</span>
            <input v-model.number="maxContext" type="number" placeholder="Max" class="facet-range-input" min="0" />
          </div>
          <div class="facet-range-presets">
            <button v-for="preset in contextPresets" :key="preset.label" class="preset-btn" @click="setContextPreset(preset)">{{ preset.label }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Results -->
    <div v-if="filteredModels.length > 0" class="catalog-results">
      <SuperModelCard
        v-for="model in filteredModels"
        :key="model.slug"
        :model="model"
        @click="openPanel(model)"
        @creator-click="navigateToCreator"
      />
    </div>

    <!-- Empty state -->
    <div v-else class="catalog-empty">
      <p>No models match your filters.</p>
      <button class="clear-all-btn" @click="clearAllFilters">Clear filters</button>
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
import { useModelsStore } from '@/store/models';
import type { ModelData, CreatorData } from '@/types';
import SuperModelCard from '@/components/SuperModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';

const route = useRoute();
const router = useRouter();
const store = useModelsStore();

// ── Facet state ──
const facetPanelOpen = ref(true);
const searchQuery = ref('');
const providerSearch = ref('');
const selectedFamilies = ref<Set<string>>(new Set());
const selectedProviders = ref<Set<string>>(new Set());
const selectedModalities = ref<Set<string>>(new Set());
const toolsOnly = ref(false);
const reasoningOnly = ref(false);
const openWeightsOnly = ref(false);
const minContext = ref<number | null>(null);
const maxContext = ref<number | null>(null);

interface ContextPreset {
  label: string;
  min: number | null;
  max: number | null;
}

const contextPresets: ContextPreset[] = [
  { label: '8K+', min: 8192, max: null },
  { label: '32K+', min: 32768, max: null },
  { label: '128K+', min: 131072, max: null },
  { label: '1M+', min: 1_000_000, max: null },
];

// ── URL sync ──
function syncFiltersFromRoute() {
  const q = route.query;
  searchQuery.value = typeof q.q === 'string' ? q.q : '';
  selectedFamilies.value = new Set(typeof q.families === 'string' ? q.families.split(',').filter(Boolean) : []);
  selectedProviders.value = new Set(typeof q.providers === 'string' ? q.providers.split(',').filter(Boolean) : []);
  selectedModalities.value = new Set(typeof q.modalities === 'string' ? q.modalities.split(',').filter(Boolean) : []);
  toolsOnly.value = q.tools === '1';
  reasoningOnly.value = q.reasoning === '1';
  openWeightsOnly.value = q.openWeights === '1';
  minContext.value = typeof q.minCtx === 'string' ? (parseInt(q.minCtx) || null) : null;
  maxContext.value = typeof q.maxCtx === 'string' ? (parseInt(q.maxCtx) || null) : null;
}

syncFiltersFromRoute();

watch(() => route.query, syncFiltersFromRoute, { deep: true });

function syncFiltersToRoute() {
  const q: Record<string, string> = {};
  if (searchQuery.value) q.q = searchQuery.value;
  if (selectedFamilies.value.size > 0) q.families = [...selectedFamilies.value].join(',');
  if (selectedProviders.value.size > 0) q.providers = [...selectedProviders.value].join(',');
  if (selectedModalities.value.size > 0) q.modalities = [...selectedModalities.value].join(',');
  if (toolsOnly.value) q.tools = '1';
  if (reasoningOnly.value) q.reasoning = '1';
  if (openWeightsOnly.value) q.openWeights = '1';
  if (minContext.value !== null) q.minCtx = String(minContext.value);
  if (maxContext.value !== null) q.maxCtx = String(maxContext.value);
  router.replace({ query: Object.keys(q).length ? q : {} });
}

// Debounced URL sync
let syncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(syncFiltersToRoute, 300);
}

watch([searchQuery, selectedFamilies, selectedProviders, selectedModalities, toolsOnly, reasoningOnly, openWeightsOnly, minContext, maxContext], scheduleSync, { deep: true });

// ── Facet options ──
const familyOptions = computed(() => {
  const families = new Set<string>();
  for (const model of store.allModels) {
    if (model.family) families.add(model.family);
  }
  return [...families].sort((a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b);
  });
});

const filteredProviderOptions = computed(() => {
  const q = providerSearch.value.toLowerCase();
  return store.visibleProviderRefs.filter(p => !q || p.name.toLowerCase().includes(q));
});

const modalityOptions = ['text', 'image', 'audio'];

// ── Active filter count ──
const activeFilterCount = computed(() => {
  let count = 0;
  if (searchQuery.value) count++;
  if (selectedFamilies.value.size > 0) count++;
  if (selectedProviders.value.size > 0) count++;
  if (selectedModalities.value.size > 0) count++;
  if (toolsOnly.value) count++;
  if (reasoningOnly.value) count++;
  if (openWeightsOnly.value) count++;
  if (minContext.value !== null) count++;
  if (maxContext.value !== null) count++;
  return count;
});

// ── Filtering logic ──
const allSuperModels = computed(() => {
  return store.allModels;
});

const filteredModels = computed(() => {
  let models = allSuperModels.value;

  // Text search
  const q = searchQuery.value.toLowerCase().trim();
  if (q) {
    models = models.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.creator && m.creator.toLowerCase().includes(q)) ||
      (m.family && m.family.toLowerCase().includes(q)) ||
      m.providers.some(p => p.provider.toLowerCase().includes(q))
    );
  }

  // Family filter
  if (selectedFamilies.value.size > 0) {
    models = models.filter(m => m.family && selectedFamilies.value.has(m.family));
  }

  // Provider filter
  if (selectedProviders.value.size > 0) {
    models = models.filter(m =>
      m.providers.some(p => !p._removed && selectedProviders.value.has(p.provider_slug))
    );
  }

  // Modality filter
  if (selectedModalities.value.size > 0) {
    models = models.filter(m => {
      const allInputs = new Set<string>();
      const allOutputs = new Set<string>();
      for (const dp of m.providers) {
        for (const t of dp.input_types) allInputs.add(t);
        for (const t of dp.output_types) allOutputs.add(t);
      }
      return [...selectedModalities.value].every(mod =>
        allInputs.has(mod) || allOutputs.has(mod)
      );
    });
  }

  // Tools filter
  if (toolsOnly.value) {
    models = models.filter(m => m.providers.some(p => !p._removed && p.supports_tools));
  }

  // Reasoning filter
  if (reasoningOnly.value) {
    models = models.filter(m => m.providers.some(p => !p._removed && p.supports_reasoning));
  }

  // Open weights filter
  if (openWeightsOnly.value) {
    models = models.filter(m => m.providers.some(p => !p._removed && p.open_weights));
  }

  // Context range filter
  if (minContext.value !== null) {
    models = models.filter(m => m.best_context === null || m.best_context >= minContext.value!);
  }
  if (maxContext.value !== null) {
    models = models.filter(m => m.best_context !== null && m.best_context <= maxContext.value!);
  }

  return models;
});

// ── Filter actions ──
function toggleFamily(f: string) {
  const next = new Set(selectedFamilies.value);
  if (next.has(f)) next.delete(f);
  else next.add(f);
  selectedFamilies.value = next;
}

function toggleProvider(slug: string) {
  const next = new Set(selectedProviders.value);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  selectedProviders.value = next;
}

function toggleModality(m: string) {
  const next = new Set(selectedModalities.value);
  if (next.has(m)) next.delete(m);
  else next.add(m);
  selectedModalities.value = next;
}

function setContextPreset(preset: ContextPreset) {
  if (minContext.value === preset.min && maxContext.value === preset.max) {
    minContext.value = null;
    maxContext.value = null;
  } else {
    minContext.value = preset.min;
    maxContext.value = preset.max;
  }
}

function clearAllFilters() {
  searchQuery.value = '';
  providerSearch.value = '';
  selectedFamilies.value = new Set();
  selectedProviders.value = new Set();
  selectedModalities.value = new Set();
  toolsOnly.value = false;
  reasoningOnly.value = false;
  openWeightsOnly.value = false;
  minContext.value = null;
  maxContext.value = null;
  syncFiltersToRoute();
}

// ── Formatting helpers ──
function formatFamily(name: string): string {
  return name === 'Uncategorized' ? 'Uncategorized' : name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatModality(m: string): string {
  const map: Record<string, string> = {
    text: 'Text',
    image: 'Image',
    audio: 'Audio',
    video: 'Video',
  };
  return map[m] || m;
}

// ── Detail panel ──
const detailModel = ref<{ model: ModelData; creator: CreatorData } | null>(null);

function openPanel(model: ModelData) {
  // Find creator
  for (const creator of store.visibleCreators) {
    for (const m of creator.models) {
      if (m.super_id === model.super_id) {
        detailModel.value = { model, creator };
        return;
      }
    }
  }
}

function openDetail(model: ModelData, creator: CreatorData) {
  detailModel.value = { model, creator };
}

function closeDetail() {
  detailModel.value = null;
}

function navigateToCreator(creatorName: string) {
  router.push({ name: 'CreatorDetail', params: { id: creatorName } });
}
</script>

<style scoped>
.catalog-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0 0 4px;
}

.page-header p {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0 0 16px;
}

/* ── Active filters bar ── */
.active-filters-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 0.75rem;
}

.filter-count-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 12px;
  background: var(--accent-subtle);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.7rem;
}

.result-count {
  color: var(--text-muted);
  font-weight: 600;
}

.clear-all-btn {
  padding: 4px 12px;
  font-size: 0.7rem;
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
  margin-left: auto;
}

.clear-all-btn:hover {
  border-color: var(--red);
  color: var(--red);
}

/* ── Facet toggle ── */
.facet-toggle-bar {
  margin-bottom: 8px;
}

.facet-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}

.facet-toggle-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Facet panel ── */
.facet-panel {
  padding: 16px 20px;
  margin-bottom: 16px;
}

.facet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.facet-group {
  min-width: 0;
}

.facet-label {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.facet-search-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 0.75rem;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

.facet-search-input:focus {
  border-color: var(--accent);
}

.facet-search-sm {
  margin-bottom: 4px;
}

.facet-checkbox-list {
  max-height: 160px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.facet-checkbox {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  color: var(--text);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: background 0.1s;
}

.facet-checkbox:hover {
  background: var(--bg-hover);
}

.facet-checkbox input {
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}

.facet-checkbox span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.facet-empty {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-style: italic;
  padding: 4px 0;
}

/* ── Toggles ── */
.facet-toggles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.facet-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 3px 4px;
  border-radius: 3px;
}

.facet-toggle:hover {
  background: var(--bg-hover);
}

.facet-toggle input {
  accent-color: var(--accent);
  cursor: pointer;
}

/* ── Context range ── */
.facet-range {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.facet-range-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 0.72rem;
  font-family: inherit;
  box-sizing: border-box;
  outline: none;
}

.facet-range-input:focus {
  border-color: var(--accent);
}

.facet-range-sep {
  font-size: 0.65rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.facet-range-presets {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.preset-btn {
  padding: 3px 8px;
  font-size: 0.62rem;
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  font-family: inherit;
}

.preset-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Results ── */
.catalog-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.catalog-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.catalog-empty .clear-all-btn {
  margin-top: 12px;
}

/* ── Glass card ── */
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border-light);
  border-radius: var(--radius-md);
}

@media (max-width: 768px) {
  .catalog-page {
    padding: 12px;
  }

  .facet-panel {
    padding: 12px;
  }

  .facet-grid {
    grid-template-columns: 1fr;
  }
}
</style>
