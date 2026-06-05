<template>
  <div
    class="provider-block"
    :class="{
      expanded,
      'status-working': dp.status.result === 'working',
      'status-rate-limited': dp.status.result === 'rate_limited',
      'status-broken': dp.status.result === 'broken',
    }"
  >
    <div class="pb-header">
      <span class="pb-name">{{ dp.provider }}</span>
      <span class="pb-status-dot" :class="`dot-${dp.status.result}`"></span>
    </div>
    <div class="pb-stats">
      <span class="pb-context">{{ formatContext(dp.context_length) }}</span>
      <span v-if="dp.supports_tools" class="pb-tools" title="Tools supported">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span v-else class="pb-tools pb-tools-none" title="No tools">—</span>
    </div>
    <div class="pb-price">
      <template
        v-if="dp.is_free && dp.input_price_per_million === 0 && dp.output_price_per_million === 0"
        >Free</template
      >
      <template v-else
        >${{ formatPrice(dp.input_price_per_million) }}/${{
          formatPrice(dp.output_price_per_million)
        }}</template
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ProviderDatapoint } from '@/types';

defineProps<{
  dp: ProviderDatapoint;
  expanded?: boolean;
}>();

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

function formatPrice(price: number): string {
  if (price === 0) return '0';
  if (price < 1) return price.toFixed(2);
  return price.toFixed(0);
}
</script>

<style scoped>
.provider-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  min-width: 100px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.provider-block:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.provider-block.expanded {
  border-color: var(--accent);
  background: var(--bg-card);
}

.provider-block.status-working {
  border-left: 2px solid var(--green);
}

.provider-block.status-broken {
  border-left: 2px solid var(--red);
  opacity: 0.7;
}

.pb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.pb-name {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pb-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-working {
  background: var(--green);
  box-shadow: 0 0 4px var(--green-glow);
}
.dot-rate_limited {
  background: var(--orange);
  box-shadow: 0 0 4px var(--orange-glow);
}
.dot-broken {
  background: var(--red);
  box-shadow: 0 0 4px var(--red-glow);
}
.dot-untested,
.dot-paid,
.dot-not_found {
  background: var(--text-muted);
}

.pb-stats {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pb-context {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.pb-tools {
  color: var(--green);
  font-size: 0.68rem;
  display: flex;
  align-items: center;
}

.pb-tools-none {
  color: var(--text-muted);
  opacity: 0.5;
}

.pb-price {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--accent);
}
</style>
