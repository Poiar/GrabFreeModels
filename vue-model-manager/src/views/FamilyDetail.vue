<template>
  <div v-if="family" class="family-detail-page">
    <div class="page-header">
      <router-link to="/families" class="back-link">← Families</router-link>
      <h2>{{ formatFamilyName(family.name) }}</h2>
      <p class="fd-subtitle">
        {{ family.model_count }} models · {{ family.provider_count }} providers
      </p>
      <!-- Unique-facts chip row -->
      <div class="fd-facts" v-if="familyFacts.length">
        <span v-for="f in familyFacts" :key="f.label" class="fd-fact-chip" :class="f.cls">{{ f.label }}</span>
      </div>
    </div>

    <!-- Features row: provider icons, capabilities, best-for, input types, ranking highlights -->
    <div class="fd-features-row">
      <div class="fd-provider-icons" v-if="familyProviders.length">
        <ProviderIcon
          v-for="p in familyProviders"
          :key="p.slug"
          :slug="p.slug"
          :size="18"
          :alt="p.name"
          cls="fd-prov-icon"
        />
      </div>
      <div class="fd-caps">
        <span
          v-for="cap in capabilities"
          :key="cap.key"
          class="fd-cap-badge"
          :class="{ active: cap.has }"
          :title="cap.label"
        >{{ cap.label }}</span>
      </div>
      <div class="fd-bestfor-tags" v-if="topBestFor.length">
        <span v-for="tag in topBestFor.slice(0, 6)" :key="tag" class="fd-bestfor">{{ tag }}</span>
      </div>
      <div class="fd-input-types" v-if="inputTypes.length">
        <span v-for="t in inputTypes" :key="t" class="fd-input-type">{{ t }}</span>
      </div>
      <div class="fd-rank-highlights" v-if="rankingHighlights.length">
        <span class="fd-rank-label">Top 3:</span>
        <span v-for="r in rankingHighlights" :key="r" class="fd-rank-tag">{{ r }}</span>
      </div>
    </div>

    <!-- Meta grid -->
    <div class="fd-meta-grid">
      <div class="fd-stat">
        <span class="fd-stat-value">{{ workingCount }} / {{ family.model_count }}</span>
        <span class="fd-stat-label">Working models</span>
      </div>
      <div class="fd-stat">
        <span class="fd-stat-value">{{ contextRange }}</span>
        <span class="fd-stat-label">Context range</span>
      </div>
      <div class="fd-stat">
        <span class="fd-stat-value">{{ topProvider }}</span>
        <span class="fd-stat-label">Most providers</span>
      </div>
      <div class="fd-stat">
        <span class="fd-stat-value">{{ releaseRange }}</span>
        <span class="fd-stat-label">Release range</span>
      </div>
      <div class="fd-stat">
        <span class="fd-stat-value">{{ frontierCount }}</span>
        <span class="fd-stat-label">Frontier models</span>
      </div>
      <div class="fd-stat">
        <span class="fd-stat-value">{{ validationSummary }}</span>
        <span class="fd-stat-label">Validation</span>
      </div>
    </div>

    <!-- Validation bar -->
    <div class="fd-validation-bar">
      <div class="val-segment working" :style="{ flex: valFlex.working }" :title="valCounts.working + ' working'"></div>
      <div class="val-segment rate_limited" :style="{ flex: valFlex.rate_limited }" :title="valCounts.rate_limited + ' rate limited'"></div>
      <div class="val-segment broken" :style="{ flex: valFlex.broken }" :title="valCounts.broken + ' broken'"></div>
      <div class="val-segment untested" :style="{ flex: valFlex.untested }" :title="valCounts.untested + ' untested'"></div>
      <div class="val-segment not_found" :style="{ flex: valFlex.not_found }" :title="valCounts.not_found + ' not found'"></div>
    </div>
    <div class="fd-val-legend">
      <span v-if="valCounts.working" class="val-legend working">{{ valCounts.working }} working</span>
      <span v-if="valCounts.rate_limited" class="val-legend rate_limited">{{ valCounts.rate_limited }} rate limited</span>
      <span v-if="valCounts.broken" class="val-legend broken">{{ valCounts.broken }} broken</span>
      <span v-if="valCounts.untested" class="val-legend untested">{{ valCounts.untested }} untested</span>
      <span v-if="valCounts.not_found" class="val-legend not_found">{{ valCounts.not_found }} not found</span>
    </div>

    <!-- Creators -->
    <div v-if="familyCreators.length" class="fd-creators">
      <span class="fd-creators-label">Creators:</span>
      <router-link
        v-for="c in familyCreators"
        :key="c.id"
        :to="`/creator/${c.id}`"
        class="fd-creator-tag"
      >{{ c.name }}</router-link>
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

    <!-- Model list -->
    <h3 class="section-title">Models</h3>
    <div class="fd-models">
      <SuperModelCard
        v-for="model in filteredModels"
        :key="model.slug"
        :model="model"
        :creator-slug="creatorSlugMap.get(model.creator || '')"
        @click="openDetail(model)"
        @creator-click="() => {}"
      />
    </div>

    <!-- Detail panel -->
    <ModelDetailPanel
      v-if="detailModel"
      :open="!!detailModel"
      :model="detailModel"
      :creator="creatorFor(detailModel)"
      @close="detailModel = null"
      @navigate-to="detailModel = $event.model"
    />
  </div>
  <div v-else class="fd-not-found">
    <p>Family not found.</p>
    <router-link to="/families" class="back-link">← Back to families</router-link>
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

const familyName = computed(() => decodeURIComponent(route.params.name as string));
const family = computed(() => store.families.find((f) => f.name === familyName.value));

const creatorSlugMap = computed(() => {
  const map = new Map<string, string>();
  for (const c of store.visibleCreators) {
    map.set(c.name, c.id);
  }
  return map;
});

const detailModel = ref<ModelData | null>(null);
function openDetail(model: ModelData) {
  detailModel.value = model;
}

const FAMILY_NAME_OVERRIDES: Record<string, string> = {
  gpt: 'GPT',
  glm: 'GLM',
};

// ── Derivation method filter ──
const derivFilter = ref('all');

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

const modelDerivationCounts = computed(() => {
  const seenModels = new Set<string>();
  const counts: Record<string, number> = {};
  for (const chip of DERIV_CHIPS) {
    counts[chip.value] = 0;
  }

  const models = family.value?.models ?? [];
  for (const model of models) {
    if (seenModels.has(model.slug)) continue;
    seenModels.add(model.slug);

    counts.all++;

    const method = model.derivation_method;
    if (method && counts[method] !== undefined) {
      counts[method]++;
    } else {
      counts.foundation++;
    }
  }

  return counts;
});

const filteredModels = computed(() => {
  const models = family.value?.models ?? [];
  if (derivFilter.value === 'all') return models;
  return models.filter((model) => {
    if (derivFilter.value === 'foundation') return !model.derivation_method;
    return model.derivation_method === derivFilter.value;
  });
});

function formatFamilyName(raw: string): string {
  if (raw === 'Uncategorized') return raw;
  return raw.split('-').map(w => FAMILY_NAME_OVERRIDES[w] ?? (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

function creatorFor(model: ModelData): CreatorData {
  const c = store.creators.find((cr) => cr.models.some((m) => m.super_id === model.super_id));
  return c ?? { id: 'unknown', name: model.creator || 'Unknown', type: 'other' as const, role: 'Model creator' as const, model_count: 0, provider_count: 0, models: [] };
}

// ── Validation counts ──
const valCounts = computed(() => {
  const counts = { working: 0, broken: 0, rate_limited: 0, untested: 0, not_found: 0 };
  if (!family.value) return counts;
  for (const model of family.value.models) {
    for (const dp of model.providers) {
      if (dp._removed) continue;
      const r = dp.status.result;
      if (r in counts) counts[r as keyof typeof counts]++;
      else counts.untested++;
    }
  }
  return counts;
});

const valFlex = computed(() => {
  const c = valCounts.value;
  const total = c.working + c.broken + c.rate_limited + c.untested + c.not_found || 1;
  return {
    working: c.working / total,
    rate_limited: c.rate_limited / total,
    broken: c.broken / total,
    untested: c.untested / total,
    not_found: c.not_found / total,
  };
});

const validationSummary = computed(() => {
  const c = valCounts.value;
  const total = c.working + c.broken + c.rate_limited + c.untested + c.not_found;
  if (!total) return '—';
  const pct = Math.round((c.working / total) * 100);
  return `${pct}% pass`;
});

const workingCount = computed(() => valCounts.value.working);

// ── Context range ──
const bestContext = computed(() => {
  if (!family.value) return 0;
  const contexts = family.value.models.map((m) => m.best_context).filter((ctx) => ctx !== null);
  return contexts.length > 0 ? Math.max(...contexts, 0) : 0;
});

const minContext = computed(() => {
  if (!family.value) return 0;
  const contexts = family.value.models.map((m) => m.best_context).filter((ctx) => ctx !== null);
  return contexts.length > 0 ? Math.min(...contexts) : 0;
});

const contextRange = computed(() => {
  const min = minContext.value;
  const max = bestContext.value;
  if (!min && !max) return '—';
  if (!min || min === max) return formatContext(max);
  return `${formatContext(min)} – ${formatContext(max)}`;
});

// ── Most providers ──
const topProvider = computed(() => {
  if (!family.value) return '—';
  const counts: Record<string, number> = {};
  for (const model of family.value.models) {
    for (const p of model.providers) {
      if (!p._removed) counts[p.provider] = (counts[p.provider] || 0) + 1;
    }
  }
  let top = '—';
  let maxCount = 0;
  for (const [name, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      top = name;
    }
  }
  return top;
});

// ── Release range ──
const releaseRange = computed(() => {
  if (!family.value) return '—';
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const model of family.value.models) {
    for (const dp of model.providers) {
      if (dp.release_date) {
        if (!earliest || dp.release_date < earliest) earliest = dp.release_date;
        if (!latest || dp.release_date > latest) latest = dp.release_date;
      }
    }
  }
  if (!earliest) return '—';
  const from = earliest.slice(0, 7);
  const to = latest!.slice(0, 7);
  return from === to ? from : `${from} – ${to}`;
});

// ── Frontier models ──
const frontierCount = computed(() => {
  if (!family.value) return 0;
  let count = 0;
  for (const model of family.value.models) {
    for (const rank of Object.values(model.role_rankings)) {
      if (rank <= 3) {
        count++;
        break;
      }
    }
  }
  return count;
});

// ── Top best_for ──
const topBestFor = computed(() => {
  if (!family.value) return [];
  const counts: Record<string, number> = {};
  for (const model of family.value.models) {
    for (const tag of model.best_for || []) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
});

// ── Provider icons for this family ──
const familyProviders = computed(() => {
  if (!family.value) return [];
  const providers = new Map<string, string>();
  for (const model of family.value.models) {
    for (const dp of model.providers) {
      if (!dp._removed) providers.set(dp.provider_slug, dp.provider);
    }
  }
  return Array.from(providers.entries()).map(([slug, name]) => ({ slug, name }));
});

// ── Capability badges ──
const capabilities = computed(() => {
  if (!family.value) return [];
  const caps = [
    { key: 'supports_tools', label: 'tools' },
    { key: 'supports_reasoning', label: 'reasoning' },
    { key: 'supports_attachment', label: 'vision' },
    { key: 'supports_structured_output', label: 'structured JSON' },
    { key: 'open_weights', label: 'open weights' },
  ];
  return caps.map((cap) => {
    let has = false;
    for (const model of family.value!.models) {
      for (const dp of model.providers) {
        if (dp._removed) continue;
        if ((dp as any)[cap.key] === true) {
          has = true;
          break;
        }
      }
      if (has) break;
    }
    return { ...cap, has };
  });
});

// ── Input modalities ──
const inputTypes = computed(() => {
  if (!family.value) return [];
  const types = new Set<string>();
  for (const model of family.value.models) {
    for (const dp of model.providers) {
      if (dp._removed) continue;
      for (const t of dp.input_types || []) {
        types.add(t);
      }
    }
  }
  return [...types].sort();
});

// ── Ranking highlights ──
const rankingHighlights = computed(() => {
  if (!family.value) return [];
  const roles = new Set<string>();
  for (const model of family.value.models) {
    for (const [role, rank] of Object.entries(model.role_rankings)) {
      if (rank <= 3) roles.add(role);
    }
  }
  return [...roles].sort();
});

// ── Creators contributing to this family ──
const familyCreators = computed(() => {
  if (!family.value) return [];
  const creatorNames = new Set<string>();
  for (const model of family.value.models) {
    if (model.creator) creatorNames.add(model.creator);
  }
  return store.creators
    .filter((c) => creatorNames.has(c.name))
    .sort((a, b) => b.model_count - a.model_count);
});

// ── Unique-facts chips ──
function formatParamSize(b: number): string {
  if (b >= 1000) return (b / 1000).toFixed(1).replace(/\.0$/, '') + 'T';
  if (b >= 1) return b.toFixed(1).replace(/\.0$/, '') + 'B';
  return (b * 1000).toFixed(0) + 'M';
}

const familyFacts = computed(() => {
  const chips: { label: string; cls: string }[] = [];
  const f = family.value;
  if (!f) return chips;

  // Parameter range
  const paramSizes = new Set<number>();
  for (const m of f.models) {
    for (const dp of m.providers) {
      if (dp.param_count_b) paramSizes.add(dp.param_count_b);
    }
  }
  const paramVals = [...paramSizes].sort((a, b) => a - b);
  if (paramVals.length) {
    const min = formatParamSize(paramVals[0]);
    const max = formatParamSize(paramVals[paramVals.length - 1]);
    chips.push({ label: min === max ? `${min} params` : `${min} – ${max} params`, cls: 'fact-param' });
  }

  // Knowledge cutoff range
  const cutoffs = new Set<string>();
  for (const m of f.models) {
    for (const dp of m.providers) {
      if (dp.knowledge_cutoff) cutoffs.add(dp.knowledge_cutoff);
    }
  }
  const cutoffVals = [...cutoffs].sort();
  if (cutoffVals.length === 1) {
    chips.push({ label: `Knowledge cutoff: ${cutoffVals[0]}`, cls: 'fact-cutoff' });
  } else if (cutoffVals.length > 1) {
    chips.push({ label: `Knowledge: ${cutoffVals[0]} – ${cutoffVals[cutoffVals.length - 1]}`, cls: 'fact-cutoff' });
  }

  // Open-weight count
  let openCount = 0;
  for (const m of f.models) {
    if (m.providers.some(p => !p._removed && p.open_weights === true)) openCount++;
  }
  if (openCount > 0 && openCount < f.models.length) {
    chips.push({ label: `${openCount}/${f.model_count} open weight`, cls: 'fact-open' });
  } else if (openCount === f.models.length) {
    chips.push({ label: 'All open weight', cls: 'fact-open' });
  }

  // Creator count
  const creators = familyCreators.value;
  if (creators.length > 0) {
    chips.push({ label: `${creators.length} ${creators.length === 1 ? 'creator' : 'creators'}`, cls: 'fact-creator' });
  }

  return chips;
});
</script>

<style scoped>
.family-detail-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.back-link {
  font-size: 0.78rem;
  color: var(--accent);
  text-decoration: none;
}
.back-link:hover {
  text-decoration: underline;
}
.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 8px 0 4px;
}
.fd-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}

/* ── Unique-facts chips ── */
.fd-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.fd-fact-chip {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
}
.fd-fact-chip.fact-param { background: rgba(99,102,241,0.12); color: #818cf8; }
.fd-fact-chip.fact-cutoff { background: rgba(168,85,247,0.12); color: #a855f7; }
.fd-fact-chip.fact-open { background: rgba(52,211,153,0.12); color: #34d399; }
.fd-fact-chip.fact-creator { background: rgba(236,72,153,0.12); color: #ec4899; }

/* Features row */
.fd-features-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 14px 0 0;
}

.fd-provider-icons {
  display: flex;
  align-items: center;
  gap: 4px;
}
.fd-prov-icon {
  border-radius: 4px;
  opacity: 0.8;
  transition: opacity 0.12s;
}
.fd-prov-icon:hover {
  opacity: 1;
}

.fd-caps {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.fd-cap-badge {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px solid transparent;
  transition: color 0.12s, background 0.12s, border-color 0.12s;
}
.fd-cap-badge.active {
  color: var(--accent);
  background: var(--accent-subtle);
  border-color: var(--accent);
}

.fd-bestfor-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.fd-bestfor {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-subtle);
  color: var(--accent);
  font-weight: 500;
}

.fd-input-types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.fd-input-type {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

.fd-rank-highlights {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.fd-rank-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}
.fd-rank-tag {
  font-size: 0.62rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--green);
  background: color-mix(in srgb, var(--green) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--green) 30%, transparent);
}

/* Meta grid */
.fd-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin: 16px 0;
}
.fd-stat {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}
.fd-stat-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--accent);
}
.fd-stat-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Validation bar */
.fd-validation-bar {
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
.val-segment.not_found { background: var(--text-muted); }

.fd-val-legend {
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
.val-legend.not_found { color: var(--text-muted); }
.val-legend.not_found::before { background: var(--text-muted); }

/* Creators */
.fd-creators {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.fd-creators-label {
  font-size: 0.68rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.fd-creator-tag {
  font-size: 0.68rem;
  padding: 3px 10px;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.12s, background 0.12s;
}
.fd-creator-tag:hover {
  color: var(--accent);
  background: var(--accent-subtle);
}

.section-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 20px 0 12px;
}
.fd-models {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fd-not-found {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .family-detail-page {
    padding: 12px;
  }
  .fd-meta-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

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
</style>
