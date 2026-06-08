<template>
  <div class="family-list-page">
    <div class="page-header">
      <h2>Families</h2>
      <p>{{ store.visibleFamilies.length }} model families tracked<template v-if="store.isSourceFilterActive"> <span class="filtered-note">(filtered)</span></template></p>
    </div>

    <div class="family-grid">
      <router-link
        v-for="family in store.visibleFamilies"
        :key="family.name"
        :to="`/family/${encodeURIComponent(family.name)}`"
        class="family-card"
      >
        <div class="fc-icon-row">
          <svg class="fc-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <h3 class="fc-name">{{ family.name }}</h3>
        </div>
        <div class="fc-stats">
          <span class="fc-stat">{{ family.model_count }} model{{ family.model_count !== 1 ? 's' : '' }}</span>
          <span class="fc-stat">{{ family.provider_count }} provider{{ family.provider_count !== 1 ? 's' : '' }}</span>
        </div>
        <div v-if="family.models.length" class="fc-top">Top: {{ family.models[0].name }}</div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModelsStore } from '@/store/models';
const store = useModelsStore();
</script>

<style scoped>
.family-list-page {
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

.filtered-note {
  color: var(--accent);
  font-weight: 600;
}

.family-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.family-card {
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
.family-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.fc-icon-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.fc-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--accent);
}
.fc-name {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
}
.fc-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}
.fc-stat {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.fc-top {
  font-size: 0.72rem;
  color: var(--accent);
}

@media (max-width: 768px) {
  .family-list-page {
    padding: 12px;
  }
  .family-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
