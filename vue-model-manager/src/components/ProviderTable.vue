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
          <td class="pt-cell pt-name">
            <ProviderIcon :slug="dp.provider_slug" :size="16" :cls="'pt-logo'" />
            {{ dp.provider }}
          </td>
          <td class="pt-cell pt-source">
            <span
              v-for="b in getSourceBadges(dp)"
              :key="b.key"
              class="pt-source-badge"
              :class="b.cssClass"
              :title="b.title"
              >{{ b.label }}</span
            >
            <span v-if="getSourceBadges(dp).length === 0" class="dash">—</span>
          </td>
          <td class="pt-cell">{{ formatContext(dp.context_length) }}</td>
          <td class="pt-cell pt-knowledge">{{ formatKnowledge(dp.knowledge_cutoff) }}</td>
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
          <td class="pt-cell pt-icon">
            <svg
              v-if="dp.supports_attachment"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--blue)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
              />
            </svg>
            <span v-else class="dash">—</span>
          </td>
          <td class="pt-cell pt-icon">
            <svg
              v-if="dp.supports_structured_output"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--purple)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M16 18l6-6-6-6" />
              <path d="M8 6l-6 6 6 6" />
            </svg>
            <span v-else class="dash">—</span>
          </td>
          <td class="pt-cell pt-limits">
            <span v-if="!dp.limitations" class="dash">—</span>
            <span v-else class="pt-limit-text" :title="dp.limitations.notes">{{
              limitSummary(dp)
            }}</span>
          </td>
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
import { useModelsStore } from '@/store/models';
import ProviderIcon from '@/components/ProviderIcon.vue';

const props = defineProps<{
  providers: ProviderDatapoint[];
}>();

const store = useModelsStore();

const sortKey = ref<string>('');
const sortAsc = ref(true);

const columns = [
  { key: 'provider', label: 'Provider', sortable: true },
  { key: 'source', label: 'Source', sortable: false },
  { key: 'context', label: 'Context', sortable: true },
  { key: 'knowledge', label: 'Knowledge', sortable: true },
  { key: 'tools', label: 'Tools', sortable: false },
  { key: 'reasoning', label: 'Reasoning', sortable: false },
  { key: 'image', label: 'Image', sortable: false },
  { key: 'attachment', label: 'Attach', sortable: false },
  { key: 'structured_output', label: 'Struct', sortable: false },
  { key: 'limits', label: 'Limits', sortable: false },
  { key: 'status', label: 'Status', sortable: false },
  { key: 'last_success', label: 'Last Success', sortable: true },
];

const SOURCE_ABBREVIATIONS: Record<string, { label: string; cssClass: string }> = {
  'huggingface-hub': { label: 'HF', cssClass: 'source-hf' },
  modelsdev: { label: 'MD', cssClass: 'source-md' },
  mastra: { label: 'MS', cssClass: 'source-ms' },
  'openllm-leaderboard': { label: 'LL', cssClass: 'source-ll' },
  'free-llm-api-resources': { label: 'FR', cssClass: 'source-fr' },
};

function getSourceBadges(
  dp: ProviderDatapoint,
): { key: string; label: string; title: string; cssClass: string }[] {
  const ids = dp.source_ids || [];
  if (ids.length === 0) return [];
  const sourceById: Record<number, { slug: string; name: string; source_type: string }> = {};
  for (const s of store.sources) {
    sourceById[s.id] = { slug: s.slug, name: s.name, source_type: s.source_type };
  }
  return ids
    .map((id) => sourceById[id])
    .filter(Boolean)
    .map((s) => {
      const abbr = SOURCE_ABBREVIATIONS[s.slug];
      if (abbr) return { key: s.slug, label: abbr.label, title: s.name, cssClass: abbr.cssClass };
      const isApi = s.source_type === 'api_provider';
      return {
        key: s.slug,
        label: isApi ? 'API' : s.name.slice(0, 12),
        title: s.name,
        cssClass: isApi ? 'source-api' : 'source-community',
      };
    });
}

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
      case 'knowledge':
        aVal = a.knowledge_cutoff || '';
        bVal = b.knowledge_cutoff || '';
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

function formatKnowledge(k: string | null): string {
  if (!k) return '—';
  const m = k.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : k.slice(0, 7);
}

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

function limitSummary(dp: ProviderDatapoint): string {
  const l = dp.limitations;
  if (!l) return '—';
  const parts: string[] = [];
  if (l.requires_card) parts.push('Card req.');
  if (l.daily_requests) parts.push(`${l.daily_requests.toLocaleString()}/day`);
  else if (l.daily_tokens) parts.push(`${(l.daily_tokens / 1000).toFixed(0)}K tok/day`);
  if (l.rate_limit && parts.length === 0) parts.push(l.rate_limit);
  if (l.expires) parts.push(`Exp. ${l.expires}`);
  return parts.length > 0 ? parts.join(' · ') : l.notes?.slice(0, 60) || 'Limited';
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
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.pt-logo {
  border-radius: 3px;
}

.pt-knowledge {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.pt-source {
  white-space: nowrap;
}

.pt-source-badge {
  font-size: 0.55rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pt-source-badge.source-api {
  background: var(--accent-subtle);
  color: var(--accent);
}

.pt-source-badge.source-community {
  background: var(--bg-elevated);
  color: var(--text-muted);
}

.pt-source-badge.source-hf {
  background: var(--badge-hf-bg);
  color: var(--badge-hf-text);
}

.pt-source-badge.source-md {
  background: var(--badge-md-bg);
  color: var(--badge-md-text);
}

.pt-source-badge.source-ms {
  background: var(--badge-ms-bg);
  color: var(--badge-ms-text);
}

.pt-source-badge.source-ll {
  background: var(--badge-ll-bg);
  color: var(--badge-ll-text);
}

.pt-source-badge.source-fr {
  background: var(--badge-fr-bg);
  color: var(--badge-fr-text);
}

.pt-icon {
  text-align: center;
}

.dash {
  color: var(--text-muted);
  opacity: 0.5;
}

.pt-limits {
  max-width: 200px;
}

.pt-limit-text {
  font-size: 0.7rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
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
