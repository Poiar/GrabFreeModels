<template>
  <div class="family-list-page">
    <div class="page-header">
      <h2>Families</h2>
      <p>{{ store.visibleFamilies.length }} model families tracked<template v-if="store.isSourceFilterActive"> <span class="filtered-note">(filtered)</span></template></p>
    </div>

    <div class="fc-controls">
      <select v-model="sortBy" class="sort-select">
        <option value="creator">Sort: Creator</option>
        <option value="family">Sort: Family</option>
      </select>
      <button class="sort-dir-btn" @click="sortAsc = !sortAsc" :title="sortAsc ? 'Ascending' : 'Descending'">{{ sortAsc ? '↑' : '↓' }}</button>
    </div>

    <div class="family-grid">
      <router-link
        v-for="family in sortedFamilies"
        :key="family.name"
        :to="`/family/${encodeURIComponent(family.name)}`"
        class="family-card"
      >
        <div class="fc-icon-row">
          <ProviderIcon v-if="creatorSlug(family)" :slug="creatorSlug(family)!" :size="18" cls="fc-icon" />
          <svg v-else class="fc-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span class="fc-badge fc-badge-creator">{{ creatorName(family) }}</span>
          <span class="fc-badge-sep">/</span>
          <span class="fc-badge fc-badge-family">{{ formatFamilyName(family.name) }}</span>
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
import { ref, computed } from 'vue';
import { useModelsStore } from '@/store/models';
import ProviderIcon from '@/components/ProviderIcon.vue';
import type { FamilyData } from '@/types';

const store = useModelsStore();

const sortBy = ref<'creator' | 'family'>('creator');
const sortAsc = ref(true);

const sortedFamilies = computed(() => {
  const list = [...store.visibleFamilies];
  list.sort((a, b) => {
    let ca = creatorName(a);
    let cb = creatorName(b);
    let cmp: number;
    if (sortBy.value === 'family') {
      cmp = a.name.localeCompare(b.name);
      if (cmp !== 0) return sortAsc.value ? cmp : -cmp;
    }
    cmp = ca.localeCompare(cb);
    if (cmp !== 0) return sortAsc.value ? cmp : -cmp;
    return a.name.localeCompare(b.name);
  });
  return list;
});

function findCreator(family: FamilyData) {
  if (family.models.length === 0) return null;
  const firstModel = family.models[0];
  return store.creators.find((cr) => cr.models.some((m) => m.super_id === firstModel.super_id)) ?? null;
}

function creatorSlug(family: FamilyData): string | null {
  const c = findCreator(family);
  return c ? c.id : null;
}

function creatorName(family: FamilyData): string {
  const c = findCreator(family);
  return c ? c.name : 'Unknown';
}

const FAMILY_NAME_OVERRIDES: Record<string, string> = {
  gpt: 'GPT',
  glm: 'GLM',
};

function formatFamilyName(raw: string): string {
  if (raw === 'Uncategorized') return raw;
  return raw.split('-').map(w => FAMILY_NAME_OVERRIDES[w] ?? (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}
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

.fc-controls {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.sort-select {
  font-size: 0.72rem;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--text-muted);
  font-family: inherit;
  cursor: pointer;
}
.sort-select:focus {
  outline: none;
  border-color: var(--accent);
}
.sort-dir-btn {
  font-size: 0.8rem;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  font-family: monospace;
  line-height: 1;
}
.sort-dir-btn:hover {
  color: var(--text);
  border-color: var(--text-muted);
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
  gap: 4px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.fc-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--accent);
}
.fc-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}
.fc-badge-creator {
  background: var(--accent-subtle);
  color: var(--accent);
}
.fc-badge-family {
  background: rgba(52, 211, 153, 0.12);
  color: var(--green);
}
.fc-badge-sep {
  font-size: 0.65rem;
  color: var(--text-muted);
  flex-shrink: 0;
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
