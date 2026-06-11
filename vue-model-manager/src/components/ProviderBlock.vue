<template>
  <div
    class="provider-block"
    :style="{ '--pb-color': getProviderColorMuted(dp.provider_slug), '--pb-color-main': getProviderColor(dp.provider_slug) }"
    :class="{
      expanded,
      'status-working': dp.status.result === 'working',
      'status-rate-limited': dp.status.result === 'rate_limited',
      'status-broken': dp.status.result === 'broken' || dp.status.result === 'not_found',
    }"
  >
    <div class="pb-header">
      <span class="pb-header-left">
        <span class="pb-name">{{ dp.provider }}</span>
        <span
          v-for="b in sourceBadges"
          :key="b.key"
          class="pb-source"
          :class="b.cssClass"
          :title="b.title"
          @click.stop="openSources"
        >{{ b.label }}</span>
      </span>
      <span class="pb-status-dot" :class="`dot-${dp.status.result}`"></span>
    </div>
    <div class="pb-stats">
      <span v-if="dp.quantization" class="pb-quant" :title="quantTitle(dp.quantization)">{{ dp.quantization.toUpperCase() }}</span>
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
      <span v-if="dp.supports_attachment" class="pb-cap" title="Attachment supported">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </span>
      <span v-if="dp.supports_structured_output" class="pb-cap" title="Structured output supported">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 18l6-6-6-6" />
          <path d="M8 6l-6 6 6 6" />
        </svg>
      </span>
    </div>
    <div class="pb-limits">
      <span class="pb-free-badge">Free</span>
      <span v-if="dp.limitations?.requires_card" class="pb-limit-icon" title="Requires credit card">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
      </span>
      <span v-if="dp.limitations?.daily_requests || dp.limitations?.daily_tokens" class="pb-limit-icon" title="Daily limit applies">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
      </span>
      <span v-if="dp.limitations?.rate_limit" class="pb-limit-icon" title="Rate limited">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
      </span>
      <span v-if="dp.limitations?.expires" class="pb-limit-icon" title="Expires: {{ dp.limitations.expires }}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ProviderDatapoint } from '@/types';
import { useModelsStore } from '@/store/models';
import { getProviderColor, getProviderColorMuted } from '@/data/provider-colors';

const props = defineProps<{
  dp: ProviderDatapoint;
  expanded?: boolean;
}>();

const store = useModelsStore();

const SOURCE_ABBREVIATIONS: Record<string, { label: string; cssClass: string }> = {
  'huggingface-hub': { label: 'HF', cssClass: 'source-hf' },
  modelsdev: { label: 'MD', cssClass: 'source-md' },
  mastra: { label: 'MS', cssClass: 'source-ms' },
  'openllm-leaderboard': { label: 'LL', cssClass: 'source-ll' },
  'free-llm-api-resources': { label: 'FR', cssClass: 'source-fr' },
};

const sourceBadges = computed(() => {
  const ids = props.dp.source_ids || [];
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
      // Fallback for unknown sources
      const isApi = s.source_type === 'api_provider';
      return {
        key: s.slug,
        label: isApi ? 'API' : s.name.slice(0, 12),
        title: s.name,
        cssClass: isApi ? 'source-api' : 'source-community',
      };
    });
});

function openSources() {
  store.requestSourcesPanel();
}

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

const QUANT_TITLES: Record<string, string> = {
  fp32: '32-bit full precision',
  fp16: '16-bit half precision',
  bf16: 'Brain floating point 16',
  fp8: '8-bit floating point',
  fp4: '4-bit floating point',
  int8: '8-bit integer quantization',
  int4: '4-bit integer quantization',
  gguf: 'GGUF quantized format',
  gptq: 'GPTQ 4-bit quantization',
  awq: 'AWQ 4-bit quantization',
  bnb: 'BitsAndBytes quantization',
  quantized: 'Quantized weights',
};

function quantTitle(q: string): string {
  return QUANT_TITLES[q] || `${q.toUpperCase()} quantized weights`;
}

</script>

<style scoped>
.provider-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--pb-color) 0%, var(--bg-elevated) 40%);
  border: 1px solid var(--border);
  border-left: 2px solid var(--pb-color, var(--border));
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

.pb-header-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.pb-name {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--pb-color-main, var(--text));
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
.dot-not_found {
  background: var(--text-muted);
}

.pb-stats {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pb-quant {
  font-size: 0.55rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(251, 146, 60, 0.12);
  color: #fb923c;
  letter-spacing: 0.04em;
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

.pb-cap {
  font-size: 0.68rem;
  display: flex;
  align-items: center;
}

.pb-limits {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pb-source {
  font-size: 0.55rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  cursor: pointer;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.source-api {
  background: var(--accent-subtle);
  color: var(--accent);
}

.source-community {
  background: var(--bg-elevated);
  color: var(--text-muted);
}

.source-hf {
  background: var(--badge-hf-bg);
  color: var(--badge-hf-text);
}

.source-md {
  background: var(--badge-md-bg);
  color: var(--badge-md-text);
}

.source-ms {
  background: var(--badge-ms-bg);
  color: var(--badge-ms-text);
}

.source-ll {
  background: var(--badge-ll-bg);
  color: var(--badge-ll-text);
}

.source-fr {
  background: var(--badge-fr-bg);
  color: var(--badge-fr-text);
}

.pb-free-badge {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--green);
}

.pb-limit-icon {
  color: var(--orange);
  display: flex;
  align-items: center;
}
</style>
