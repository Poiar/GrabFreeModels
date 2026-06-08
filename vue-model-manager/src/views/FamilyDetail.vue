<template>
  <div v-if="family" class="family-detail-page">
    <div class="page-header">
      <router-link to="/families" class="back-link">← Families</router-link>
      <h2>{{ formatFamilyName(family.name) }}</h2>
      <p class="fd-subtitle">
        {{ family.model_count }} models · {{ family.provider_count }} providers
      </p>
    </div>

    <!-- Aggregate stats -->
    <div class="fd-aggregate">
      <div class="fd-stat">
        <span class="fd-stat-value">{{ formatContext(bestContext) }}</span>
        <span class="fd-stat-label">Best context</span>
      </div>
      <div class="fd-stat">
        <span class="fd-stat-value">{{ workingCount }} / {{ family.model_count }}</span>
        <span class="fd-stat-label">Working models</span>
      </div>
      <div class="fd-stat">
        <span class="fd-stat-value">{{ topProvider }}</span>
        <span class="fd-stat-label">Most providers</span>
      </div>
    </div>

    <!-- Model list -->
    <h3 class="section-title">Models</h3>
    <div class="fd-models">
      <ModelCard
        v-for="model in family.models"
        :key="model.super_id"
        :model="model"
        :creator="creatorFor(model)"
        @model-click="openDetail(model)"
        @provider-click="openDetail(model)"
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
import ModelCard from '@/components/ModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';
import { useModelsStore } from '@/store/models';
import type { CreatorData, ModelData } from '@/types';

const store = useModelsStore();
const route = useRoute();

const familyName = computed(() => decodeURIComponent(route.params.name as string));
const family = computed(() => store.families.find((f) => f.name === familyName.value));

const detailModel = ref<ModelData | null>(null);
function openDetail(model: ModelData) {
  detailModel.value = model;
}

const FAMILY_NAME_OVERRIDES: Record<string, string> = {
  gpt: 'GPT',
  glm: 'GLM',
};

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
  return c ?? { id: 'unknown', name: model.creator || 'Unknown', model_count: 0, provider_count: 0, models: [] };
}

const workingCount = computed(() => {
  if (!family.value) return 0;
  let count = 0;
  for (const model of family.value.models) {
    if (model.providers.some((p) => !p._removed && p.status.result === 'working')) count++;
  }
  return count;
});

const bestContext = computed(() => {
  if (!family.value) return 0;
  const contexts = family.value.models.map((m) => m.best_context).filter((ctx) => ctx !== null);
  return contexts.length > 0 ? Math.max(...contexts, 0) : 0;
});

const topProvider = computed(() => {
  if (!family.value) return '—';
  const counts: Record<string, number> = {};
  for (const model of family.value.models) {
    for (const p of model.providers) {
      counts[p.provider] = (counts[p.provider] || 0) + 1;
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

.fd-aggregate {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  margin: 16px 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}
.fd-stat {
  display: flex;
  flex-direction: column;
}
.fd-stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent);
}
.fd-stat-label {
  font-size: 0.68rem;
  color: var(--text-muted);
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
  .fd-aggregate {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
