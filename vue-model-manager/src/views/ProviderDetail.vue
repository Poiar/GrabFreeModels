<template>
  <div v-if="provider" class="pd-page">
    <div class="page-header">
      <router-link to="/providers" class="back-link">← Providers</router-link>
      <h2>
        {{ provider.name }}
        <span
          class="cd-country"
          :style="{ color: getCountryForProvider(provider.slug).text, background: getCountryForProvider(provider.slug).color }"
        >{{ getCountryForProvider(provider.slug).name }}</span>
      </h2>
      <p class="pd-subtitle">
        {{ totalModels }} models ·
        <span class="pd-health" :class="provider.health_status">{{ provider.health_status }}</span>
      </p>
    </div>

    <!-- Provider info -->
    <div class="pd-meta-grid">
      <div class="cd-stat">
        <span class="cd-stat-value">{{ totalModels }}</span>
        <span class="cd-stat-label">Total models</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ counts.working }}</span>
        <span class="cd-stat-label">Working</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ counts.rate_limited }}</span>
        <span class="cd-stat-label">Rate limited</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ counts.broken }}</span>
        <span class="cd-stat-label">Broken</span>
      </div>
      <div class="cd-stat" v-if="provider.base_url">
        <span class="cd-stat-value cd-stat-url">{{ provider.base_url }}</span>
        <span class="cd-stat-label">Base URL</span>
      </div>
      <div class="cd-stat" v-if="provider.npm_package">
        <span class="cd-stat-value cd-stat-pkg">{{ provider.npm_package }}</span>
        <span class="cd-stat-label">npm package</span>
      </div>
    </div>

    <!-- Health bar -->
    <div class="cd-validation-bar">
      <div class="val-segment working" :style="{ flex: hbFlex.working }" :title="counts.working + ' working'"></div>
      <div class="val-segment rate_limited" :style="{ flex: hbFlex.rate_limited }" :title="counts.rate_limited + ' rate limited'"></div>
      <div class="val-segment broken" :style="{ flex: hbFlex.broken }" :title="counts.broken + ' broken'"></div>
      <div class="val-segment untested" :style="{ flex: hbFlex.untested }" :title="counts.untested + ' untested'"></div>
    </div>
    <div class="cd-val-legend">
      <span v-if="counts.working" class="val-legend working">{{ counts.working }} working ({{ pctWorking }}%)</span>
      <span v-if="counts.rate_limited" class="val-legend rate_limited">{{ counts.rate_limited }} rate limited</span>
      <span v-if="counts.broken" class="val-legend broken">{{ counts.broken }} broken</span>
      <span v-if="counts.untested" class="val-legend untested">{{ counts.untested }} untested</span>
    </div>

    <!-- Models grouped by creator -->
    <h3 class="section-title">Models</h3>
    <div v-if="providerCreators.length === 0" class="pd-empty">No models found for this provider.</div>
    <div v-for="{ creator, models } in providerCreators" :key="creator.id" class="pd-creator-group">
      <h4 class="pd-creator-name">
        <router-link :to="`/creator/${creator.id}`" class="pd-creator-link">{{ creator.name }}</router-link>
        <span class="pd-creator-count">{{ models.length }} model{{ models.length !== 1 ? 's' : '' }}</span>
      </h4>
      <div class="cd-models">
        <SuperModelCard
          v-for="model in models"
          :key="model.slug"
          :model="model"
          :creator-slug="creator.id"
          @click="openDetail(model, creator)"
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
  <div v-else class="cd-not-found">
    <p>Provider not found.</p>
    <router-link to="/providers" class="back-link">← Back to providers</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import SuperModelCard from '@/components/SuperModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';
import { useModelsStore } from '@/store/models';
import { getCountryForProvider } from '@/data/provider-countries';
import type { CreatorData, ModelData } from '@/types';

const store = useModelsStore();
const route = useRoute();

const providerSlug = computed(() => route.params.slug as string);
const provider = computed(() => store.providerRefs.find((p: { slug: string }) => p.slug === providerSlug.value));

const detailModel = ref<ModelData | null>(null);
const detailCreator = ref<CreatorData | null>(null);
function openDetail(model: ModelData, creator: CreatorData) {
  detailModel.value = model;
  detailCreator.value = creator;
}

const providerCreators = computed(() =>
  store.creators
    .map((creator) => ({
      creator,
      models: creator.models.filter((m) =>
        m.providers.some((p) => p.provider_slug === providerSlug.value && !p._removed),
      ),
    }))
    .filter((c) => c.models.length > 0),
);

const totalModels = computed(() =>
  providerCreators.value.reduce((sum, c) => sum + c.models.length, 0),
);

const counts = computed(() => {
  let working = 0, broken = 0, rate_limited = 0, untested = 0;
  for (const { models } of providerCreators.value) {
    for (const m of models) {
      for (const dp of m.providers) {
        if (dp.provider_slug !== providerSlug.value || dp._removed) continue;
        const r = dp.status.result;
        if (r === 'working') working++;
        else if (r === 'broken' || r === 'not_found') broken++;
        else if (r === 'rate_limited') rate_limited++;
        else untested++;
      }
    }
  }
  return { working, broken, rate_limited, untested, total: working + broken + rate_limited + untested };
});

const hbFlex = computed(() => {
  const c = counts.value;
  const total = c.total || 1;
  return {
    working: c.working / total,
    rate_limited: c.rate_limited / total,
    broken: c.broken / total,
    untested: c.untested / total,
  };
});

const pctWorking = computed(() => {
  const c = counts.value;
  return c.total ? Math.round((c.working / c.total) * 100) : 0;
});
</script>

<style scoped>
.pd-page {
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
.cd-country {
  font-size: 0.55rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.04em;
  vertical-align: middle;
  margin-left: 4px;
}
.pd-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}
.pd-health {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 4px;
}
.pd-health.healthy { color: var(--green); background: color-mix(in srgb, var(--green) 12%, transparent); }
.pd-health.degraded { color: var(--orange); background: color-mix(in srgb, var(--orange) 12%, transparent); }
.pd-health.down { color: var(--red); background: color-mix(in srgb, var(--red) 12%, transparent); }

.pd-meta-grid {
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
.cd-stat-url {
  font-size: 0.65rem;
  font-family: monospace;
  word-break: break-all;
}
.cd-stat-pkg {
  font-size: 0.72rem;
  font-family: monospace;
  color: var(--green);
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

.pd-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.pd-creator-group {
  margin-bottom: 20px;
}
.pd-creator-name {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text-secondary);
}
.pd-creator-link {
  color: var(--accent);
  text-decoration: none;
}
.pd-creator-link:hover { text-decoration: underline; }
.pd-creator-count {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-weight: 400;
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
  .pd-page { padding: 12px; }
  .pd-meta-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
