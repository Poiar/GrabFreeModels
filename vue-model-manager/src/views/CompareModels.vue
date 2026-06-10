<template>
  <div class="cm-page">
    <div class="page-header">
      <h2>Compare Models</h2>
      <p>Select two models to compare side-by-side across capabilities, coverage, rankings, and benchmarks</p>
    </div>

    <!-- Two-column model selectors -->
    <div class="cm-selectors">
      <div class="cm-selector-col">
        <label class="cm-selector-label">Model A</label>
        <ModelDropdown
          v-if="!leftModel"
          :models="availableForLeft"
          :placeholder="'Search for a model...'"
          @select="selectLeft"
        />
        <div v-else class="cm-selected-model">
          <div class="cm-selected-info">
            <span class="cm-selected-name">{{ leftModel.name }}</span>
            <span class="cm-selected-creator">{{ leftModel.creator }}</span>
          </div>
          <button class="cm-remove-btn" @click="clearLeft" title="Remove">&times;</button>
        </div>
      </div>

      <div class="cm-vs">VS</div>

      <div class="cm-selector-col">
        <label class="cm-selector-label">Model B</label>
        <ModelDropdown
          v-if="!rightModel"
          :models="availableForRight"
          :placeholder="'Search for a model...'"
          @select="selectRight"
        />
        <div v-else class="cm-selected-model">
          <div class="cm-selected-info">
            <span class="cm-selected-name">{{ rightModel.name }}</span>
            <span class="cm-selected-creator">{{ rightModel.creator }}</span>
          </div>
          <button class="cm-remove-btn" @click="clearRight" title="Remove">&times;</button>
        </div>
      </div>
    </div>

    <!-- Swap button -->
    <button v-if="leftModel && rightModel" class="cm-swap-btn" @click="swapModels" title="Swap models">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
      Swap
    </button>

    <!-- Empty state -->
    <div v-if="!leftModel && !rightModel" class="cm-empty">
      <div class="cm-empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
          <line x1="12" y1="22" x2="12" y2="15.5" />
          <polyline points="22 8.5 12 15.5 2 8.5" />
        </svg>
      </div>
      <p>Select two models above to compare them</p>
    </div>

    <!-- Comparison content -->
    <template v-if="leftModel && rightModel">
      <!-- Radar chart -->
      <div class="cm-radar-wrap glass-card">
        <h3>Dimension Overview</h3>
        <svg viewBox="0 0 400 400" class="cm-radar-svg">
          <circle v-for="r in 5" :key="r" :cx="200" :cy="200" :r="r * 36" fill="none" stroke="var(--viz-gridline, rgba(255,255,255,0.06))" stroke-width="1" />
          <line v-for="(_a, i) in radarAxes" :key="'al'+i" :x1="200" :y1="200" :x2="200 + Math.cos(radarAngle(i) - Math.PI/2) * 180" :y2="200 + Math.sin(radarAngle(i) - Math.PI/2) * 180" stroke="var(--viz-gridline, rgba(255,255,255,0.06))" stroke-width="1" />
          <text v-for="(axis, i) in radarAxes" :key="'albl'+i" :x="200 + Math.cos(radarAngle(i) - Math.PI/2) * 200" :y="200 + Math.sin(radarAngle(i) - Math.PI/2) * 200" text-anchor="middle" dominant-baseline="central" fill="var(--text-dim)" font-size="8" font-family="Inter, sans-serif" font-weight="600">{{ axis.label }}</text>
          <!-- Left model -->
          <polygon v-if="leftRadarPoints" :points="leftRadarPoints" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="1.5" />
          <!-- Right model -->
          <polygon v-if="rightRadarPoints" :points="rightRadarPoints" fill="var(--green)" fill-opacity="0.12" stroke="var(--green)" stroke-width="1.5" />
          <!-- Dots for left -->
          <circle v-for="(pt, i) in leftRadarCoords" :key="'lpt'+i" :cx="pt.x" :cy="pt.y" r="3" fill="var(--accent)" />
          <!-- Dots for right -->
          <circle v-for="(pt, i) in rightRadarCoords" :key="'rpt'+i" :cx="pt.x" :cy="pt.y" r="3" fill="var(--green)" />
        </svg>
        <div class="cm-radar-legend">
          <span class="cm-legend-item"><span class="legend-dot" style="background:var(--accent)"></span>{{ leftModel.name }}</span>
          <span class="cm-legend-item"><span class="legend-dot" style="background:var(--green)"></span>{{ rightModel.name }}</span>
        </div>
      </div>

      <!-- Comparison table -->
      <div class="cm-table-wrap">
        <table class="cm-table">
          <thead>
            <tr>
              <th class="cm-th-dim">Dimension</th>
              <th class="cm-th-val cm-th-a">{{ leftModel.name }}</th>
              <th class="cm-th-val cm-th-b">{{ rightModel.name }}</th>
            </tr>
          </thead>
          <tbody>
            <!-- Overview section -->
            <tr class="cm-section-row"><td colspan="3">Overview</td></tr>
            <tr><td class="cm-dim">Creator</td><td>{{ leftModel.creator || '—' }}</td><td>{{ rightModel.creator || '—' }}</td></tr>
            <tr><td class="cm-dim">Family</td><td>{{ leftModel.family || '—' }}</td><td>{{ rightModel.family || '—' }}</td></tr>
            <tr><td class="cm-dim">Base Model</td><td>{{ leftModel.base_model || '—' }}</td><td>{{ rightModel.base_model || '—' }}</td></tr>

            <!-- Capabilities section -->
            <tr class="cm-section-row"><td colspan="3">Capabilities</td></tr>
            <tr><td class="cm-dim">Best Context</td><td>{{ formatContext(leftModel.best_context) }}</td><td>{{ formatContext(rightModel.best_context) }}</td></tr>
            <tr><td class="cm-dim">Tools</td><td>{{ formatYesNo(anyProvider(leftModel, 'supports_tools')) }}</td><td>{{ formatYesNo(anyProvider(rightModel, 'supports_tools')) }}</td></tr>
            <tr><td class="cm-dim">Reasoning</td><td>{{ formatYesNo(anyProvider(leftModel, 'supports_reasoning')) }}</td><td>{{ formatYesNo(anyProvider(rightModel, 'supports_reasoning')) }}</td></tr>
            <tr><td class="cm-dim">Structured Output</td><td>{{ formatYesNo(anyProvider(leftModel, 'supports_structured_output')) }}</td><td>{{ formatYesNo(anyProvider(rightModel, 'supports_structured_output')) }}</td></tr>
            <tr><td class="cm-dim">Attachments</td><td>{{ formatYesNo(anyProvider(leftModel, 'supports_attachment')) }}</td><td>{{ formatYesNo(anyProvider(rightModel, 'supports_attachment')) }}</td></tr>
            <tr><td class="cm-dim">Open Weights</td><td>{{ formatYesNo(anyProvider(leftModel, 'open_weights')) }}</td><td>{{ formatYesNo(anyProvider(rightModel, 'open_weights')) }}</td></tr>

            <!-- Input/Output Types -->
            <tr><td class="cm-dim">Input Types</td><td>{{ formatTypes(inputTypes(leftModel)) }}</td><td>{{ formatTypes(inputTypes(rightModel)) }}</td></tr>
            <tr><td class="cm-dim">Output Types</td><td>{{ formatTypes(outputTypes(leftModel)) }}</td><td>{{ formatTypes(outputTypes(rightModel)) }}</td></tr>

            <!-- Coverage section -->
            <tr class="cm-section-row"><td colspan="3">Coverage</td></tr>
            <tr><td class="cm-dim">Provider Count</td><td>{{ activeProviders(leftModel).length }}</td><td>{{ activeProviders(rightModel).length }}</td></tr>
            <tr><td class="cm-dim">Data Points</td><td>{{ activeProviders(leftModel).length }}</td><td>{{ activeProviders(rightModel).length }}</td></tr>

            <!-- best_for tags -->
            <tr v-if="leftModel.best_for.length || rightModel.best_for.length"><td class="cm-dim">Best For</td>
              <td><span v-for="tag in leftModel.best_for" :key="tag" class="cm-tag">{{ tag }}</span><span v-if="!leftModel.best_for.length" class="cm-na">—</span></td>
              <td><span v-for="tag in rightModel.best_for" :key="tag" class="cm-tag">{{ tag }}</span><span v-if="!rightModel.best_for.length" class="cm-na">—</span></td>
            </tr>

            <!-- Rankings section -->
            <tr class="cm-section-row"><td colspan="3">Role Rankings</td></tr>
            <tr v-for="role in roleKeys" :key="role">
              <td class="cm-dim">{{ formatRoleLabel(role) }}</td>
              <td><RankingBadge :rank="leftModel.role_rankings[role]" /></td>
              <td><RankingBadge :rank="rightModel.role_rankings[role]" /></td>
            </tr>

            <!-- Benchmark scores -->
            <tr class="cm-section-row" v-if="hasScores"><td colspan="3">Benchmark Scores</td></tr>
            <tr v-for="(score, idx) in mergedScores" :key="idx">
              <td class="cm-dim">{{ score.label }}</td>
              <td>{{ score.left !== null ? score.left : '—' }}</td>
              <td>{{ score.right !== null ? score.right : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Provider breakdown -->
      <div class="cm-breakdowns">
        <div class="cm-breakdown-col">
          <h4>{{ leftModel.name }} — Providers</h4>
          <div v-if="activeProviders(leftModel).length === 0" class="cm-no-providers">No active providers</div>
          <div v-for="dp in sortedProviders(leftModel)" :key="dp.full_id" class="cm-provider-row">
            <div class="cm-provider-name">
              <span class="provider-status-dot" :class="dp.status.result"></span>
              {{ dp.provider }}
            </div>
            <div class="cm-provider-detail">{{ formatContext(dp.context_length) }} ctx</div>
            <div class="cm-provider-detail">{{ dp.supports_tools ? 'Tools' : '' }}{{ dp.supports_tools && dp.supports_reasoning ? ' · ' : '' }}{{ dp.supports_reasoning ? 'Reasoning' : '' }}</div>
          </div>
        </div>
        <div class="cm-breakdown-col">
          <h4>{{ rightModel.name }} — Providers</h4>
          <div v-if="activeProviders(rightModel).length === 0" class="cm-no-providers">No active providers</div>
          <div v-for="dp in sortedProviders(rightModel)" :key="dp.full_id" class="cm-provider-row">
            <div class="cm-provider-name">
              <span class="provider-status-dot" :class="dp.status.result"></span>
              {{ dp.provider }}
            </div>
            <div class="cm-provider-detail">{{ formatContext(dp.context_length) }} ctx</div>
            <div class="cm-provider-detail">{{ dp.supports_tools ? 'Tools' : '' }}{{ dp.supports_tools && dp.supports_reasoning ? ' · ' : '' }}{{ dp.supports_reasoning ? 'Reasoning' : '' }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useModelsStore } from '@/store/models';
import type { ModelData, ProviderDatapoint } from '@/types';
import ModelDropdown from '@/components/ModelDropdown.vue';
import RankingBadge from '@/components/RankingBadge.vue';

const route = useRoute();
const router = useRouter();
const store = useModelsStore();

// ── URL-serialized state ──
const leftSlug = ref<string | null>(null);
const rightSlug = ref<string | null>(null);

function syncFromRoute() {
  const l = route.query.left;
  const r = route.query.right;
  leftSlug.value = typeof l === 'string' ? l : null;
  rightSlug.value = typeof r === 'string' ? r : null;
}
syncFromRoute();

watch(() => route.query, syncFromRoute, { deep: true });

function syncToRoute() {
  const q: Record<string, string> = {};
  if (leftSlug.value) q.left = leftSlug.value;
  if (rightSlug.value) q.right = rightSlug.value;
  router.replace({ query: Object.keys(q).length ? q : {} });
}

// ── Model resolution ──
const allModelsList = computed(() => store.allModels);

const leftModel = computed(() => {
  if (!leftSlug.value) return null;
  return store.modelBySlug.get(leftSlug.value) ?? null;
});

const rightModel = computed(() => {
  if (!rightSlug.value) return null;
  return store.modelBySlug.get(rightSlug.value) ?? null;
});

const availableForLeft = computed(() => {
  return rightSlug.value
    ? allModelsList.value.filter(m => m.slug !== rightSlug.value)
    : allModelsList.value;
});

const availableForRight = computed(() => {
  return leftSlug.value
    ? allModelsList.value.filter(m => m.slug !== leftSlug.value)
    : allModelsList.value;
});

function selectLeft(model: ModelData) {
  leftSlug.value = model.slug;
  syncToRoute();
}
function selectRight(model: ModelData) {
  rightSlug.value = model.slug;
  syncToRoute();
}
function clearLeft() {
  leftSlug.value = null;
  syncToRoute();
}
function clearRight() {
  rightSlug.value = null;
  syncToRoute();
}
function swapModels() {
  const tmp = leftSlug.value;
  leftSlug.value = rightSlug.value;
  rightSlug.value = tmp;
  syncToRoute();
}

// ── Data helpers ──
function activeProviders(model: ModelData): ProviderDatapoint[] {
  return model.providers.filter(p => !p._removed);
}

function sortedProviders(model: ModelData): ProviderDatapoint[] {
  return [...activeProviders(model)].sort((a, b) => a.provider.localeCompare(b.provider));
}

function anyProvider(model: ModelData, field: keyof ProviderDatapoint): boolean {
  return activeProviders(model).some(p => p[field] === true);
}

function inputTypes(model: ModelData): string[] {
  const set = new Set<string>();
  for (const dp of activeProviders(model)) {
    for (const t of dp.input_types) set.add(t);
  }
  return [...set].sort();
}

function outputTypes(model: ModelData): string[] {
  const set = new Set<string>();
  for (const dp of activeProviders(model)) {
    for (const t of dp.output_types) set.add(t);
  }
  return [...set].sort();
}

// ── Formatting ──
function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

function formatYesNo(val: boolean): string {
  return val ? 'Yes' : 'No';
}

function formatTypes(types: string[]): string {
  if (!types.length) return '—';
  return types.map(t => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ');
}

// ── Role rankings ──
const roleKeys = ['model', 'build', 'general', 'small_model', 'explore'] as const;

function formatRoleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Benchmark scores ──
const hasScores = computed(() => {
  return store.modelScores && Object.keys(store.modelScores.scores).length > 0;
});

const mergedScores = computed(() => {
  const ms = store.modelScores;
  if (!ms) return [];
  const allKeys = new Set<string>();
  if (leftSlug.value && ms.scores[leftSlug.value]) {
    for (const s of ms.scores[leftSlug.value]) allKeys.add(`${s.source}/${s.score_type}`);
  }
  if (rightSlug.value && ms.scores[rightSlug.value]) {
    for (const s of ms.scores[rightSlug.value]) allKeys.add(`${s.source}/${s.score_type}`);
  }
  const result: { label: string; source: string; left: string | null; right: string | null }[] = [];
  const leftScores = leftSlug.value ? ms.scores[leftSlug.value] ?? [] : [];
  const rightScores = rightSlug.value ? ms.scores[rightSlug.value] ?? [] : [];
  const leftMap = new Map(leftScores.map(s => [`${s.source}/${s.score_type}`, s]));
  const rightMap = new Map(rightScores.map(s => [`${s.source}/${s.score_type}`, s]));
  for (const key of allKeys) {
    const l = leftMap.get(key);
    const r = rightMap.get(key);
    result.push({
      label: key.replace(/^[^/]+\//, ''),
      source: key.split('/')[0],
      left: l?.score_value !== null && l?.score_value !== undefined ? String(Number(l.score_value).toFixed(2)) : null,
      right: r?.score_value !== null && r?.score_value !== undefined ? String(Number(r.score_value).toFixed(2)) : null,
    });
  }
  return result;
});

// ── Radar chart ──
const radarAxes = [
  { key: 'context', label: 'Context' },
  { key: 'tools', label: 'Tools' },
  { key: 'reasoning', label: 'Reasoning' },
  { key: 'output', label: 'Output' },
  { key: 'providers', label: 'Providers' },
  { key: 'ranking', label: 'Ranking' },
];

function radarAngle(i: number): number {
  return (i / radarAxes.length) * Math.PI * 2;
}

function getRadarValue(model: ModelData, key: string): number {
  const dps = activeProviders(model);
  switch (key) {
    case 'context': {
      const ctx = model.best_context ?? 0;
      return Math.min(1, Math.log2(Math.max(ctx, 1024)) / Math.log2(1048576));
    }
    case 'tools':
      return dps.some(p => p.supports_tools) ? 1 : 0;
    case 'reasoning':
      return dps.some(p => p.supports_reasoning) ? 1 : 0;
    case 'output': {
      const maxOut = Math.max(...dps.map(p => p.output_limit ?? 0));
      return Math.min(1, maxOut / 65536);
    }
    case 'providers':
      return Math.min(1, dps.length / 10);
    case 'ranking': {
      const ranks = Object.values(model.role_rankings);
      if (!ranks.length) return 0;
      const bestRank = Math.min(...ranks);
      return Math.max(0, 1 - (bestRank - 1) / 30);
    }
    default:
      return 0;
  }
}

function polygonPoints(model: ModelData): string {
  return radarAxes
    .map((axis, i) => {
      const val = getRadarValue(model, axis.key);
      const r = val * 180;
      const x = 200 + Math.cos(radarAngle(i) - Math.PI / 2) * r;
      const y = 200 + Math.sin(radarAngle(i) - Math.PI / 2) * r;
      return `${x},${y}`;
    })
    .join(' ');
}

const leftRadarPoints = computed(() => leftModel.value ? polygonPoints(leftModel.value) : null);
const rightRadarPoints = computed(() => rightModel.value ? polygonPoints(rightModel.value) : null);

const leftRadarCoords = computed(() => {
  if (!leftModel.value) return [];
  return radarAxes.map((axis, i) => {
    const val = getRadarValue(leftModel.value!, axis.key);
    const r = val * 180;
    return {
      x: 200 + Math.cos(radarAngle(i) - Math.PI / 2) * r,
      y: 200 + Math.sin(radarAngle(i) - Math.PI / 2) * r,
    };
  });
});

const rightRadarCoords = computed(() => {
  if (!rightModel.value) return [];
  return radarAxes.map((axis, i) => {
    const val = getRadarValue(rightModel.value!, axis.key);
    const r = val * 180;
    return {
      x: 200 + Math.cos(radarAngle(i) - Math.PI / 2) * r,
      y: 200 + Math.sin(radarAngle(i) - Math.PI / 2) * r,
    };
  });
});
</script>

<style scoped>
.cm-page {
  max-width: 1100px;
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
  margin: 0 0 24px;
}

/* ── Selectors ── */
.cm-selectors {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.cm-selector-col {
  flex: 1;
  min-width: 0;
}

.cm-selector-label {
  display: block;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.cm-vs {
  padding: 28px 8px 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
  flex-shrink: 0;
}

.cm-selected-model {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--depth-2, var(--bg-elevated));
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
}

.cm-selected-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cm-selected-name {
  font-weight: 600;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cm-selected-creator {
  font-size: 0.65rem;
  color: var(--text-muted);
}

.cm-remove-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0 0 0 8px;
  flex-shrink: 0;
  line-height: 1;
}

.cm-remove-btn:hover {
  color: var(--red);
}

.cm-swap-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  margin-bottom: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}

.cm-swap-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Empty state ── */
.cm-empty {
  text-align: center;
  padding: 60px 24px;
  color: var(--text-muted);
}

.cm-empty-icon {
  margin-bottom: 12px;
}

.cm-empty p {
  font-size: 0.85rem;
}

/* ── Radar ── */
.cm-radar-wrap {
  padding: 20px 24px;
  margin-bottom: 24px;
  text-align: center;
}

.cm-radar-wrap h3 {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0 0 16px;
  text-align: left;
}

.cm-radar-svg {
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
  display: block;
}

.cm-radar-legend {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 12px;
}

.cm-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 500;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── Comparison table ── */
.cm-table-wrap {
  margin-bottom: 24px;
  overflow-x: auto;
}

.cm-table {
  width: 100%;
  font-size: 0.78rem;
  border-collapse: collapse;
}

.cm-table th,
.cm-table td {
  padding: 7px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border-light);
}

.cm-th-dim {
  width: 30%;
  color: var(--text-dim);
  font-weight: 600;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cm-th-val {
  width: 35%;
  font-weight: 700;
  font-size: 0.72rem;
}

.cm-th-a {
  color: #6380f7;
}

.cm-th-b {
  color: #34d399;
}

.cm-dim {
  color: var(--text-dim);
  font-weight: 500;
  white-space: nowrap;
}

.cm-section-row td {
  background: var(--bg-hover);
  font-weight: 700;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 6px 14px;
}

.cm-tag {
  display: inline-block;
  padding: 1px 8px;
  margin: 1px 3px 1px 0;
  font-size: 0.65rem;
  font-weight: 500;
  background: var(--accent-subtle);
  color: var(--accent);
  border-radius: 4px;
}

.cm-na {
  color: var(--text-dim);
  font-style: italic;
}

/* ── Provider breakdown ── */
.cm-breakdowns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.cm-breakdown-col h4 {
  font-size: 0.8rem;
  font-weight: 700;
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-light);
}

.cm-no-providers {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-style: italic;
  padding: 12px 0;
}

.cm-provider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-light);
  font-size: 0.72rem;
}

.cm-provider-row:last-child {
  border-bottom: none;
}

.cm-provider-name {
  flex: 1;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.provider-status-dot.working {
  background: var(--green);
  box-shadow: 0 0 4px var(--green-glow);
}

.provider-status-dot.broken,
.provider-status-dot.not_found {
  background: var(--red);
  box-shadow: 0 0 4px var(--red-glow);
}

.provider-status-dot.rate_limited {
  background: var(--orange);
  box-shadow: 0 0 4px var(--orange-glow);
}

.provider-status-dot.untested {
  background: var(--text-muted);
  opacity: 0.4;
}

.cm-provider-detail {
  color: var(--text-muted);
  flex-shrink: 0;
  font-size: 0.68rem;
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
  .cm-page {
    padding: 12px;
  }

  .cm-selectors {
    flex-direction: column;
  }

  .cm-vs {
    align-self: center;
    padding: 4px 0;
  }

  .cm-breakdowns {
    grid-template-columns: 1fr;
  }
}
</style>
