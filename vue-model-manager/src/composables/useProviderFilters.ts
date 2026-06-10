/**
 * Reusable provider list filter/sort/chip state.
 * Extracted from Providers.vue — any view that lists
 * providers can reuse this composable.
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { ProviderReference } from '@/types';

export interface ProviderFilterState {
  searchQuery: Ref<string>;
  sortBy: Ref<'name' | 'models' | 'workers' | 'country'>;
  sortAsc: Ref<boolean>;
  selectedHealth: Ref<string>;
  selectedContinent: Ref<string>;
  selectedType: Ref<string>;
}

export interface FilterChip {
  key: string;
  label: string;
  count: number;
}

export interface ProviderFilterResult {
  /** Reactive filter state (read/write) */
  filters: ProviderFilterState;
  /** Computed filtered + sorted providers */
  filtered: ComputedRef<ProviderReference[]>;
  /** Health filter chips */
  healthChips: ComputedRef<FilterChip[]>;
  /** Provider type filter chips */
  typeChips: ComputedRef<FilterChip[]>;
  /** Map of label constants shared by the view */
  labels: {
    PROVIDER_TYPE: Record<string, string>;
    CONTINENTS: string[];
  };
}

export const PROVIDER_TYPE_LABELS: Record<string, string> = {
  router: 'Router',
  inference: 'Inference',
  local: 'Local',
  discovery: 'Discovery',
};

export const CONTINENTS_ORDER = ['All', 'North America', 'Asia', 'Europe', 'South America', 'Africa', 'Oceania'];

export function useProviderFilters(
  providers: ComputedRef<ProviderReference[]>,
  resolveContinent: (slug: string) => { name: string; continent: string },
): ProviderFilterResult {
  const searchQuery = ref('');
  const sortBy = ref<'name' | 'models' | 'workers' | 'country'>('models');
  const sortAsc = ref(false);
  const selectedHealth = ref('All');
  const selectedContinent = ref('All');
  const selectedType = ref('All');

  const healthChips = computed((): FilterChip[] => {
    const counts: Record<string, number> = { healthy: 0, degraded: 0, down: 0 };
    for (const p of providers.value) {
      counts[p.health_status] = (counts[p.health_status] || 0) + 1;
    }
    return [
      { key: 'All', label: 'All', count: providers.value.length },
      { key: 'healthy', label: 'Healthy', count: counts.healthy || 0 },
      { key: 'degraded', label: 'Degraded', count: counts.degraded || 0 },
      { key: 'down', label: 'Down', count: counts.down || 0 },
    ];
  });

  const typeChips = computed((): FilterChip[] => {
    const counts: Record<string, number> = {};
    for (const p of providers.value) {
      const t = p.provider_type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    const chips: FilterChip[] = [
      { key: 'All', label: 'All types', count: providers.value.length },
    ];
    for (const [type, count] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
      chips.push({ key: type, label: PROVIDER_TYPE_LABELS[type] || type, count });
    }
    return chips;
  });

  const filtered = computed((): ProviderReference[] => {
    let list = [...providers.value];

    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
      );
    }

    if (selectedHealth.value !== 'All') {
      list = list.filter((p) => p.health_status === selectedHealth.value);
    }

    if (selectedContinent.value !== 'All') {
      list = list.filter(
        (p) => resolveContinent(p.slug).continent === selectedContinent.value,
      );
    }

    if (selectedType.value !== 'All') {
      list = list.filter((p) => (p.provider_type || 'unknown') === selectedType.value);
    }

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
        case 'workers':
          cmp = b.working_count - a.working_count;
          break;
        case 'country':
          cmp = resolveContinent(a.slug).name.localeCompare(resolveContinent(b.slug).name)
             || a.name.localeCompare(b.name);
          break;
      }
      return cmp * dir;
    });

    return list;
  });

  return {
    filters: { searchQuery, sortBy, sortAsc, selectedHealth, selectedContinent, selectedType },
    filtered,
    healthChips,
    typeChips,
    labels: { PROVIDER_TYPE: PROVIDER_TYPE_LABELS, CONTINENTS: CONTINENTS_ORDER },
  };
}
