<template>
  <div class="compare-page">
    <div class="page-header">
      <h2>Model Comparison</h2>
      <p>Select models and compare across key dimensions</p>
    </div>

    <!-- Model selector -->
    <div class="compare-selector">
      <div
        v-for="(slot, idx) in slots"
        :key="idx"
        class="compare-slot"
        :class="{ filled: slot.model, active: slot.model && activeSlot === idx }"
        @click="activeSlot = idx"
      >
        <template v-if="slot.model">
          <span class="slot-name">{{ slot.model.name }}</span>
          <button class="slot-remove" @click.stop="removeModel(idx)" aria-label="Remove model">&times;</button>
        </template>
        <template v-else>
          <span class="slot-empty">+ Add model {{ idx + 1 }}</span>
        </template>
      </div>
    </div>

    <!-- Search (when slot active) -->
    <div v-if="activeSlot !== null && !slots[activeSlot].model" class="compare-search">
      <input
        ref="searchInput"
        v-model="searchQuery"
        type="text"
        placeholder="Search models by name..."
        class="cp-search-input"
        @keydown.escape="activeSlot = null"
        @focus="isSearchFocused = true"
        @blur="onSearchBlur"
      />
      <div v-if="isSearchFocused" class="cp-search-results">
        <div
          v-for="m in searchResults"
          :key="m.super_id"
          class="cp-search-item"
          @mousedown.prevent
          @click="selectModel(m)"
        >
          <span class="cpsi-name">{{ m.name }}</span>
          <span class="cpsi-creator">{{ m.providers[0]?.provider ?? '' }}</span>
        </div>
        <div v-if="searchResults.length === 0" class="cp-search-empty">No models found</div>
      </div>
    </div>

    <!-- Radar chart -->
    <div v-if="selectedModels.length >= 1" class="radar-container glass-card">
      <div class="radar-header">
        <h3>Dimension Comparison</h3>
        <div class="radar-legend">
          <div
            v-for="(model, idx) in selectedModels"
            :key="model.super_id"
            class="radar-legend-item"
            :class="{ dimmed: hoveredModel !== null && hoveredModel !== model.super_id }"
            @mouseenter="hoveredModel = model.super_id"
            @mouseleave="hoveredModel = null"
          >
            <span class="legend-dot" :style="{ background: modelColors[idx] }"></span>
            <span>{{ model.name }}</span>
          </div>
        </div>
      </div>
      <svg viewBox="0 0 400 400" class="radar-svg">
        <!-- Grid rings -->
        <circle v-for="r in 5" :key="r" :cx="cx" :cy="cy" :r="r * 40" fill="none" stroke="var(--viz-gridline, rgba(255,255,255,0.06))" stroke-width="1" />
        <!-- Axis lines -->
        <line v-for="(_a, i) in axes" :key="'al'+i" :x1="cx" :y1="cy" :x2="cx + Math.cos(angle(i) - Math.PI/2) * 200" :y2="cy + Math.sin(angle(i) - Math.PI/2) * 200" stroke="var(--viz-gridline, rgba(255,255,255,0.06))" stroke-width="1" />
        <!-- Axis labels -->
        <text
          v-for="(axis, i) in axes"
          :key="'albl'+i"
          :x="cx + Math.cos(angle(i) - Math.PI/2) * 220"
          :y="cy + Math.sin(angle(i) - Math.PI/2) * 220"
          text-anchor="middle"
          dominant-baseline="central"
          fill="var(--text-dim)"
          font-size="9"
          font-family="Inter, sans-serif"
          font-weight="600"
        >{{ axis.label }}</text>
        <!-- Polygons per model -->
        <polygon
          v-for="(model, mi) in selectedModels"
          :key="'poly'+model.super_id"
          :points="polygonPoints(mi)"
          :fill="modelColors[mi]"
          fill-opacity="0.12"
          :stroke="modelColors[mi]"
          stroke-width="1.5"
          :class="{ 'poly-dimmed': hoveredModel !== null && hoveredModel !== model.super_id }"
          :style="{ transition: 'all 0.3s var(--ease-emphasis)' }"
        />
        <!-- Data points -->
        <circle
          v-for="(pt, pti) in allPoints.flatMap((pts, mi) => pts.map((p, ai) => ({ cx: p.x, cy: p.y, mi, ai })))"
          :key="'pt'+pti"
          :cx="pt.cx"
          :cy="pt.cy"
          r="3"
          :fill="modelColors[pt.mi]"
          :opacity="hoveredModel !== null && hoveredModel !== selectedModels[pt.mi].super_id ? 0.3 : 1"
          style="transition: opacity 0.2s"
        />
      </svg>

      <!-- Detailed comparison table -->
      <div v-if="selectedModels.length >= 2" class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th>Dimension</th>
              <th v-for="(model, idx) in selectedModels" :key="model.super_id" :style="{ color: modelColors[idx] }">
                {{ model.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="axis in axes" :key="axis.key">
              <td class="ctd-label">{{ axis.label }}</td>
              <td v-for="model in selectedModels" :key="model.super_id" class="ctd-value">
                {{ formatAxisValue(axis.key, getModelAxisValue(model, axis.key)) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="compare-empty">
      <div class="empty-icon">📊</div>
      <p>Select models above to compare them across dimensions</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useModelsStore } from '@/store/models';
import type { ModelData } from '@/types';

const store = useModelsStore();

const MAX_SLOTS = 5;
const slots = ref<{ model: ModelData | null }[]>(Array.from({ length: MAX_SLOTS }, () => ({ model: null })));
const activeSlot = ref<number | null>(null);
const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const isSearchFocused = ref(false);
const hoveredModel = ref<number | null>(null);

const modelColors = ['#6380f7', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

const selectedModels = computed(() => slots.value.filter((s) => s.model).map((s) => s.model!));

const allModelsList = computed(() => store.allModels);

const searchResults = computed(() => {
  const q = searchQuery.value.toLowerCase();
  const alreadySelected = new Set(selectedModels.value.map((m) => m.super_id));
  return allModelsList.value
    .filter((m) => !alreadySelected.has(m.super_id) && m.name.toLowerCase().includes(q))
    .slice(0, 50);
});

interface Axis {
  key: string;
  label: string;
}

const axes: Axis[] = [
  { key: 'context', label: 'Context' },
  { key: 'tools', label: 'Tools' },
  { key: 'reasoning', label: 'Reasoning' },
  { key: 'output', label: 'Output' },
  { key: 'ranking', label: 'Score' },
  { key: 'providers', label: 'Providers' },
];

const cx = 200;
const cy = 200;

function angle(i: number): number {
  return (i / axes.length) * Math.PI * 2;
}

function getModelAxisValue(model: ModelData, axisKey: string): number {
  const dps = model.providers.filter((p) => !p._removed);
  switch (axisKey) {
    case 'context': {
      const ctx = model.best_context ?? 0;
      return Math.min(1, Math.log2(Math.max(ctx, 1024)) / Math.log2(1048576));
    }
    case 'tools':
      return dps.some((p) => p.supports_tools) ? 1 : 0;
    case 'reasoning':
      return dps.some((p) => p.supports_reasoning) ? 1 : 0;
    case 'output': {
      const maxOut = Math.max(...dps.map((p) => p.output_limit ?? 0));
      return Math.min(1, maxOut / 32768);
    }
    case 'ranking': {
      const ranks = Object.values(model.role_rankings);
      if (!ranks.length) return 0;
      const bestRank = Math.min(...ranks);
      return Math.max(0, 1 - (bestRank - 1) / 30);
    }
    case 'providers':
      return Math.min(1, dps.length / 10);
    default:
      return 0;
  }
}

function polygonPoints(modelIdx: number): string {
  const model = selectedModels.value[modelIdx];
  if (!model) return '';
  return axes
    .map((axis, i) => {
      const val = getModelAxisValue(model, axis.key);
      const r = val * 200;
      const x = cx + Math.cos(angle(i) - Math.PI / 2) * r;
      const y = cy + Math.sin(angle(i) - Math.PI / 2) * r;
      return `${x},${y}`;
    })
    .join(' ');
}

const allPoints = computed(() =>
  selectedModels.value.map((model) =>
    axes.map((axis) => {
      const val = getModelAxisValue(model, axis.key);
      const r = val * 200;
      return {
        x: cx + Math.cos(angle(axes.indexOf(axis)) - Math.PI / 2) * r,
        y: cy + Math.sin(angle(axes.indexOf(axis)) - Math.PI / 2) * r,
      };
    }),
  ),
);

function formatAxisValue(key: string, val: number): string {
  switch (key) {
    case 'context':
      return `${Math.round(val * 100)}%`;
    case 'tools':
      return val > 0.5 ? 'Yes' : 'No';
    case 'reasoning':
      return val > 0.5 ? 'Yes' : 'No';
    case 'output':
      return `${Math.round(val * 100)}%`;
    case 'ranking':
      return `${Math.round(val * 100)}%`;
    case 'providers':
      return `${Math.round(val * 100)}%`;
    default:
      return String(val);
  }
}

function onSearchBlur() {
  // Delay so mousedown on a result item fires before we hide the dropdown
  setTimeout(() => {
    isSearchFocused.value = false;
  }, 150);
}

function selectModel(model: ModelData) {
  if (activeSlot.value === null) return;
  slots.value[activeSlot.value].model = model;
  searchQuery.value = '';
  activeSlot.value = null;
}

function removeModel(idx: number) {
  slots.value[idx].model = null;
}

watch(activeSlot, (val) => {
  if (val !== null && !slots.value[val].model) {
    nextTick(() => searchInput.value?.focus());
  }
});
</script>

<style scoped>
.compare-page {
  max-width: 900px;
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
  margin: 0 0 20px;
}

/* Slots */
.compare-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.compare-slot {
  flex: 1;
  min-width: 120px;
  padding: 10px 14px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--depth-2, var(--bg-elevated));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all var(--dur-micro, 150ms);
  font-size: 0.78rem;
}

.compare-slot:hover {
  border-color: var(--accent);
}

.compare-slot.filled {
  border-style: solid;
  border-color: var(--border-depth-1);
  background: var(--depth-3, var(--bg-card));
}

.compare-slot.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.slot-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot-empty {
  color: var(--text-muted);
}

.slot-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1rem;
  padding: 0 0 0 8px;
  flex-shrink: 0;
}

.slot-remove:hover {
  color: var(--red);
}

/* Search */
.compare-search {
  position: relative;
  margin-bottom: 20px;
}

.cp-search-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--depth-2, var(--bg-elevated));
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 0.82rem;
  font-family: inherit;
  outline: none;
}

.cp-search-results {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 50;
  background: var(--depth-3, var(--bg-card));
  border: 1px solid var(--border-depth-1);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  max-height: 240px;
  overflow-y: auto;
  box-shadow: var(--shadow-elevation-3);
}

.cp-search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.1s;
}

.cp-search-item:hover {
  background: var(--bg-hover);
}

.cpsi-name {
  font-weight: 600;
  font-size: 0.8rem;
}

.cpsi-creator {
  font-size: 0.65rem;
  color: var(--text-muted);
}

.cp-search-empty {
  padding: 14px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.75rem;
}

/* Radar */
.radar-container {
  padding: 20px 24px;
  margin-bottom: 24px;
}

.radar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.radar-header h3 {
  font-size: 0.95rem;
  font-weight: 700;
}

.radar-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.radar-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.radar-legend-item.dimmed {
  opacity: 0.35;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.radar-svg {
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  display: block;
}

.poly-dimmed {
  opacity: 0.15;
}

/* Comparison table */
.compare-table-wrap {
  margin-top: 20px;
  overflow-x: auto;
}

.compare-table {
  width: 100%;
  font-size: 0.78rem;
  border-collapse: collapse;
}

.compare-table th,
.compare-table td {
  padding: 8px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border-light);
}

.compare-table th {
  font-weight: 700;
  font-size: 0.72rem;
}

.ctd-label {
  color: var(--text-dim);
  font-weight: 500;
}

.ctd-value {
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
}

/* Empty */
.compare-empty {
  text-align: center;
  padding: 60px 24px;
  color: var(--text-muted);
}

.compare-empty .empty-icon {
  font-size: 2.5rem;
  margin-bottom: 8px;
}

.compare-empty p {
  font-size: 0.85rem;
}

/* Glass card */
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border-light);
  border-radius: var(--radius-md);
}

@media (max-width: 768px) {
  .compare-page {
    padding: 12px;
  }
  .compare-selector {
    flex-direction: column;
  }
  .radar-header {
    flex-direction: column;
  }
}
</style>
