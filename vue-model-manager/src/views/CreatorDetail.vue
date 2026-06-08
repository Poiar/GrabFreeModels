<template>
  <div v-if="creator" class="creator-detail-page">
    <div class="page-header">
      <router-link to="/creators" class="back-link">← Creators</router-link>
      <h2>{{ creator.name }}</h2>
      <p class="cd-subtitle">
        {{ creator.model_count }} models · {{ creator.provider_count }} providers
      </p>
    </div>

    <!-- Rich metadata -->
    <div class="cd-meta-grid">
      <div class="cd-stat">
        <span class="cd-stat-value">{{ workingCount }} / {{ creator.model_count }}</span>
        <span class="cd-stat-label">Working models</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ formatContext(bestContext) }}</span>
        <span class="cd-stat-label">Best context</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ topProvider }}</span>
        <span class="cd-stat-label">Most providers</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ activeSince }}</span>
        <span class="cd-stat-label">Active since</span>
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

    <!-- Model list -->
    <h3 class="section-title">Models</h3>
    <div class="cd-models">
      <SuperModelCard
        v-for="model in creator.models"
        :key="model.slug"
        :model="model"
        :creator-slug="creator.id"
        @click="openDetail(model)"
        @creator-click="() => {}"
      />
    </div>

    <!-- Detail panel -->
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
    <p>Creator not found.</p>
    <router-link to="/creators" class="back-link">← Back to creators</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import SuperModelCard from '@/components/SuperModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';
import { useModelsStore } from '@/store/models';
import type { ModelData } from '@/types';

const store = useModelsStore();
const route = useRoute();

const creatorId = computed(() => route.params.id as string);
const creator = computed(() => store.creators.find((c) => c.id === creatorId.value));

const detailModel = ref<ModelData | null>(null);
function openDetail(model: ModelData) {
  detailModel.value = model;
}

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

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
    if (count > maxCount) {
      maxCount = count;
      top = name;
    }
  }
  return top;
});

const activeSince = computed(() => {
  if (!creator.value) return '—';
  let earliest: string | null = null;
  for (const model of creator.value.models) {
    for (const dp of model.providers) {
      if (dp.release_date && (!earliest || dp.release_date < earliest)) {
        earliest = dp.release_date;
      }
    }
  }
  return earliest ? earliest.slice(0, 7) : '—';
});

const frontierCount = computed(() => {
  if (!creator.value) return 0;
  let count = 0;
  for (const model of creator.value.models) {
    for (const rank of Object.values(model.role_rankings)) {
      if (rank <= 3) {
        count++;
        break;
      }
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
  const pct = Math.round((c.working / total) * 100);
  return `${pct}% pass`;
});

const familyList = computed(() => {
  if (!creator.value) return [];
  const families = new Set<string>();
  for (const m of creator.value.models) {
    if (m.family) families.add(m.family);
  }
  return [...families].sort();
});
</script>

<style scoped>
.creator-detail-page {
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
.cd-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
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
  .creator-detail-page {
    padding: 12px;
  }
  .cd-meta-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
