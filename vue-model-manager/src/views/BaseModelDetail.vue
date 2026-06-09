<template>
  <div class="bmd-page">
    <div class="page-header">
      <router-link to="/base-models" class="back-link">← Base Models</router-link>
      <h2>{{ baseModelName }}</h2>
      <p class="bmd-subtitle">
        {{ derivatives.length }} derivative{{ derivatives.length !== 1 ? 's' : '' }}
        by {{ derivativeCount }} derivative creator{{ derivativeCount !== 1 ? 's' : '' }}
      </p>
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
  return c ? c.models.some((m) => m.base_creator && m.base_creator !== m.creator) : false;
}

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
}
</style>
