<template>
  <div class="bmd-page">
    <div class="page-header">
      <router-link to="/base-models" class="back-link">← Base Models</router-link>
      <h2>{{ baseModelName }}</h2>
      <p class="bmd-subtitle">
        {{ derivatives.length }} derivative{{ derivatives.length !== 1 ? 's' : '' }}
        by {{ derivativeCount }} creator{{ derivativeCount !== 1 ? 's' : '' }}
      </p>

      <!-- Unique-facts chip row -->
      <div class="bmd-facts" v-if="facts.length">
        <span v-for="f in facts" :key="f.label" class="bmd-fact-chip" :class="f.cls">{{ f.label }}</span>
      </div>
    </div>

    <!-- Features row: provider icons, capabilities, best-for, families -->
    <div class="bmd-features-row" v-if="hasFeatures">
      <div class="bmd-provider-icons" v-if="derivativeProviders.length">
        <ProviderIcon
          v-for="p in derivativeProviders"
          :key="p.slug"
          :slug="p.slug"
          :size="18"
          :alt="p.name"
          cls="bmd-prov-icon"
        />
      </div>
      <div class="bmd-caps">
        <span
          v-for="cap in capabilities"
          :key="cap.key"
          class="bmd-cap-badge"
          :class="{ active: cap.has }"
          :title="cap.label"
        >{{ cap.label }}</span>
      </div>
      <div class="bmd-bestfor-tags" v-if="topBestFor.length">
        <span v-for="tag in topBestFor.slice(0, 6)" :key="tag" class="bmd-bestfor">{{ tag }}</span>
      </div>
      <div class="bmd-input-types" v-if="inputTypes.length">
        <span v-for="t in inputTypes" :key="t" class="bmd-input-type">{{ t }}</span>
      </div>
      <div class="bmd-family-tags" v-if="familyList.length">
        <span class="bmd-family-label">Families:</span>
        <span v-for="f in familyList" :key="f" class="bmd-family-tag">{{ f }}</span>
      </div>
    </div>

    <!-- Meta grid -->
    <div class="bmd-meta-grid">
      <div class="bmd-stat">
        <span class="bmd-stat-value">{{ derivatives.length }}</span>
        <span class="bmd-stat-label">Derivatives</span>
      </div>
      <div class="bmd-stat">
        <span class="bmd-stat-value">{{ derivativeCount }}</span>
        <span class="bmd-stat-label">Creators</span>
      </div>
      <div class="bmd-stat">
        <span class="bmd-stat-value">{{ providerCount }}</span>
        <span class="bmd-stat-label">Providers</span>
      </div>
      <div class="bmd-stat">
        <span class="bmd-stat-value">{{ paramRange }}</span>
        <span class="bmd-stat-label">Param range</span>
      </div>
      <div class="bmd-stat">
        <span class="bmd-stat-value">{{ familyCount }}</span>
        <span class="bmd-stat-label">Families</span>
      </div>
      <div class="bmd-stat">
        <span class="bmd-stat-value">{{ workingCount }} / {{ derivatives.length }}</span>
        <span class="bmd-stat-label">Working</span>
      </div>
    </div>

    <!-- Validation bar -->
    <div class="bmd-validation-bar">
      <div class="val-segment working" :style="{ flex: valFlex.working }" :title="valCounts.working + ' working'"></div>
      <div class="val-segment rate_limited" :style="{ flex: valFlex.rate_limited }" :title="valCounts.rate_limited + ' rate limited'"></div>
      <div class="val-segment broken" :style="{ flex: valFlex.broken }" :title="valCounts.broken + ' broken'"></div>
      <div class="val-segment untested" :style="{ flex: valFlex.untested }" :title="valCounts.untested + ' untested'"></div>
    </div>
    <div class="bmd-val-legend">
      <span v-if="valCounts.working" class="val-legend working">{{ valCounts.working }} working</span>
      <span v-if="valCounts.rate_limited" class="val-legend rate_limited">{{ valCounts.rate_limited }} rate limited</span>
      <span v-if="valCounts.broken" class="val-legend broken">{{ valCounts.broken }} broken</span>
      <span v-if="valCounts.untested" class="val-legend untested">{{ valCounts.untested }} untested</span>
    </div>

    <div v-if="derivatives.length === 0" class="bmd-empty">
      <p>No derivatives found for this base model.</p>
    </div>

    <div v-for="[creatorName, { creatorId, models }] in groupedByCreator" :key="creatorName" class="bmd-creator-group">
      <h3 class="bmd-creator-name">
        <router-link :to="isDerivative(creatorId) ? `/derivative/${creatorId}` : `/creator/${creatorId}`" class="bmd-creator-link">
          {{ creatorName }}
        </router-link>
        <span class="bmd-creator-count">{{ models.length }} model{{ models.length !== 1 ? 's' : '' }}</span>
      </h3>
      <div class="bmd-models">
        <SuperModelCard
          v-for="model in models"
          :key="model.slug"
          :model="model"
          :creator-slug="creatorId"
          @click="openDetail(model, creatorId)"
          @creator-click="() => {}"
        />
      </div>
    </div>

    <ModelDetailPanel
      v-if="detailModel && detailCreator"
      :open="!!detailModel"
      :model="detailModel"
      :creator="detailCreator"
      @close="detailModel = null"
      @navigate-to="detailModel = $event.model"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import SuperModelCard from '@/components/SuperModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { useModelsStore } from '@/store/models';
import type { CreatorData, ModelData } from '@/types';

const store = useModelsStore();
const route = useRoute();

const baseModelName = computed(() => decodeURIComponent(route.params.name as string));

const derivatives = computed(() => {
  const results: { creatorName: string; creatorId: string; model: ModelData }[] = [];
  for (const creator of store.creators) {
    for (const model of creator.models) {
      if (model.base_model === baseModelName.value) {
        results.push({ creatorName: creator.name, creatorId: creator.id, model });
      }
    }
  }
  return results;
});

const groupedByCreator = computed(() => {
  const groups: Record<string, { creatorId: string; models: ModelData[] }> = {};
  for (const d of derivatives.value) {
    if (!groups[d.creatorName]) groups[d.creatorName] = { creatorId: d.creatorId, models: [] };
    groups[d.creatorName].models.push(d.model);
  }
  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
});

const derivativeCount = computed(() => new Set(derivatives.value.map((d) => d.creatorName)).size);

function isDerivative(creatorId: string): boolean {
  const c = store.creators.find((cr) => cr.id === creatorId);
  return c ? c.models.some((m) => m.base_model && m.base_model !== m.slug) : false;
}

// ── Unique-facts chips ──
const facts = computed(() => {
  const chips: { label: string; cls: string }[] = [];

  const models = derivatives.value.map(d => d.model);
  if (!models.length) return chips;

  // Parameter range
  const params = new Set<number>();
  for (const m of models) {
    for (const dp of m.providers) {
      if (dp.param_count_b) params.add(dp.param_count_b);
    }
  }
  const paramVals = [...params].sort((a, b) => a - b);
  if (paramVals.length) {
    const min = formatParams(paramVals[0]);
    const max = formatParams(paramVals[paramVals.length - 1]);
    chips.push({ label: min === max ? `${min} params` : `${min} – ${max} params`, cls: 'fact-param' });
  }

  // Context range
  const ctxs = models.map(m => m.best_context).filter((c): c is number => c !== null && c > 0);
  if (ctxs.length) {
    const minCtx = Math.min(...ctxs);
    const maxCtx = Math.max(...ctxs);
    chips.push({ label: minCtx === maxCtx ? formatContext(minCtx) + ' ctx' : formatContext(minCtx) + ' – ' + formatContext(maxCtx) + ' ctx', cls: 'fact-ctx' });
  }

  // Open-weight count
  let openCount = 0;
  let totalWithData = 0;
  for (const m of models) {
    let modelHasOpen = false;
    for (const dp of m.providers) {
      if (dp.open_weights !== null) totalWithData++;
      if (dp.open_weights === true) modelHasOpen = true;
    }
    if (modelHasOpen) openCount++;
  }
  if (totalWithData > 0) {
    chips.push({ label: `${openCount}/${models.length} open`, cls: openCount > models.length / 2 ? 'fact-open' : 'fact-closed' });
  }

  return chips;
});

function formatParams(b: number): string {
  if (b >= 1000) return (b / 1000).toFixed(1).replace(/\.0$/, '') + 'T';
  if (b >= 1) return b.toFixed(1).replace(/\.0$/, '') + 'B';
  return (b * 1000).toFixed(0) + 'M';
}

function formatContext(ctx: number): string {
  if (ctx >= 1_000_000) return (ctx / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  return Math.round(ctx / 1000) + 'K';
}

// ── Provider count across derivatives ──
const providerCount = computed(() => {
  const providers = new Set<string>();
  for (const d of derivatives.value) {
    for (const dp of d.model.providers) {
      if (!dp._removed) providers.add(dp.provider_slug);
    }
  }
  return providers.size;
});

// ── Parameter range for meta grid ──
const paramRange = computed(() => {
  const params = new Set<number>();
  for (const d of derivatives.value) {
    for (const dp of d.model.providers) {
      if (dp.param_count_b) params.add(dp.param_count_b);
    }
  }
  const vals = [...params].sort((a, b) => a - b);
  if (!vals.length) return '—';
  const min = formatParams(vals[0]);
  const max = formatParams(vals[vals.length - 1]);
  return min === max ? min : `${min} – ${max}`;
});

// ── Families ──
const familyList = computed(() => {
  const families = new Set<string>();
  for (const d of derivatives.value) {
    if (d.model.family) families.add(d.model.family);
  }
  return [...families].sort();
});

const familyCount = computed(() => familyList.value.length || '—');

// ── Working count ──
const workingCount = computed(() => {
  return derivatives.value.filter(d =>
    d.model.providers.some(p => !p._removed && p.status.result === 'working')
  ).length;
});

// ── Provider icons ──
const derivativeProviders = computed(() => {
  const provs = new Map<string, string>();
  for (const d of derivatives.value) {
    for (const dp of d.model.providers) {
      if (!dp._removed) provs.set(dp.provider_slug, dp.provider);
    }
  }
  return Array.from(provs.entries()).map(([slug, name]) => ({ slug, name }));
});

// ── Capabilities ──
const capabilities = computed(() => {
  const caps = [
    { key: 'supports_tools', label: 'tools' },
    { key: 'supports_reasoning', label: 'reasoning' },
    { key: 'supports_attachment', label: 'vision' },
    { key: 'supports_structured_output', label: 'structured JSON' },
    { key: 'open_weights', label: 'open weights' },
  ];
  return caps.map(cap => {
    let has = false;
    for (const d of derivatives.value) {
      for (const dp of d.model.providers) {
        if (dp._removed) continue;
        if ((dp as any)[cap.key] === true) { has = true; break; }
      }
      if (has) break;
    }
    return { ...cap, has };
  });
});

// ── Top best-for ──
const topBestFor = computed(() => {
  const counts: Record<string, number> = {};
  for (const d of derivatives.value) {
    for (const tag of d.model.best_for || []) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
});

// ── Input types ──
const inputTypes = computed(() => {
  const types = new Set<string>();
  for (const d of derivatives.value) {
    for (const dp of d.model.providers) {
      if (dp._removed) continue;
      for (const t of dp.input_types || []) types.add(t);
    }
  }
  return [...types].sort();
});

const hasFeatures = computed(() =>
  derivativeProviders.value.length > 0 ||
  capabilities.value.some(c => c.has) ||
  topBestFor.value.length > 0 ||
  inputTypes.value.length > 0 ||
  familyList.value.length > 0
);

// ── Validation counts ──
const valCounts = computed(() => {
  const counts = { working: 0, broken: 0, rate_limited: 0, untested: 0 };
  for (const d of derivatives.value) {
    for (const dp of d.model.providers) {
      if (dp._removed) continue;
      const r = dp.status.result;
      if (r === 'working') counts.working++;
      else if (r === 'broken' || r === 'not_found') counts.broken++;
      else if (r === 'rate_limited') counts.rate_limited++;
      else counts.untested++;
    }
  }
  return counts;
});

const valFlex = computed(() => {
  const c = valCounts.value;
  const total = c.working + c.broken + c.rate_limited + c.untested || 1;
  return {
    working: c.working / total,
    rate_limited: c.rate_limited / total,
    broken: c.broken / total,
    untested: c.untested / total,
  };
});

const detailModel = ref<ModelData | null>(null);
const detailCreator = ref<CreatorData | null>(null);
function openDetail(model: ModelData, creatorId: string) {
  detailModel.value = model;
  detailCreator.value = store.creators.find((c) => c.id === creatorId) || null;
}
</script>

<style scoped>
.bmd-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.back-link {
  font-size: 0.78rem;
  color: var(--accent);
  text-decoration: none;
}
.back-link:hover { text-decoration: underline; }
.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 8px 0 4px;
  line-height: 1.3;
}
.bmd-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}

/* ── Unique-facts chips ── */
.bmd-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.bmd-fact-chip {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
}
.bmd-fact-chip.fact-param { background: rgba(99,102,241,0.12); color: #818cf8; }
.bmd-fact-chip.fact-ctx { background: rgba(52,211,153,0.12); color: #34d399; }
.bmd-fact-chip.fact-open { background: rgba(52,211,153,0.12); color: #34d399; }
.bmd-fact-chip.fact-closed { background: rgba(251,191,36,0.12); color: #eab308; }

/* ── Features row ── */
.bmd-features-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 14px 0 0;
}
.bmd-provider-icons {
  display: flex;
  align-items: center;
  gap: 4px;
}
.bmd-prov-icon {
  border-radius: 4px;
  opacity: 0.8;
  transition: opacity 0.12s;
}
.bmd-prov-icon:hover { opacity: 1; }

.bmd-caps { display: flex; flex-wrap: wrap; gap: 5px; }
.bmd-cap-badge {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--text-dim);
  background: var(--bg-elevated);
  border: 1px solid transparent;
  transition: color 0.12s, background 0.12s, border-color 0.12s;
}
.bmd-cap-badge.active {
  color: var(--accent);
  background: var(--accent-subtle);
  border-color: var(--accent);
}

.bmd-bestfor-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.bmd-bestfor {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-subtle);
  color: var(--accent);
  font-weight: 500;
}

.bmd-input-types { display: flex; flex-wrap: wrap; gap: 4px; }
.bmd-input-type {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--text-dim);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

.bmd-family-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.bmd-family-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-dim);
}
.bmd-family-tag {
  font-size: 0.62rem;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--text-dim);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

/* ── Meta grid ── */
.bmd-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin: 16px 0;
}
.bmd-stat {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}
.bmd-stat-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--accent);
}
.bmd-stat-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Validation bar ── */
.bmd-validation-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
  gap: 1px;
}
.val-segment { min-width: 2px; transition: flex 0.3s; }
.val-segment.working { background: var(--green); }
.val-segment.rate_limited { background: var(--orange); }
.val-segment.broken { background: var(--red); }
.val-segment.untested { background: var(--accent); }

.bmd-val-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-top: 6px;
}
.val-legend {
  font-size: 0.62rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}
.val-legend::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.val-legend.working { color: var(--green); }
.val-legend.working::before { background: var(--green); }
.val-legend.rate_limited { color: var(--orange); }
.val-legend.rate_limited::before { background: var(--orange); }
.val-legend.broken { color: var(--red); }
.val-legend.broken::before { background: var(--red); }
.val-legend.untested { color: var(--accent); }
.val-legend.untested::before { background: var(--accent); }

.bmd-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.bmd-creator-group {
  margin-top: 20px;
}
.bmd-creator-name {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text-secondary);
}
.bmd-creator-link {
  color: var(--accent);
  text-decoration: none;
}
.bmd-creator-link:hover { text-decoration: underline; }
.bmd-creator-count {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-weight: 400;
}

.bmd-models {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 768px) {
  .bmd-page { padding: 12px; }
  .bmd-meta-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
