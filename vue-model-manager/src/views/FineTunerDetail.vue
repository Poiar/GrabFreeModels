<template>
  <div v-if="creator" class="ftd-page">
    <div class="page-header">
      <router-link to="/fine-tuners" class="back-link">← Fine Tuners</router-link>
      <h2>
        {{ creator.name }}
        <span
          class="cd-country"
          :style="{ color: getCountryForCreator(creator.id).text, background: getCountryForCreator(creator.id).color }"
        >{{ getCountryForCreator(creator.id).name }}</span>
      </h2>
      <p class="cd-subtitle">
        {{ creator.model_count }} models · {{ creator.provider_count }} providers
      </p>
      <p v-if="baseCreatorList.length" class="ftd-base-line">
        Fine-tunes models from
        <span v-for="(bc, i) in baseCreatorList" :key="bc">
          <router-link :to="`/creator/${getBaseCreatorSlug(bc)}`" class="ftd-base-link">{{ bc }}</router-link
          ><template v-if="i < baseCreatorList.length - 1">, </template>
        </span>
      </p>
      <p v-if="ftDescription" class="ftd-description">{{ ftDescription }}</p>
    </div>

    <!-- Features row -->
    <div class="cd-features-row">
      <div class="cd-provider-icons" v-if="ftProviders.length">
        <ProviderIcon
          v-for="p in ftProviders"
          :key="p.slug"
          :slug="p.slug"
          :size="18"
          :alt="p.name"
          cls="cd-prov-icon"
        />
      </div>
      <div class="cd-caps">
        <span
          v-for="cap in capabilities"
          :key="cap.key"
          class="cd-cap-badge"
          :class="{ active: cap.has }"
          :title="cap.label"
        >{{ cap.label }}</span>
      </div>
      <div class="cd-bestfor-tags" v-if="topBestFor.length">
        <span v-for="tag in topBestFor.slice(0, 6)" :key="tag" class="cd-bestfor">{{ tag }}</span>
      </div>
      <div class="cd-input-types" v-if="inputTypes.length">
        <span v-for="t in inputTypes" :key="t" class="cd-input-type">{{ t }}</span>
      </div>
      <div class="cd-rank-highlights" v-if="rankingHighlights.length">
        <span class="cd-rank-label">Top 3:</span>
        <span v-for="r in rankingHighlights" :key="r" class="cd-rank-tag">{{ r }}</span>
      </div>
    </div>

    <!-- Meta grid -->
    <div class="cd-meta-grid">
      <div class="cd-stat">
        <span class="cd-stat-value">{{ workingCount }} / {{ creator.model_count }}</span>
        <span class="cd-stat-label">Working models</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ contextRange }}</span>
        <span class="cd-stat-label">Context range</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ topProvider }}</span>
        <span class="cd-stat-label">Most providers</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ releaseRange }}</span>
        <span class="cd-stat-label">Release range</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ frontierCount }}</span>
        <span class="cd-stat-label">Frontier models</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ validationSummary }}</span>
        <span class="cd-stat-label">Validation</span>
      </div>
    </div>

    <!-- Validation bar -->
    <div class="cd-validation-bar">
      <div class="val-segment working" :style="{ flex: valFlex.working }" :title="valCounts.working + ' working'"></div>
      <div class="val-segment rate_limited" :style="{ flex: valFlex.rate_limited }" :title="valCounts.rate_limited + ' rate limited'"></div>
      <div class="val-segment broken" :style="{ flex: valFlex.broken }" :title="valCounts.broken + ' broken'"></div>
      <div class="val-segment untested" :style="{ flex: valFlex.untested }" :title="valCounts.untested + ' untested'"></div>
      <div class="val-segment not_found" :style="{ flex: valFlex.not_found }" :title="valCounts.not_found + ' not found'"></div>
    </div>
    <div class="cd-val-legend">
      <span v-if="valCounts.working" class="val-legend working">{{ valCounts.working }} working</span>
      <span v-if="valCounts.rate_limited" class="val-legend rate_limited">{{ valCounts.rate_limited }} rate limited</span>
      <span v-if="valCounts.broken" class="val-legend broken">{{ valCounts.broken }} broken</span>
      <span v-if="valCounts.untested" class="val-legend untested">{{ valCounts.untested }} untested</span>
      <span v-if="valCounts.not_found" class="val-legend not_found">{{ valCounts.not_found }} not found</span>
    </div>

    <!-- Families -->
    <div v-if="familyList.length" class="cd-families">
      <span class="cd-families-label">Families:</span>
      <router-link
        v-for="f in familyList"
        :key="f"
        :to="`/family/${encodeURIComponent(f)}`"
        class="cd-family-tag"
      >{{ f }}</router-link>
    </div>

    <!-- Models grouped by base creator -->
    <h3 class="section-title">Models</h3>
    <div v-for="[base, models] in modelsByBaseCreator" :key="base" class="ftd-group">
      <h4 class="ftd-group-title">{{ base === 'Original models' ? base : `Builds on ${base}` }}</h4>
      <div class="cd-models">
        <SuperModelCard
          v-for="model in models"
          :key="model.slug"
          :model="model"
          :creator-slug="creator.id"
          @click="openDetail(model)"
          @creator-click="() => {}"
        />
      </div>
    </div>

    <ModelDetailPanel
      v-if="detailModel"
      :open="!!detailModel"
      :model="detailModel"
      :creator="creator"
      @close="detailModel = null"
      @navigate-to="detailModel = $event.model"
    />
  </div>
  <div v-else class="cd-not-found">
    <p>Fine-tuner not found.</p>
    <router-link to="/fine-tuners" class="back-link">← Back to fine-tuners</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import SuperModelCard from '@/components/SuperModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { useModelsStore } from '@/store/models';
import { getCountryForCreator } from '@/data/creator-countries';
import type { ModelData } from '@/types';

const store = useModelsStore();
const route = useRoute();

const creatorId = computed(() => route.params.id as string);
const creator = computed(() => store.creators.find((c) => c.id === creatorId.value));

const detailModel = ref<ModelData | null>(null);
function openDetail(model: ModelData) { detailModel.value = model; }

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

const baseCreatorList = computed(() => {
  if (!creator.value) return [];
  const bases = new Set<string>();
  for (const m of creator.value.models) {
    if (m.base_creator && m.base_creator !== m.creator) bases.add(m.base_creator);
  }
  return [...bases].sort();
});

function getBaseCreatorSlug(name: string): string {
  const c = store.creators.find((cr) => cr.name === name);
  return c?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

const modelsByBaseCreator = computed(() => {
  if (!creator.value) return [];
  const groups: Record<string, ModelData[]> = {};
  for (const model of creator.value.models) {
    const base = model.base_creator && model.base_creator !== model.creator
      ? model.base_creator
      : 'Original models';
    if (!groups[base]) groups[base] = [];
    groups[base].push(model);
  }
  // Sort: base creators with most models first, "Original models" last
  return Object.entries(groups).sort((a, b) => {
    if (a[0] === 'Original models') return 1;
    if (b[0] === 'Original models') return -1;
    return b[1].length - a[1].length;
  });
});

const workingCount = computed(() => {
  if (!creator.value) return 0;
  let count = 0;
  for (const model of creator.value.models) {
    if (model.providers.some((p) => !p._removed && p.status.result === 'working')) count++;
  }
  return count;
});

const bestContext = computed(() => {
  if (!creator.value) return 0;
  const contexts = creator.value.models.map((m) => m.best_context).filter((ctx) => ctx !== null);
  return contexts.length > 0 ? Math.max(...contexts, 0) : 0;
});

const minContext = computed(() => {
  if (!creator.value) return 0;
  const contexts = creator.value.models.map((m) => m.best_context).filter((ctx) => ctx !== null);
  return contexts.length > 0 ? Math.min(...contexts) : 0;
});

const contextRange = computed(() => {
  const min = minContext.value;
  const max = bestContext.value;
  if (!min && !max) return '—';
  if (!min || min === max) return formatContext(max);
  return `${formatContext(min)} – ${formatContext(max)}`;
});

const topProvider = computed(() => {
  if (!creator.value) return '—';
  const counts: Record<string, number> = {};
  for (const model of creator.value.models) {
    for (const p of model.providers) {
      if (!p._removed) counts[p.provider] = (counts[p.provider] || 0) + 1;
    }
  }
  let top = '—';
  let maxCount = 0;
  for (const [name, count] of Object.entries(counts)) {
    if (count > maxCount) { maxCount = count; top = name; }
  }
  return top;
});

const releaseRange = computed(() => {
  if (!creator.value) return '—';
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const model of creator.value.models) {
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

const frontierCount = computed(() => {
  if (!creator.value) return 0;
  let count = 0;
  for (const model of creator.value.models) {
    for (const rank of Object.values(model.role_rankings)) {
      if (rank <= 3) { count++; break; }
    }
  }
  return count;
});

const valCounts = computed(() => {
  const counts = { working: 0, broken: 0, rate_limited: 0, untested: 0, not_found: 0 };
  if (!creator.value) return counts;
  for (const model of creator.value.models) {
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
  return `${Math.round((c.working / total) * 100)}% pass`;
});

const familyList = computed(() => {
  if (!creator.value) return [];
  const families = new Set<string>();
  for (const m of creator.value.models) {
    if (m.family) families.add(m.family);
  }
  return [...families].sort();
});

const topBestFor = computed(() => {
  if (!creator.value) return [];
  const counts: Record<string, number> = {};
  for (const model of creator.value.models) {
    for (const tag of model.best_for || []) counts[tag] = (counts[tag] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
});

const capabilities = computed(() => {
  if (!creator.value) return [];
  const caps = [
    { key: 'supports_tools', label: 'tools' },
    { key: 'supports_reasoning', label: 'reasoning' },
    { key: 'supports_attachment', label: 'vision' },
    { key: 'supports_structured_output', label: 'structured JSON' },
    { key: 'open_weights', label: 'open weights' },
  ];
  return caps.map((cap) => {
    let has = false;
    for (const model of creator.value!.models) {
      for (const dp of model.providers) {
        if (dp._removed) continue;
        if ((dp as any)[cap.key] === true) { has = true; break; }
      }
      if (has) break;
    }
    return { ...cap, has };
  });
});

const inputTypes = computed(() => {
  if (!creator.value) return [];
  const types = new Set<string>();
  for (const model of creator.value.models) {
    for (const dp of model.providers) {
      if (dp._removed) continue;
      for (const t of dp.input_types || []) types.add(t);
    }
  }
  return [...types].sort();
});

// ── Provider icons ──
const ftProviders = computed(() => {
  if (!creator.value) return [];
  const providers = new Map<string, string>();
  for (const model of creator.value.models) {
    for (const dp of model.providers) {
      if (!dp._removed) providers.set(dp.provider_slug, dp.provider);
    }
  }
  return Array.from(providers.entries()).map(([slug, name]) => ({ slug, name }));
});

// ── Ranking highlights ──
const rankingHighlights = computed(() => {
  if (!creator.value) return [];
  const roles = new Set<string>();
  for (const model of creator.value.models) {
    for (const [role, rank] of Object.entries(model.role_rankings)) {
      if (rank <= 3) roles.add(role);
    }
  }
  return [...roles].sort();
});

// ── Auto-generated description ──
const ftDescription = computed(() => {
  const c = creator.value;
  if (!c) return '';
  const families = familyList.value;
  const bases = baseCreatorList.value;
  let text = `${c.name} fine-tunes `;
  if (families.length === 0) {
    text += 'models';
  } else if (families.length === 1) {
    text += `the ${families[0]} family`;
  } else {
    const last = families[families.length - 1];
    text += `${families.slice(0, -1).join(', ')} and ${last} families`;
  }
  if (bases.length === 1) {
    text += ` from ${bases[0]}`;
  } else if (bases.length > 1) {
    text += ` from ${bases.slice(0, -1).join(', ')} and ${bases[bases.length - 1]}`;
  }
  text += ` — ${c.model_count} model${c.model_count !== 1 ? 's' : ''} across ${c.provider_count} provider${c.provider_count !== 1 ? 's' : ''}`;
  const tags = topBestFor.value.slice(0, 3);
  if (tags.length) text += `, with strengths in ${tags.join(', ')}`;
  text += '.';
  return text;
});
</script>

<style scoped>
.ftd-page {
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
}
.cd-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}
.cd-country {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
  vertical-align: middle;
}

.ftd-description {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 6px 0 0;
  max-width: 720px;
}

.ftd-base-line {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin: 6px 0 0;
}
.ftd-base-link {
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
}
.ftd-base-link:hover { text-decoration: underline; }

.cd-features-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 14px 0 0;
}
.cd-caps { display: flex; flex-wrap: wrap; gap: 5px; }
.cd-cap-badge {
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
.cd-cap-badge.active {
  color: var(--accent);
  background: var(--accent-subtle);
  border-color: var(--accent);
}
.cd-bestfor-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.cd-bestfor {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-subtle);
  color: var(--accent);
  font-weight: 500;
}
.cd-input-types { display: flex; flex-wrap: wrap; gap: 4px; }
.cd-input-type {
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

.cd-provider-icons {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cd-prov-icon {
  border-radius: 4px;
  opacity: 0.8;
  transition: opacity 0.12s;
}
.cd-prov-icon:hover {
  opacity: 1;
}

.cd-rank-highlights {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.cd-rank-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}
.cd-rank-tag {
  font-size: 0.62rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--green);
  background: color-mix(in srgb, var(--green) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--green) 30%, transparent);
}

.cd-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin: 16px 0;
}
.cd-stat {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}
.cd-stat-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--accent);
}
.cd-stat-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cd-validation-bar {
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

.cd-val-legend {
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

.cd-families {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.cd-families-label {
  font-size: 0.68rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cd-family-tag {
  font-size: 0.68rem;
  padding: 3px 10px;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.12s, background 0.12s;
}
.cd-family-tag:hover {
  color: var(--accent);
  background: var(--accent-subtle);
}

.ftd-group {
  margin-bottom: 16px;
}
.ftd-group-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px;
  padding-left: 10px;
  border-left: 3px solid var(--accent);
}

.section-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 20px 0 12px;
}
.cd-models {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cd-not-found {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .ftd-page { padding: 12px; }
  .cd-meta-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
