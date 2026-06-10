<template>
  <div class="creator-list-page">
    <div class="page-header">
      <h2>Creators</h2>
      <p>{{ allCreators.length }} model creators tracked<template v-if="store.isSourceFilterActive"> <span class="filtered-note">(filtered)</span></template></p>
    </div>

    <div class="cc-controls">
      <button
        class="cc-paid-toggle"
        :class="{ active: showPaid }"
        @click="showPaid = !showPaid"
      >{{ showPaid ? 'Paid · Free' : 'Free · Paid' }}</button>
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Search creators..."
      />
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
      >{{ c === 'All' ? `All (${allCreators.length})` : `${c} (${continentCount(c)})` }}</button>
    </div>

    <!-- Labs section -->
    <div v-if="sortedLabCreators.length" class="cc-section">
      <div class="cc-section-header">
        <h3 class="cc-section-title">Labs</h3>
        <span class="cc-section-count">{{ sortedLabCreators.length }} creator{{ sortedLabCreators.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="creator-grid">
        <router-link
          v-for="creator in sortedLabCreators"
          :key="creator.id"
          :to="`/creator/${creator.id}`"
          class="creator-card"
        >
          <div class="cc-icon-row">
            <ProviderIcon :slug="creator.id" :size="24" cls="cc-icon" />
            <h3 class="cc-name">{{ creator.name }}</h3>
          </div>
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
          <span
            class="cc-country"
            :style="{ color: getCountryForCreator(creator.id).text, background: getCountryForCreator(creator.id).color }"
          >{{ getCountryForCreator(creator.id).name }}</span>
          <div v-if="getFamilies(creator).length" class="cc-families">
            <span v-for="f in getFamilies(creator).slice(0, 4)" :key="f" class="cc-family-tag">{{ f }}</span>
            <span v-if="getFamilies(creator).length > 4" class="cc-family-tag cc-family-more">+{{ getFamilies(creator).length - 4 }}</span>
          </div>
          <div v-if="creator.models.length" class="cc-top">Top: {{ creator.models[0].name }}</div>
        </router-link>
      </div>
    </div>

    <!-- Users section -->
    <div v-if="sortedUserCreators.length" class="cc-section">
      <div class="cc-section-header">
        <h3 class="cc-section-title">Users</h3>
        <span class="cc-section-count">{{ sortedUserCreators.length }} creator{{ sortedUserCreators.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="creator-grid">
        <router-link
          v-for="creator in sortedUserCreators"
          :key="creator.id"
          :to="`/creator/${creator.id}`"
          class="creator-card"
        >
          <div class="cc-icon-row">
            <ProviderIcon :slug="creator.id" :size="24" cls="cc-icon" />
            <h3 class="cc-name">{{ creator.name }}</h3>
          </div>
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
          <span class="cc-role-badge">{{ creator.role }}</span>
          <div v-if="getFamilies(creator).length" class="cc-families">
            <span v-for="f in getFamilies(creator).slice(0, 4)" :key="f" class="cc-family-tag">{{ f }}</span>
            <span v-if="getFamilies(creator).length > 4" class="cc-family-tag cc-family-more">+{{ getFamilies(creator).length - 4 }}</span>
          </div>
          <div v-if="creator.models.length" class="cc-top">Top: {{ creator.models[0].name }}</div>
        </router-link>
      </div>
    </div>

    <!-- Other section (placeholders / unknown) -->
    <div v-if="sortedOtherCreators.length" class="cc-section">
      <div class="cc-section-header">
        <h3 class="cc-section-title">Other</h3>
        <span class="cc-section-count">{{ sortedOtherCreators.length }} placeholder{{ sortedOtherCreators.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="creator-grid">
        <router-link
          v-for="creator in sortedOtherCreators"
          :key="creator.id"
          :to="`/creator/${creator.id}`"
          class="creator-card cc-other-card"
        >
          <div class="cc-icon-row">
            <ProviderIcon :slug="creator.id" :size="24" cls="cc-icon" />
            <h3 class="cc-name">{{ creator.name }}</h3>
          </div>
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
          <div v-if="getFamilies(creator).length" class="cc-families">
            <span v-for="f in getFamilies(creator).slice(0, 4)" :key="f" class="cc-family-tag">{{ f }}</span>
            <span v-if="getFamilies(creator).length > 4" class="cc-family-tag cc-family-more">+{{ getFamilies(creator).length - 4 }}</span>
          </div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useModelsStore } from '@/store/models';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { getCountryForCreator, CONTINENTS } from '@/data/creator-countries';
import type { CreatorData } from '@/types';
const store = useModelsStore();

const searchQuery = ref('');
const sortBy = ref<'name' | 'models' | 'providers' | 'country'>('name');
const sortAsc = ref(true);
const selectedContinent = ref('All');
const showPaid = ref(false);

// Source list — free or paid creators, with type/role from the data builder
const allCreators = computed(() => showPaid.value ? store.paidCreators : store.visibleCreators);

// Lazy-load paid data when toggling
watch(showPaid, (val) => { if (val) store.loadPaidData(); });
onMounted(() => { store.loadPaidData(); });

function continentCount(continent: string): number {
  let count = 0;
  for (const c of allCreators.value) {
    if (getCountryForCreator(c.id).continent === continent) count++;
  }
  return count;
}

const filteredCreators = computed(() => {
  let list = allCreators.value;

  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((c) => c.name.toLowerCase().includes(q));
  }

  if (selectedContinent.value !== 'All') {
    list = list.filter(
      (c) => getCountryForCreator(c.id).continent === selectedContinent.value,
    );
  }

  return list;
});

function sortCreatorList(list: CreatorData[]): CreatorData[] {
  const dir = sortAsc.value ? 1 : -1;
  return [...list].sort((a, b) => {
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
}

const sortedLabCreators = computed(() =>
  sortCreatorList(filteredCreators.value.filter((c) => c.type === 'lab')),
);

const sortedUserCreators = computed(() =>
  sortCreatorList(filteredCreators.value.filter((c) => c.type === 'user')),
);

const sortedOtherCreators = computed(() =>
  sortCreatorList(filteredCreators.value.filter((c) => c.type === 'other')),
);

function getFamilies(creator: CreatorData): string[] {
  const families = new Set<string>();
  for (const m of creator.models) {
    if (m.family) families.add(m.family);
  }
  return [...families].sort();
}
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
  color: var(--text-dim);
  margin: 0;
}

.filtered-note {
  color: var(--accent);
  font-weight: 600;
}

.cc-paid-toggle {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-dim);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: color 0.12s, border-color 0.12s;
}
.cc-paid-toggle:hover {
  color: var(--text);
  border-color: var(--text-dim);
}
.cc-paid-toggle.active {
  color: #fb923c;
  border-color: #fb923c;
  background: rgba(251, 146, 60, 0.08);
}

.cc-controls {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.search-input {
  font-size: 0.72rem;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--text);
  font-family: inherit;
  min-width: 200px;
  flex: 1;
  max-width: 320px;
}
.search-input::placeholder { color: var(--text-dim); }
.search-input:focus {
  outline: none;
  border-color: var(--accent);
}
.sort-select {
  font-size: 0.72rem;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--text-dim);
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
  color: var(--text-dim);
  cursor: pointer;
  font-family: monospace;
  line-height: 1;
}
.sort-dir-btn:hover {
  color: var(--text);
  border-color: var(--text-dim);
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
  color: var(--text-dim);
  cursor: pointer;
  font-family: inherit;
  transition: color 0.12s, background 0.12s, border-color 0.12s;
}
.cc-continent-btn:hover {
  color: var(--text);
  border-color: var(--text-dim);
}
.cc-continent-btn.active {
  color: var(--accent);
  background: var(--accent-subtle);
  border-color: var(--accent);
}

.cc-section {
  margin-top: 24px;
}

.cc-section:first-child {
  margin-top: 16px;
}

.cc-section-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.cc-section-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
  color: var(--text);
}

.cc-section-count {
  font-size: 0.68rem;
  color: var(--text-dim);
  font-weight: 500;
}

.creator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
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

.cc-other-card {
  opacity: 0.65;
}
.cc-other-card:hover {
  opacity: 1;
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
  color: var(--text-dim);
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

.cc-role-badge {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 7px;
  border-radius: 3px;
  margin-bottom: 6px;
  color: #818cf8;
  background: rgba(99, 102, 241, 0.14);
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
  color: var(--text-dim);
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
  .creator-list-page {
    padding: 12px;
  }
  .creator-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
