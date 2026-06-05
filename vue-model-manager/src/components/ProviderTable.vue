<template>
  <div class="provider-table-wrap">
    <table class="provider-table">
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            class="pt-head"
            :class="{ sortable: col.sortable }"
            @click="col.sortable && sortBy(col.key)"
          >
            {{ col.label }}
            <span v-if="sortKey === col.key" class="sort-arrow">{{ sortAsc ? '▲' : '▼' }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="dp in sortedProviders" :key="dp.full_id" class="pt-row">
          <td class="pt-cell pt-name">{{ dp.provider }}</td>
          <td class="pt-cell">{{ formatContext(dp.context_length) }}</td>
          <td class="pt-cell pt-icon">
            <svg
              v-if="dp.supports_tools"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--green)"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span v-else class="dash">—</span>
          </td>
          <td class="pt-cell pt-icon">
            <svg
              v-if="dp.supports_reasoning"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span v-else class="dash">—</span>
          </td>
          <td class="pt-cell pt-icon">
            <svg
              v-if="hasInputType(dp, 'image')"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span v-else class="dash">—</span>
          </td>
          <td class="pt-cell pt-price">{{ formatPrice(dp.input_price_per_million) }}</td>
          <td class="pt-cell pt-price">{{ formatPrice(dp.output_price_per_million) }}</td>
          <td class="pt-cell pt-status">
            <span class="status-badge" :class="`badge-${dp.status.result}`">{{
              statusLabel(dp.status.result)
            }}</span>
          </td>
          <td class="pt-cell pt-time">{{ formatTime(dp.last_success) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="pt-caption">{{ providers.length }} available providers</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ProviderDatapoint } from '@/types';

const props = defineProps<{
  providers: ProviderDatapoint[];
}>();

const sortKey = ref<string>('');
const sortAsc = ref(true);

const columns = [
  { key: 'provider', label: 'Provider', sortable: true },
  { key: 'context', label: 'Context', sortable: true },
  { key: 'tools', label: 'Tools', sortable: false },
  { key: 'reasoning', label: 'Reasoning', sortable: false },
  { key: 'image', label: 'Image', sortable: false },
  { key: 'input_price', label: 'Input $/1M', sortable: true },
  { key: 'output_price', label: 'Output $/1M', sortable: true },
  { key: 'status', label: 'Status', sortable: false },
  { key: 'last_success', label: 'Last Success', sortable: true },
];

function sortBy(key: string) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = true;
  }
}

const sortedProviders = computed(() => {
  if (!sortKey.value) return props.providers;
  return [...props.providers].sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortKey.value) {
      case 'provider':
        aVal = a.provider;
        bVal = b.provider;
        break;
      case 'context':
        aVal = a.context_length || 0;
        bVal = b.context_length || 0;
        break;
      case 'input_price':
        aVal = a.input_price_per_million;
        bVal = b.input_price_per_million;
        break;
      case 'output_price':
        aVal = a.output_price_per_million;
        bVal = b.output_price_per_million;
        break;
      case 'last_success':
        aVal = a.last_success || '';
        bVal = b.last_success || '';
        break;
      default:
        return 0;
    }
    if (aVal < bVal) return sortAsc.value ? -1 : 1;
    if (aVal > bVal) return sortAsc.value ? 1 : -1;
    return 0;
  });
});

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

function hasInputType(dp: ProviderDatapoint, type: string): boolean {
  return (dp.input_types || []).includes(type);
}

function statusLabel(result: string): string {
  return result.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = diff / 3_600_000;
  if (hours < 1) return '<1h ago';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
</script>

<style scoped>
.provider-table-wrap {
  overflow-x: auto;
}

.provider-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.pt-head {
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  font-size: 0.72rem;
}

.pt-head.sortable {
  cursor: pointer;
  user-select: none;
}

.pt-head.sortable:hover {
  color: var(--text);
}

.sort-arrow {
  margin-left: 4px;
  font-size: 0.65rem;
  color: var(--accent);
}

.pt-row {
  border-bottom: 1px solid var(--border);
}

.pt-row:hover {
  background: var(--bg-elevated);
}

.pt-cell {
  padding: 8px 10px;
  white-space: nowrap;
}

.pt-name {
  font-weight: 600;
}

.pt-icon {
  text-align: center;
}

.dash {
  color: var(--text-muted);
  opacity: 0.5;
}

.pt-price {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.badge-working {
  color: var(--green);
  font-weight: 600;
}
.badge-rate_limited {
  color: var(--orange);
  font-weight: 600;
}
.badge-broken {
  color: var(--red);
  font-weight: 600;
}
.badge-untested {
  color: var(--text-muted);
}
.badge-paid {
  color: var(--purple, #a78bfa);
  font-weight: 600;
}
.badge-not_found {
  color: var(--text-muted);
}

.pt-time {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.pt-caption {
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 8px 0;
  text-align: center;
}
</style>
