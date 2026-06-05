<template>
  <div v-if="creator" class="creator-detail-page">
    <div class="page-header">
      <router-link to="/creators" class="back-link">← Creators</router-link>
      <h2>{{ creator.name }}</h2>
      <p class="cd-subtitle">
        {{ creator.model_count }} models · {{ creator.provider_count }} providers
      </p>
    </div>

    <!-- Aggregate stats -->
    <div class="cd-aggregate">
      <div class="cd-stat">
        <span class="cd-stat-value">{{ formatContext(bestContext) }}</span>
        <span class="cd-stat-label">Best context</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value"
          >{{ formatPrice(cheapestInput) }}/{{ formatPrice(cheapestOutput) }}</span
        >
        <span class="cd-stat-label">Cheapest</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ topProvider }}</span>
        <span class="cd-stat-label">Most models</span>
      </div>
    </div>

    <!-- Model list -->
    <h3 class="section-title">Models</h3>
    <div class="cd-models">
      <ModelCard
        v-for="model in creator.models"
        :key="model.super_id"
        :model="model"
        :creator="creator"
        @model-click="openDetail(model)"
        @provider-click="openDetail(model)"
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
import ModelCard from '@/components/ModelCard.vue';
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

function formatPrice(price: number): string {
  if (price === 0) return 'Free';
  if (price < 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(0)}`;
}

const bestContext = computed(() => {
  if (!creator.value) return 0;
  const contexts = creator.value.models.map((m) => m.best_context).filter((ctx) => ctx !== null);
  return contexts.length > 0 ? Math.max(...contexts, 0) : 0;
});

const cheapestInput = computed(() => {
  if (!creator.value) return 0;
  return Math.min(...creator.value.models.map((m) => m.cheapest_input_price), Infinity);
});

const cheapestOutput = computed(() => {
  if (!creator.value) return 0;
  return Math.min(...creator.value.models.map((m) => m.cheapest_output_price), Infinity);
});

const topProvider = computed(() => {
  if (!creator.value) return '—';
  const counts: Record<string, number> = {};
  for (const model of creator.value.models) {
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

.cd-aggregate {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  margin: 16px 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}
.cd-stat {
  display: flex;
  flex-direction: column;
}
.cd-stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent);
}
.cd-stat-label {
  font-size: 0.68rem;
  color: var(--text-muted);
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
  .cd-aggregate {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
