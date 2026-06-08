<template>
  <div class="ft-list-page">
    <div class="page-header">
      <h2>Fine Tuners</h2>
      <p>{{ fineTuners.length }} fine-tuners tracked<template v-if="store.isSourceFilterActive"> <span class="filtered-note">(filtered)</span></template></p>
    </div>

    <div class="cc-controls">
      <select v-model="sortBy" class="sort-select">
        <option value="name">Sort: Name</option>
        <option value="models">Sort: Models</option>
        <option value="providers">Sort: Providers</option>
        <option value="country">Sort: Country</option>
      </select>
      <button class="sort-dir-btn" @click="sortAsc = !sortAsc" :title="sortAsc ? 'Ascending' : 'Descending'">{{ sortAsc ? '↑' : '↓' }}</button>
    </div>

    <div class="cc-continent-filters">
      <button
        v-for="c in CONTINENTS"
        :key="c"
        class="cc-continent-btn"
        :class="{ active: selectedContinent === c }"
        @click="selectedContinent = c"
      >{{ c === 'All' ? `All (${fineTuners.length})` : `${c} (${continentCount(c)})` }}</button>
    </div>

    <div class="creator-grid">
      <router-link
        v-for="creator in sortedCreators"
        :key="creator.id"
        :to="`/fine-tuner/${creator.id}`"
        class="creator-card"
      >
        <div class="cc-icon-row">
          <svg class="cc-icon" :viewBox="getProviderIcon(creator.id).viewBox" v-html="getProviderIcon(creator.id).body"></svg>
          <h3 class="cc-name">{{ creator.name }}</h3>
        </div>
        <div class="cc-stats">
          <span class="cc-stat">{{ creator.model_count }} model{{ creator.model_count !== 1 ? 's' : '' }}</span>
          <span class="cc-stat">{{ creator.provider_count }} provider{{ creator.provider_count !== 1 ? 's' : '' }}</span>
        </div>
        <span
          class="cc-country"
          :style="{ color: getCountryForCreator(creator.id).text, background: getCountryForCreator(creator.id).color }"
        >{{ getCountryForCreator(creator.id).name }}</span>
        <div v-if="getBaseCreators(creator).length" class="ft-base-creators">
          <span class="ft-base-label">builds on</span>
          <span v-for="bc in getBaseCreators(creator).slice(0, 3)" :key="bc" class="ft-base-tag">{{ bc }}</span>
          <span v-if="getBaseCreators(creator).length > 3" class="ft-base-tag ft-base-more">+{{ getBaseCreators(creator).length - 3 }}</span>
        </div>
        <div v-if="getFamilies(creator).length" class="cc-families">
          <span v-for="f in getFamilies(creator).slice(0, 4)" :key="f" class="cc-family-tag">{{ f }}</span>
          <span v-if="getFamilies(creator).length > 4" class="cc-family-tag cc-family-more">+{{ getFamilies(creator).length - 4 }}</span>
        </div>
        <div v-if="creator.models.length" class="cc-top">Top: {{ creator.models[0].name }}</div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useModelsStore } from '@/store/models';
import { getProviderIcon } from '@/data/provider-icons';
import { getCountryForCreator, CONTINENTS } from '@/data/creator-countries';
import type { CreatorData } from '@/types';
const store = useModelsStore();

const sortBy = ref<'name' | 'models' | 'providers' | 'country'>('models');
const sortAsc = ref(false);
const selectedContinent = ref('All');

const fineTuners = computed(() =>
  store.creators.filter((c) =>
    c.models.some((m) => m.base_creator && m.base_creator !== m.creator),
  ),
);

function continentCount(continent: string): number {
  let count = 0;
  for (const c of fineTuners.value) {
    if (getCountryForCreator(c.id).continent === continent) count++;
  }
  return count;
}

const filteredCreators = computed(() => {
  if (selectedContinent.value === 'All') return fineTuners.value;
  return fineTuners.value.filter(
    (c) => getCountryForCreator(c.id).continent === selectedContinent.value,
  );
});

const sortedCreators = computed(() => {
  const list = [...filteredCreators.value];
  const dir = sortAsc.value ? 1 : -1;
  list.sort((a, b) => {
    let cmp = 0;
    switch (sortBy.value) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'models':
        cmp = b.model_count - a.model_count;
        break;
      case 'providers':
        cmp = b.provider_count - a.provider_count;
        break;
      case 'country':
        cmp = getCountryForCreator(a.id).name.localeCompare(getCountryForCreator(b.id).name)
           || a.name.localeCompare(b.name);
        break;
    }
    return cmp * dir;
  });
  return list;
});

function getFamilies(creator: CreatorData): string[] {
  const families = new Set<string>();
  for (const m of creator.models) {
    if (m.family) families.add(m.family);
  }
  return [...families].sort();
}

function getBaseCreators(creator: CreatorData): string[] {
  const bases = new Set<string>();
  for (const m of creator.models) {
    if (m.base_creator && m.base_creator !== m.creator) {
      bases.add(m.base_creator);
    }
  }
  return [...bases].sort();
}
</script>

<style scoped>
.ft-list-page {
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

.cc-controls {
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

.cc-continent-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.cc-continent-btn {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 3px 12px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  font-family: inherit;
  transition: color 0.12s, background 0.12s, border-color 0.12s;
}
.cc-continent-btn:hover {
  color: var(--text);
  border-color: var(--text-muted);
}
.cc-continent-btn.active {
  color: var(--accent);
  background: var(--accent-subtle);
  border-color: var(--accent);
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
  transition: border-color 0.15s, box-shadow 0.15s;
}
.creator-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.cc-icon-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.cc-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 4px;
}
.cc-name {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
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
.cc-country {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 7px;
  border-radius: 3px;
  margin-bottom: 6px;
}

.ft-base-creators {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}
.ft-base-label {
  font-size: 0.6rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ft-base-tag {
  font-size: 0.64rem;
  padding: 1px 7px;
  border-radius: 3px;
  background: rgba(168, 85, 247, 0.1);
  color: #a855f7;
  font-weight: 600;
}
.ft-base-more {
  color: var(--accent);
  background: var(--accent-subtle);
}

.cc-families {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}
.cc-family-tag {
  font-size: 0.62rem;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  white-space: nowrap;
}
.cc-family-more {
  color: var(--accent);
}
.cc-top {
  font-size: 0.72rem;
  color: var(--accent);
}

@media (max-width: 768px) {
  .ft-list-page {
    padding: 12px;
  }
  .creator-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
