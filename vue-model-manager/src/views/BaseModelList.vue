<template>
  <div class="bml-page">
    <div class="page-header">
      <h2>Base Models</h2>
      <p>{{ baseModelGroups.length }} base models with known derivatives</p>
    </div>

    <div class="bml-grid">
      <router-link
        v-for="item in baseModelGroups"
        :key="item.baseName"
        :to="`/base-model/${encodeURIComponent(item.baseName)}`"
        class="bml-card"
      >
        <h3 class="bml-name">{{ item.baseName }}</h3>
        <div class="bml-stats">
          <span class="bml-stat"
            >{{ item.derivativeCount }} derivative{{ item.derivativeCount !== 1 ? 's' : '' }}</span
          >
          <span class="bml-stat"
            >{{ item.derivativeCreatorCount }} derivative creator{{
              item.derivativeCreatorCount !== 1 ? 's' : ''
            }}</span
          >
        </div>
        <div class="bml-top">Top derivative creator: {{ item.topDerivativeCreator }}</div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useModelsStore } from '@/store/models';
import type { ModelData } from '@/types';

const store = useModelsStore();

const baseModelGroups = computed(() => {
  const groups: Record<string, { derivatives: ModelData[]; derivativeCreators: Set<string> }> = {};
  for (const creator of store.creators) {
    for (const model of creator.models) {
      const base = model.base_model;
      if (!base) continue;
      if (!groups[base]) groups[base] = { derivatives: [], derivativeCreators: new Set() };
      groups[base].derivatives.push(model);
      groups[base].derivativeCreators.add(creator.name);
    }
  }
  return Object.entries(groups)
    .map(([baseName, data]) => ({
      baseName,
      derivativeCount: data.derivatives.length,
      derivativeCreatorCount: data.derivativeCreators.size,
      topDerivativeCreator: [...data.derivativeCreators].sort()[0],
    }))
    .sort((a, b) => b.derivativeCount - a.derivativeCount);
});
</script>

<style scoped>
.bml-page {
  max-width: 1200px;
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
  margin: 0;
}

.bml-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.bml-card {
  display: block;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  text-decoration: none;
  color: var(--text);
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.bml-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.bml-name {
  font-size: 0.92rem;
  font-weight: 700;
  margin: 0 0 8px;
  line-height: 1.3;
}
.bml-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}
.bml-stat {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.bml-top {
  font-size: 0.72rem;
  color: var(--accent);
}

@media (max-width: 768px) {
  .bml-page {
    padding: 12px;
  }
  .bml-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
