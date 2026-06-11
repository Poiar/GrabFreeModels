<template>
  <div class="catalog-page">
    <div class="page-header">
      <h2>Advanced Search</h2>
    </div>

    <!-- ═══ JQL Filter Bar ═══ -->
    <div class="jql-bar">
      <!-- Search row -->
      <div class="jql-input-row">
        <svg class="jql-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="jql-input"
          placeholder="Search models, families, providers..."
          @focus="showSuggestions = true"
          @blur="hideSuggestionsDelayed"
          @keydown.escape="showSuggestions = false"
        />
        <button v-if="searchQuery" class="jql-clear" @click="searchQuery = ''" title="Clear search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <button v-if="activeChips.length > 0" class="qb-action-btn" @click="saveCurrentSearch">Save</button>
        <button v-if="activeChips.length > 0" class="qb-cond-clear" @click="clearAllFilters">Clear all</button>
      </div>

      <!-- Search suggestions dropdown -->
      <div v-if="showSuggestions && searchQuery.trim()" class="jql-suggestions">
        <template v-for="group in suggestionGroups" :key="group.label">
          <div v-if="group.items.length > 0" style="padding:4px 12px 2px;font-size:0.62rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;">{{ group.label }}</div>
          <div
            v-for="item in group.items"
            :key="`${group.label}-${item.value}`"
            class="jql-suggestion"
            @mousedown.prevent="applySuggestion(group.category, item)"
          >
            <span class="jql-sugg-label">{{ item.label }}</span>
            <span class="jql-sugg-insert">+ add filter</span>
          </div>
        </template>
        <div v-if="!hasAnySuggestions" class="jql-suggestion" style="color:var(--text-muted);cursor:default;">
          <span class="jql-sugg-label">Search for "{{ searchQuery.trim() }}" across all fields</span>
        </div>
      </div>

      <!-- Active filter chips -->
      <div class="jql-chips">
        <span
          v-for="chip in activeChips"
          :key="chip.id"
          class="jql-chip"
          @click="removeChip(chip)"
          :title="`Remove ${chip.category}: ${chip.label}`"
        >
          <span class="qb-cond-field">{{ chip.category }}:</span>
          <span class="jql-chip-label">{{ chip.label }}</span>
          <span class="jql-chip-remove">×</span>
        </span>
      </div>

      <!-- Builder row: filter pickers + quick toggles -->
      <div class="qb-builder">
        <div class="qb-builder-row">
          <span class="qb-builder-label">Add filter</span>

          <!-- Family picker -->
          <div class="filter-picker" :class="{ open: openPicker === 'family' }">
            <button class="qb-select qb-field" @click.stop="togglePicker('family')">
              Family <span class="qb-cond-op">{{ selectedFamilies.size || '' }}</span>
            </button>
            <div v-if="openPicker === 'family'" class="picker-dropdown" @click.stop>
              <div class="ss-search-wrap">
                <input v-model="familySearch" type="text" class="ss-search" placeholder="Search families..." @keydown.esc="openPicker = null" />
              </div>
              <div class="ss-list">
                <label v-for="f in filteredFamilyOptions" :key="f" class="ss-opt" :class="{ selected: selectedFamilies.has(f) }" @click="toggleFamily(f)">
                  <span v-if="selectedFamilies.has(f)" class="ss-check">&#10003;</span>
                  <span class="ss-opt-label">{{ formatFamily(f) }}</span>
                </label>
                <div v-if="filteredFamilyOptions.length === 0" class="ss-empty">No matches</div>
              </div>
            </div>
          </div>

          <!-- Provider picker -->
          <div class="filter-picker" :class="{ open: openPicker === 'provider' }">
            <button class="qb-select qb-field" @click.stop="togglePicker('provider')">
              Provider <span class="qb-cond-op">{{ selectedProviders.size || '' }}</span>
            </button>
            <div v-if="openPicker === 'provider'" class="picker-dropdown" @click.stop>
              <div class="ss-search-wrap">
                <input v-model="providerSearch" type="text" class="ss-search" placeholder="Search providers..." @keydown.esc="openPicker = null" />
              </div>
              <div class="ss-list">
                <label v-for="p in filteredProviderPickerOptions" :key="p.slug" class="ss-opt" :class="{ selected: selectedProviders.has(p.slug) }" @click="toggleProvider(p.slug)">
                  <span v-if="selectedProviders.has(p.slug)" class="ss-check">&#10003;</span>
                  <span class="ss-opt-label">{{ p.name }}</span>
                </label>
                <div v-if="filteredProviderPickerOptions.length === 0" class="ss-empty">No matches</div>
              </div>
            </div>
          </div>

          <!-- Modality picker -->
          <div class="filter-picker" :class="{ open: openPicker === 'modality' }">
            <button class="qb-select qb-field" @click.stop="togglePicker('modality')">
              Modality <span class="qb-cond-op">{{ selectedModalities.size || '' }}</span>
            </button>
            <div v-if="openPicker === 'modality'" class="picker-dropdown" @click.stop>
              <div class="ss-list">
                <label v-for="m in modalityOptions" :key="m" class="ss-opt" :class="{ selected: selectedModalities.has(m) }" @click="toggleModality(m)">
                  <span v-if="selectedModalities.has(m)" class="ss-check">&#10003;</span>
                  <span class="ss-opt-label">{{ formatModality(m) }}</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Context range picker -->
          <div class="filter-picker" :class="{ open: openPicker === 'context' }">
            <button class="qb-select qb-field" @click.stop="togglePicker('context')">
              Context <span class="qb-cond-op">{{ contextLabel }}</span>
            </button>
            <div v-if="openPicker === 'context'" class="picker-dropdown picker-dropdown-context" @click.stop>
              <div style="padding:8px 10px;">
                <div class="facet-range">
                  <input v-model.number="minContext" type="number" placeholder="Min" class="facet-range-input" min="0" />
                  <span class="facet-range-sep">to</span>
                  <input v-model.number="maxContext" type="number" placeholder="Max" class="facet-range-input" min="0" />
                </div>

              </div>
            </div>
          </div>
        </div>

        <!-- Quick toggles -->
        <div class="qb-builder-row" style="margin-top:8px;">
          <span class="qb-builder-label">Quick</span>
          <div class="qb-toggle">
            <button class="qb-toggle-btn" :class="{ active: toolsOnly }" @click="toolsOnly = !toolsOnly">Tools</button>
            <button class="qb-toggle-btn" :class="{ active: reasoningOnly }" @click="reasoningOnly = !reasoningOnly">Reasoning</button>
            <button class="qb-toggle-btn" :class="{ active: openWeightsOnly }" @click="openWeightsOnly = !openWeightsOnly">Open</button>
          </div>
          <span style="width:8px;"></span>
          <button
            v-for="preset in contextPresets"
            :key="preset.label"
            class="qb-action-btn"
            :class="{ active: minContext === preset.min && maxContext === preset.max }"
            @click="setContextPreset(preset)"
          >{{ preset.label }}</button>
        </div>
      </div>

      <!-- Saved searches dropdown -->
      <div v-if="showSavedPanel" class="qb-dropdown">
        <div class="qb-drop-header">
          Saved Searches
          <button class="qb-drop-clear" @click="clearSavedSearches">Clear all</button>
        </div>
        <div v-if="savedSearches.length === 0" class="qb-drop-empty">No saved searches</div>
        <div
          v-for="s in savedSearches"
          :key="s.id"
          class="qb-drop-item"
          @click="loadSavedSearch(s)"
        >
          <span class="qb-drop-name">{{ s.name }}</span>
          <span class="qb-drop-qry">{{ s.query }}</span>
          <span class="qb-drop-time">{{ formatTime(s.ts) }}</span>
          <button class="qb-drop-del" @click.stop="removeSavedSearch(s.id)">×</button>
        </div>
      </div>
    </div>

    <!-- Result count -->
    <div class="active-filters-bar" style="margin-bottom:12px;">
      <span class="result-count">{{ filteredModels.length }} model{{ filteredModels.length !== 1 ? 's' : '' }}</span>
      <button v-if="showSavedPanel" class="qb-action-btn" @click="showSavedPanel = false" style="margin-left:auto;">Hide saved</button>
      <button v-else-if="savedSearches.length > 0" class="qb-action-btn" @click="showSavedPanel = true" style="margin-left:auto;">Saved ({{ savedSearches.length }})</button>
    </div>

    <!-- Results -->
    <div v-if="filteredModels.length > 0" class="catalog-results">
      <SuperModelCard
        v-for="model in filteredModels"
        :key="model.super_id"
        :model="model"
        @click="openPanel(model)"
        @creator-click="navigateToCreator"
      />
    </div>

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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useModelsStore } from '@/store/models';
import { useSavedSearches } from '@/composables/useSavedSearches';
import type { ModelData, CreatorData } from '@/types';
import type { SavedSearch } from '@/composables/useSavedSearches';
import SuperModelCard from '@/components/SuperModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';

const route = useRoute();
const router = useRouter();
const store = useModelsStore();
const { saved: savedSearches, save, remove: removeSavedSearch, clearHistory: clearSavedSearches } = useSavedSearches();

// ── Search input ──
const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);
const showSuggestions = ref(false);

function hideSuggestionsDelayed() {
  setTimeout(() => { showSuggestions.value = false; }, 150);
}

// ═══ Filter state ═══
const selectedFamilies = ref<Set<string>>(new Set());
const selectedProviders = ref<Set<string>>(new Set());
const selectedModalities = ref<Set<string>>(new Set());
const toolsOnly = ref(false);
const reasoningOnly = ref(false);
const openWeightsOnly = ref(false);
const minContext = ref<number | null>(null);
const maxContext = ref<number | null>(null);

// ── Picker state ──
const openPicker = ref<'family' | 'provider' | 'modality' | 'context' | null>(null);
const familySearch = ref('');
const providerSearch = ref('');
const showSavedPanel = ref(false);

function togglePicker(name: 'family' | 'provider' | 'modality' | 'context') {
  openPicker.value = openPicker.value === name ? null : name;
  if (openPicker.value) {
    familySearch.value = '';
    providerSearch.value = '';
  }
}

// ── Context presets ──
interface ContextPreset { label: string; min: number | null; max: number | null; }
const contextPresets: ContextPreset[] = [
  { label: '8K+', min: 8192, max: null },
  { label: '32K+', min: 32768, max: null },
  { label: '128K+', min: 131072, max: null },
  { label: '1M+', min: 1_000_000, max: null },
];

const contextLabel = computed(() => {
  if (minContext.value !== null && maxContext.value !== null) return `${minContext.value}–${maxContext.value}`;
  if (minContext.value !== null) return `≥${minContext.value}`;
  if (maxContext.value !== null) return `≤${maxContext.value}`;
  return '';
});

// ── Close picker on outside click ──
function onOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.filter-picker') && !target.closest('.jql-suggestions')) {
    openPicker.value = null;
  }
}
onMounted(() => document.addEventListener('mousedown', onOutsideClick));
onUnmounted(() => document.removeEventListener('mousedown', onOutsideClick));

// ═══ URL sync ═══
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

let syncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(syncFiltersToRoute, 300);
}

watch([searchQuery, selectedFamilies, selectedProviders, selectedModalities, toolsOnly, reasoningOnly, openWeightsOnly, minContext, maxContext], scheduleSync, { deep: true });

// ═══ Active filter chips ═══
interface FilterChip {
  id: string;
  category: string;
  label: string;
  remove: () => void;
}

const activeChips = computed<FilterChip[]>(() => {
  const chips: FilterChip[] = [];
  for (const f of selectedFamilies.value) {
    chips.push({ id: `family:${f}`, category: 'family', label: formatFamily(f), remove: () => { const n = new Set(selectedFamilies.value); n.delete(f); selectedFamilies.value = n; } });
  }
  for (const p of selectedProviders.value) {
    const name = store.visibleProviderRefs.find(r => r.slug === p)?.name ?? p;
    chips.push({ id: `provider:${p}`, category: 'provider', label: name, remove: () => { const n = new Set(selectedProviders.value); n.delete(p); selectedProviders.value = n; } });
  }
  for (const m of selectedModalities.value) {
    chips.push({ id: `modality:${m}`, category: 'modality', label: formatModality(m), remove: () => { const n = new Set(selectedModalities.value); n.delete(m); selectedModalities.value = n; } });
  }
  if (toolsOnly.value) {
    chips.push({ id: 'cap:tools', category: 'capability', label: 'Tools', remove: () => { toolsOnly.value = false; } });
  }
  if (reasoningOnly.value) {
    chips.push({ id: 'cap:reasoning', category: 'capability', label: 'Reasoning', remove: () => { reasoningOnly.value = false; } });
  }
  if (openWeightsOnly.value) {
    chips.push({ id: 'cap:open', category: 'capability', label: 'Open Weights', remove: () => { openWeightsOnly.value = false; } });
  }
  if (minContext.value !== null || maxContext.value !== null) {
    chips.push({
      id: 'context-range',
      category: 'context',
      label: contextLabel.value,
      remove: () => { minContext.value = null; maxContext.value = null; },
    });
  }
  return chips;
});

function removeChip(chip: FilterChip) {
  chip.remove();
}

// ═══ Facet options ═══
const familyOptions = computed(() => {
  const families = new Set<string>();
  for (const model of store.allModels) {
    families.add(model.family || 'Uncategorized');
  }
  return [...families].sort((a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b);
  });
});

const filteredFamilyOptions = computed(() => {
  const q = familySearch.value.toLowerCase();
  return familyOptions.value.filter(f => !q || f.toLowerCase().includes(q));
});

const filteredProviderPickerOptions = computed(() => {
  const q = providerSearch.value.toLowerCase();
  return store.visibleProviderRefs.filter(p => !q || p.name.toLowerCase().includes(q));
});

const modalityOptions = ['text', 'image', 'audio'];

// ═══ Search suggestions ═══
interface SuggestionGroup {
  category: string;
  label: string;
  items: { label: string; value: string }[];
}

const suggestionGroups = computed<SuggestionGroup[]>(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return [];

  const familyItems = familyOptions.value
    .filter(f => f.toLowerCase().includes(q) && !selectedFamilies.value.has(f))
    .slice(0, 3)
    .map(f => ({ label: formatFamily(f), value: f }));

  const providerItems = store.visibleProviderRefs
    .filter(p => p.name.toLowerCase().includes(q) && !selectedProviders.value.has(p.slug))
    .slice(0, 3)
    .map(p => ({ label: p.name, value: p.slug }));

  const modalityItems = modalityOptions
    .filter(m => m.toLowerCase().includes(q) && !selectedModalities.value.has(m))
    .map(m => ({ label: formatModality(m), value: m }));

  return [
    { category: 'family', label: 'Families', items: familyItems },
    { category: 'provider', label: 'Providers', items: providerItems },
    { category: 'modality', label: 'Modalities', items: modalityItems },
  ];
});

const hasAnySuggestions = computed(() => suggestionGroups.value.some(g => g.items.length > 0));

function applySuggestion(category: string, item: { label: string; value: string }) {
  switch (category) {
    case 'family': {
      const n = new Set(selectedFamilies.value);
      n.add(item.value);
      selectedFamilies.value = n;
      break;
    }
    case 'provider': {
      const n = new Set(selectedProviders.value);
      n.add(item.value);
      selectedProviders.value = n;
      break;
    }
    case 'modality': {
      const n = new Set(selectedModalities.value);
      n.add(item.value);
      selectedModalities.value = n;
      break;
    }
  }
  showSuggestions.value = false;
  searchQuery.value = '';
  nextTick(() => searchInputRef.value?.focus());
}

// ═══ Filtering logic ═══
const filteredModels = computed(() => {
  let models = store.allModels;

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
    models = models.filter(m => {
      const family = m.family || 'Uncategorized';
      return selectedFamilies.value.has(family);
    });
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
      const allTypes = new Set<string>();
      for (const dp of m.providers) {
        for (const t of dp.input_types) allTypes.add(t);
        for (const t of dp.output_types) allTypes.add(t);
      }
      return [...selectedModalities.value].every(mod => allTypes.has(mod));
    });
  }

  // Capability filters
  if (toolsOnly.value) {
    models = models.filter(m => m.providers.some(p => !p._removed && p.supports_tools));
  }
  if (reasoningOnly.value) {
    models = models.filter(m => m.providers.some(p => !p._removed && p.supports_reasoning));
  }
  if (openWeightsOnly.value) {
    models = models.filter(m => m.providers.some(p => !p._removed && p.open_weights));
  }

  // Context range
  if (minContext.value !== null) {
    models = models.filter(m => m.best_context !== null && m.best_context >= minContext.value!);
  }
  if (maxContext.value !== null) {
    models = models.filter(m => m.best_context !== null && m.best_context <= maxContext.value!);
  }

  return models;
});

// ═══ Toggle helpers ═══
function toggleFamily(f: string) {
  const next = new Set(selectedFamilies.value);
  if (next.has(f)) next.delete(f); else next.add(f);
  selectedFamilies.value = next;
}

function toggleProvider(slug: string) {
  const next = new Set(selectedProviders.value);
  if (next.has(slug)) next.delete(slug); else next.add(slug);
  selectedProviders.value = next;
}

function toggleModality(m: string) {
  const next = new Set(selectedModalities.value);
  if (next.has(m)) next.delete(m); else next.add(m);
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
  selectedFamilies.value = new Set();
  selectedProviders.value = new Set();
  selectedModalities.value = new Set();
  toolsOnly.value = false;
  reasoningOnly.value = false;
  openWeightsOnly.value = false;
  minContext.value = null;
  maxContext.value = null;
  openPicker.value = null;
  syncFiltersToRoute();
}

// ═══ Saved searches ═══
function saveCurrentSearch() {
  const q = new URLSearchParams(window.location.hash.split('?')[1] || '').toString();
  if (!q) return;
  const name = searchQuery.value
    || [...selectedFamilies.value, ...selectedProviders.value].slice(0, 3).join(', ')
    || 'Untitled';
  save(name, q);
}

function loadSavedSearch(s: SavedSearch) {
  const params = new URLSearchParams(s.query);
  const q: Record<string, string> = {};
  for (const [k, v] of params.entries()) q[k] = v;
  router.replace({ query: q });
  showSavedPanel.value = false;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

// ═══ Formatting ═══
function formatFamily(name: string): string {
  if (name === 'Uncategorized') return 'Uncategorized';
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatModality(m: string): string {
  const map: Record<string, string> = { text: 'Text', image: 'Image', audio: 'Audio', video: 'Video' };
  return map[m] || m;
}

// ═══ Detail panel ═══
const detailModel = ref<{ model: ModelData; creator: CreatorData } | null>(null);

function openPanel(model: ModelData) {
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

/* ── Filter picker dropdowns ── */
.filter-picker {
  position: relative;
  flex-shrink: 0;
}

.picker-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 200px;
  max-width: 280px;
  background: var(--bg-card);
  border: 1px solid var(--accent);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  box-shadow: var(--shadow-xl);
  z-index: 200;
  max-height: 240px;
  display: flex;
  flex-direction: column;
  margin-top: -1px;
}

.picker-dropdown-context {
  min-width: 240px;
}

/* ── Context presets active state ── */
.preset-active {
  border-color: var(--accent) !important;
  color: var(--accent) !important;
  background: var(--accent-subtle) !important;
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

/* ── Context range inputs (reused from old facet) ── */
.facet-range {
  display: flex;
  align-items: center;
  gap: 6px;
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

/* ── Result count bar ── */
.active-filters-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.result-count {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.75rem;
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
}

.clear-all-btn:hover {
  border-color: var(--red);
  color: var(--red);
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .catalog-page {
    padding: 12px;
  }

  .qb-builder-row {
    flex-wrap: wrap;
  }

  .picker-dropdown {
    min-width: 180px;
    max-width: 240px;
  }
}
</style>
