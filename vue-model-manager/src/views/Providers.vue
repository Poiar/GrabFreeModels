<template>
  <div>
    <div class="page-header">
      <h2>Providers</h2>
      <p>{{ store.visibleProviderRefs.length }} API provider{{ store.visibleProviderRefs.length !== 1 ? 's' : '' }} hosting free models<template v-if="store.isSourceFilterActive"> <span class="filtered-note">(filtered)</span></template></p>
    </div>

    <div class="cc-controls">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Search providers..."
      />
      <select v-model="sortBy" class="sort-select">
        <option value="name">Sort: Name</option>
        <option value="models">Sort: Models</option>
        <option value="workers">Sort: Workers</option>
        <option value="country">Sort: Country</option>
      </select>
      <button class="sort-dir-btn" @click="sortAsc = !sortAsc" :title="sortAsc ? 'Ascending' : 'Descending'">{{ sortAsc ? '↑' : '↓' }}</button>
    </div>

    <div class="cc-chip-filters">
      <button
        v-for="h in healthChips"
        :key="h.key"
        class="cc-chip-btn"
        :class="{ active: selectedHealth === h.key }"
        @click="selectedHealth = selectedHealth === h.key ? 'All' : h.key"
      >{{ h.key === 'All' ? `All (${store.visibleProviderRefs.length})` : `${h.label} (${h.count})` }}</button>
    </div>

    <div class="cc-continent-filters">
      <button
        v-for="c in CONTINENTS"
        :key="c"
        class="cc-continent-btn"
        :class="{ active: selectedContinent === c }"
        @click="selectedContinent = c"
      >{{ c === 'All' ? `All (${store.visibleProviderRefs.length})` : `${c} (${continentCount(c)})` }}</button>
    </div>

    <div class="cc-type-filters">
      <button
        v-for="t in typeChips"
        :key="t.key"
        class="cc-type-btn"
        :class="{ active: selectedType === t.key }"
        @click="selectedType = selectedType === t.key ? 'All' : t.key"
      >{{ t.key === 'All' ? `All types (${store.visibleProviderRefs.length})` : `${t.label} (${t.count})` }}</button>
    </div>

    <div class="providers-grid">
      <router-link
        v-for="provider in filtered"
        :key="provider.slug"
        :to="`/provider/${provider.slug}`"
        class="provider-card glass-card"
        :style="{ '--pc-color-muted': getProviderColorMuted(provider.slug), '--pc-color': getProviderColor(provider.slug) }"
      >
        <div class="pc-header">
          <ProviderIcon :slug="provider.slug" :size="32" />
          <div class="pc-name-group">
            <h3 class="pc-name">{{ provider.name }}<button class="copy-btn-sm" title="Copy name" @click.stop="copyText(provider.name)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></h3>
            <span class="pc-slug">{{ provider.slug }}</span>
          </div>
          <span
            class="pc-country"
            :style="{ color: getCountryForProvider(provider.slug).text, background: getCountryForProvider(provider.slug).color }"
          >{{ getCountryForProvider(provider.slug).name }}</span>
          <span class="pc-status" :class="provider.health_status">
            {{ provider.health_status }}
          </span>
          <span v-if="provider.provider_type" class="pc-type-badge" :class="provider.provider_type">
            {{ PROVIDER_TYPE_LABELS[provider.provider_type] || provider.provider_type }}
          </span>
        </div>

        <div class="pc-stats">
          <div class="pc-stat">
            <span class="pc-stat-val">{{ provider.model_count }}</span>
            <span class="pc-stat-lbl">Instances</span>
          </div>
          <div class="pc-stat">
            <span class="pc-stat-val free">{{ providerModels[provider.slug]?.length || 0 }}</span>
            <span class="pc-stat-lbl">Free</span>
          </div>
          <div class="pc-stat">
            <span class="pc-stat-val working">{{ provider.working_count }}</span>
            <span class="pc-stat-lbl">Working</span>
          </div>
        </div>

        <div class="pc-bar-track">
          <div
            class="pc-bar-fill"
            :class="provider.health_status"
            :style="{ width: provider.model_count ? (provider.working_count / provider.model_count * 100) + '%' : '0%' }"
          ></div>
        </div>

        <div v-if="provider.base_url" class="pc-url">{{ provider.base_url }}</div>

        <div class="pc-models">
          <div
            v-for="m in providerModels[provider.slug]?.slice(0, 6)"
            :key="m.super_id"
            class="pc-model-chip"
          >
            {{ m.name }}
          </div>
          <div v-if="(providerModels[provider.slug]?.length || 0) > 6" class="pc-model-chip more">
            +{{ (providerModels[provider.slug]?.length || 0) - 6 }} more
          </div>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useModelsStore } from '@/store/models';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { useToast } from '@/composables/useToast';
import { getProviderColor, getProviderColorMuted } from '@/data/provider-colors';
import { getCountryForProvider, CONTINENTS } from '@/data/provider-countries';
import { useProviderFilters, PROVIDER_TYPE_LABELS } from '@/composables/useProviderFilters';

const store = useModelsStore();

const { filters, filtered, healthChips, typeChips } = useProviderFilters(
  computed(() => store.visibleProviderRefs),
  (slug) => getCountryForProvider(slug),
);

// Destructure filter refs so template bindings resolve directly
const { searchQuery, sortBy, sortAsc, selectedHealth, selectedContinent, selectedType } = filters;

function continentCount(continent: string): number {
  let count = 0;
  for (const p of store.visibleProviderRefs) {
    if (getCountryForProvider(p.slug).continent === continent) count++;
  }
  return count;
}

const providerModels = computed(() => {
  const map: Record<string, { super_id: number; name: string }[]> = {};
  for (const model of store.visibleModels) {
    for (const dp of model.providers) {
      const slug = dp.provider_slug;
      if (!map[slug]) map[slug] = [];
      // dedupe by super_id within a provider
      if (!map[slug].some((m) => m.super_id === model.super_id)) {
        map[slug].push({ super_id: model.super_id, name: model.name });
      }
    }
  }
  for (const slug of Object.keys(map)) {
    map[slug].sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
});

const { success: toastSuccess } = useToast();

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toastSuccess(`"${text}" copied`); } catch { /* noop */ }
}
</script>

<style scoped>
.page-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.page-header p { font-size: 0.78rem; color: var(--text-dim); margin: 0 0 16px; }
.filtered-note { color: var(--accent); font-weight: 600; }

.cc-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
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
  color: var(--text-dim);
  font-size: 0.72rem;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-card);
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

.cc-chip-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.cc-chip-btn {
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
.cc-chip-btn:hover {
  color: var(--text);
  border-color: var(--text-dim);
}
.cc-chip-btn.active {
  color: var(--accent);
  background: var(--accent-subtle);
  border-color: var(--accent);
}

.cc-continent-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
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

.cc-type-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}
.cc-type-btn {
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
.cc-type-btn:hover {
  color: var(--text);
  border-color: var(--text-dim);
}
.cc-type-btn.active {
  color: var(--accent);
  background: var(--accent-subtle);
  border-color: var(--accent);
}

.pc-type-badge {
  font-size: 0.56rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}
.pc-type-badge.router { background: rgba(139,92,246,0.12); color: #A78BFA; }
.pc-type-badge.inference { background: rgba(59,130,246,0.12); color: #60A5FA; }
.pc-type-badge.local { background: rgba(16,185,129,0.12); color: #34D399; }
.pc-type-badge.discovery { background: rgba(245,158,11,0.12); color: #FBBF24; }
.pc-type-badge.unknown { background: rgba(156,163,175,0.12); color: #9CA3AF; }

.providers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.provider-card {
  display: block;
  position: relative;
  padding: 16px;
  cursor: pointer;
  text-decoration: none;
}

.provider-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--pc-color);
  border-radius: 8px 0 0 8px;
  pointer-events: none;
  z-index: 1;
}

.pc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.pc-name-group {
  flex: 1;
  min-width: 0;
}

.pc-name {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--pc-color);
}

.copy-btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 1px;
  border-radius: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s, color 0.12s;
}

.pc-name:hover .copy-btn-sm,
.copy-btn-sm:focus-visible {
  opacity: 1;
}

.copy-btn-sm:hover {
  color: var(--accent);
}

.pc-slug {
  font-size: 0.62rem;
  color: var(--text-dim);
  font-family: 'JetBrains Mono', monospace;
}

.pc-country {
  font-size: 0.58rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.pc-status {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.pc-status.healthy { background: rgba(63,185,80,0.12); color: var(--green); }
.pc-status.degraded { background: rgba(251,191,36,0.12); color: var(--orange); }
.pc-status.down { background: rgba(248,113,113,0.12); color: var(--red); }

.pc-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 10px;
}

.pc-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pc-stat-val {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
}

.pc-stat-val.working { color: var(--green); }
.pc-stat-val.free { color: var(--accent); }
.pc-stat-val.down { color: var(--red); }

.pc-stat-lbl {
  font-size: 0.62rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pc-bar-track {
  height: 3px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  margin-bottom: 10px;
  overflow: hidden;
}

.pc-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s;
}

.pc-bar-fill.healthy { background: var(--green); }
.pc-bar-fill.degraded { background: var(--orange); }
.pc-bar-fill.down { background: var(--red); }

.pc-url {
  font-size: 0.58rem;
  color: var(--text-dim);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 10px;
  opacity: 0.7;
}

.pc-models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pc-model-chip {
  padding: 2px 7px;
  font-size: 0.62rem;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
  white-space: nowrap;
}

.pc-model-chip.more {
  background: var(--bg-hover);
  color: var(--text-dim);
}

@media (max-width: 768px) {
  .providers-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .providers-grid {
    grid-template-columns: 1fr;
  }
}
</style>
