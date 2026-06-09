<template>
  <div class="deriv-list-page">
    <div class="page-header">
      <h2>Derivatives</h2>
      <p>{{ derivatives.length }} derivatives tracked<template v-if="store.isSourceFilterActive"> <span class="filtered-note">(filtered)</span></template></p>
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
      >{{ c === 'All' ? `All (${derivatives.length})` : `${c} (${continentCount(c)})` }}</button>
    </div>

    <div class="creator-grid">
      <router-link
        v-for="creator in sortedCreators"
        :key="creator.id"
        :to="`/derivative/${creator.id}`"
        class="creator-card glass-card"
        :style="{ '--cc-color': getCountryForCreator(creator.id).color, '--cc-color-muted': getCountryNameForStyle(creator.id) }"
      >
        <div class="cc-header">
          <ProviderIcon :slug="creator.id" :size="32" />
          <div class="cc-name-group">
            <h3 class="cc-name">{{ creator.name }}</h3>
          </div>
          <span
            class="cc-country"
            :style="{ color: getCountryForCreator(creator.id).text, background: getCountryForCreator(creator.id).color }"
          >{{ getCountryForCreator(creator.id).name }}</span>
          <span class="cc-deriv-badge" :title="derivTooltip(creator)">{{ derivLabel(creator) }}</span>
        </div>

        <div class="cc-stats">
          <div class="cc-stat">
            <span class="cc-stat-val">{{ creator.model_count }}</span>
            <span class="cc-stat-lbl">Models</span>
          </div>
          <div class="cc-stat">
            <span class="cc-stat-val">{{ creator.provider_count }}</span>
            <span class="cc-stat-lbl">Providers</span>
          </div>
          <div class="cc-stat">
            <span class="cc-stat-val working">{{ workingCount(creator) }}</span>
            <span class="cc-stat-lbl">Working</span>
          </div>
        </div>

        <div class="cc-bar-track">
          <div
            class="cc-bar-fill"
            :style="{ width: creator.model_count ? ((workingCount(creator) || 0) / creator.model_count * 100) + '%' : '0%' }"
          ></div>
        </div>

        <div v-if="getBaseCreators(creator).length" class="cc-base-creators">
          <span v-for="bc in getBaseCreators(creator).slice(0, 4)" :key="bc" class="cc-base-chip">{{ bc }}</span>
          <span v-if="getBaseCreators(creator).length > 4" class="cc-base-chip cc-base-more">+{{ getBaseCreators(creator).length - 4 }}</span>
        </div>

        <div v-if="getFamilies(creator).length" class="cc-families">
          <span v-for="f in getFamilies(creator).slice(0, 4)" :key="f" class="cc-family-tag">{{ f }}</span>
          <span v-if="getFamilies(creator).length > 4" class="cc-family-tag cc-family-more">+{{ getFamilies(creator).length - 4 }}</span>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useModelsStore } from '@/store/models';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { getCountryForCreator, CONTINENTS } from '@/data/creator-countries';
import type { CreatorData } from '@/types';
const store = useModelsStore();

const sortBy = ref<'name' | 'models' | 'providers' | 'country'>('models');
const sortAsc = ref(false);
const selectedContinent = ref('All');

const derivatives = computed(() =>
  store.creators.filter((c) =>
    c.models.some((m) => {
      // Has explicit derivation metadata from HF → definitely a derivative
      if (m.derivation_method && m.derivation_method !== 'foundation') return true;
      // Fallback: heuristic base_creator different from creator
      return m.base_creator && m.base_creator !== m.creator;
    }),
  ),
);

function continentCount(continent: string): number {
  let count = 0;
  for (const c of derivatives.value) {
    if (getCountryForCreator(c.id).continent === continent) count++;
  }
  return count;
}

const filteredCreators = computed(() => {
  if (selectedContinent.value === 'All') return derivatives.value;
  return derivatives.value.filter(
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

function workingCount(creator: CreatorData): number {
  let count = 0;
  for (const m of creator.models) {
    for (const dp of m.providers) {
      if (!dp._removed && dp.status.result === 'working') count++;
    }
  }
  return count;
}

const DERIV_CARD_LABELS: Record<string, string> = {
  finetune: 'FT', merge: 'Merge', distillation: 'Distill', dpo: 'DPO',
  continued_pretraining: 'CPT', lora_adapter: 'LoRA',
};

function derivLabel(creator: CreatorData): string {
  const counts: Record<string, number> = {};
  for (const m of creator.models) {
    const method = m.derivation_method || 'unknown';
    counts[method] = (counts[method] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? (DERIV_CARD_LABELS[top[0]] || 'Derived') : 'Derived';
}

function derivTooltip(creator: CreatorData): string {
  const counts: Record<string, number> = {};
  for (const m of creator.models) {
    const method = m.derivation_method || 'unknown';
    counts[method] = (counts[method] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([m, c]) => `${DERIV_CARD_LABELS[m] || m}: ${c}`)
    .join(', ');
}

function getCountryNameForStyle(_id: string): string {
  return '';
}
</script>

<style scoped>
.deriv-list-page {
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

.creator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.creator-card {
  display: block;
  padding: 16px;
  cursor: pointer;
  position: relative;
  text-decoration: none;
  color: var(--text);
}

.creator-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--cc-color);
  border-radius: 8px 0 0 8px;
  pointer-events: none;
  z-index: 1;
}

.cc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.cc-name-group {
  flex: 1;
  min-width: 0;
}

.cc-name {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--cc-color);
}

.cc-country {
  font-size: 0.55rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.cc-deriv-badge {
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.03em;
  flex-shrink: 0;
  background: rgba(168, 85, 247, 0.12);
  color: #a855f7;
}

.cc-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 10px;
}

.cc-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cc-stat-val {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
}

.cc-stat-val.working { color: var(--green); }

.cc-stat-lbl {
  font-size: 0.62rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cc-bar-track {
  height: 3px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  margin-bottom: 10px;
  overflow: hidden;
}

.cc-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--green);
  transition: width 0.4s;
}

.cc-base-creators {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.cc-base-chip {
  font-size: 0.62rem;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(168, 85, 247, 0.1);
  color: #a855f7;
  font-weight: 600;
  white-space: nowrap;
}

.cc-base-chip.cc-base-more {
  background: var(--bg-hover);
  color: var(--text-dim);
}

.cc-families {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.cc-family-tag {
  font-size: 0.62rem;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
  white-space: nowrap;
}

.cc-family-more {
  background: var(--bg-hover);
  color: var(--text-dim);
}

@media (max-width: 768px) {
  .deriv-list-page {
    padding: 12px;
  }
  .creator-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
