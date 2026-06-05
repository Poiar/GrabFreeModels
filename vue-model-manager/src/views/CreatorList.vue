<template>
  <div class="creator-list-page">
    <div class="page-header">
      <h2>Creators</h2>
      <p>{{ store.creators.length }} model creators tracked</p>
    </div>

    <div class="creator-grid">
      <router-link
        v-for="creator in store.creators"
        :key="creator.id"
        :to="`/creator/${creator.id}`"
        class="creator-card"
      >
        <h3 class="cc-name">{{ creator.name }}</h3>
        <div class="cc-stats">
          <span class="cc-stat"
            >{{ creator.model_count }} model{{ creator.model_count !== 1 ? 's' : '' }}</span
          >
          <span class="cc-stat"
            >{{ creator.provider_count }} provider{{
              creator.provider_count !== 1 ? 's' : ''
            }}</span
          >
        </div>
        <div v-if="creator.models.length" class="cc-top">Top: {{ creator.models[0].name }}</div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModelsStore } from '@/store/models';
const store = useModelsStore();
</script>

<style scoped>
.creator-list-page {
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

.creator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.creator-card {
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
.creator-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.cc-name {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 8px;
}
.cc-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}
.cc-stat {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.cc-top {
  font-size: 0.72rem;
  color: var(--accent);
}

@media (max-width: 768px) {
  .creator-list-page {
    padding: 12px;
  }
  .creator-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
