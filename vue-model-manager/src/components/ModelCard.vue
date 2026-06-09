<template>
  <div class="model-card" :class="[`card-${status}`, { 'card-expanded': expanded }]" @click="handleCardClick">
    <!-- Header -->
    <div class="mc-header">
      <div class="mc-header-left">
        <span class="mc-badge mc-badge-creator">
          <ProviderIcon :slug="creator.id" :size="16" cls="mc-creator-icon" />
          <span v-else class="mc-creator-icon-fb">{{ (creator.name || '?')[0] }}</span>
          {{ creator.name }}
          <button class="copy-btn-badge" title="Copy creator" @click.stop="copyText(creator.name)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        </span>
        <span class="mc-badge-sep">/</span>
        <span class="mc-badge mc-badge-model">
          <span class="mc-model-icon-fb">{{ model.name[0] }}</span>
          {{ model.name }}
          <button class="copy-btn-badge" title="Copy name" @click.stop="copyText(model.name)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        </span>
      </div>
      <div class="mc-header-right">
        <span v-for="(rank, role) in topRankings" :key="role" class="mc-ranking-badge">
          #{{ rank }} {{ roleLabel(role) }}
        </span>
      </div>
    </div>

    <!-- Summary stats -->
    <div class="mc-stats">
      <span class="mc-stat">{{ contextLabel }}</span>
      <span class="mc-stat-divider">|</span>
      <span class="mc-stat">Free</span>
      <span class="mc-stat-divider">|</span>
      <span class="mc-stat"
        >{{ activeProviderCount }} provider{{ activeProviderCount !== 1 ? 's' : '' }}</span
      >
      <span v-if="sourceSummaryText" class="mc-stat-divider">|</span>
      <span v-if="sourceSummaryText" class="mc-stat mc-source-line">{{ sourceSummaryText }}</span>
      <router-link v-if="model.base_model" :to="`/model/${model.base_model}`" class="mc-finetune-badge" :class="derivationBadgeClass" :title="derivationTitle" @click.stop>
        {{ derivationLabel }}
      </router-link>
      <span v-if="derivationDepth >= 2" class="mc-depth-badge">Gen {{ derivationDepth }}</span>
      <span v-else-if="baseCreatorLabel" class="mc-base-creator-badge">{{ baseCreatorLabel }}</span>
      <span v-if="limitBadges.card" class="mc-limit-warn" title="Credit card required by some providers">Card</span>
      <span v-if="limitBadges.sub" class="mc-limit-warn" :title="limitBadges.sub">Sub</span>
      <span v-if="limitBadges.daily" class="mc-limit-info" :title="limitBadges.daily">~{{ limitBadges.daily }}/day</span>
      <span v-if="limitBadges.tokenDay" class="mc-limit-info" :title="limitBadges.tokenDay">~{{ limitBadges.tokenDay }}/day</span>
      <span v-if="limitBadges.expires" class="mc-limit-info" :title="'Expires: ' + limitBadges.expires">Exp.</span>
      <span v-if="limitBadges.rate" class="mc-limit-info" :title="limitBadges.rate">Rate</span>
      <span class="mc-status-pulse" :class="`pulse-${status}`"></span>
    </div>

    <!-- Provider strip -->
    <ProviderStrip
      :providers="model.providers"
      :max-visible="expanded ? 12 : 5"
      @provider-click="handleProviderClick"
      @expand="expanded = true"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import ProviderStrip from '@/components/ProviderStrip.vue';
import type { ModelData, CreatorData, ProviderDatapoint } from '@/types';
import { useModelsStore } from '@/store/models';
import { useToast } from '@/composables/useToast';
import ProviderIcon from '@/components/ProviderIcon.vue';

const props = defineProps<{
  model: ModelData;
  creator: CreatorData;
}>();

const emit = defineEmits<{
  'model-click': [];
  'provider-click': [dp: ProviderDatapoint];
}>();

const expanded = ref(false);

const store = useModelsStore();

const DERIVATION_META: Record<string, { label: string; cssClass: string }> = {
  finetune: { label: 'FT', cssClass: 'deriv-ft' },
  merge: { label: 'Merge', cssClass: 'deriv-merge' },
  distillation: { label: 'Distill', cssClass: 'deriv-distill' },
  dpo: { label: 'DPO', cssClass: 'deriv-dpo' },
  continued_pretraining: { label: 'CPT', cssClass: 'deriv-cpt' },
  lora_adapter: { label: 'LoRA', cssClass: 'deriv-lora' },
  unknown: { label: 'Derived', cssClass: 'deriv-unknown' },
};

const baseModelName = computed(() => {
  if (!props.model.base_model) return '';
  const parent = store.modelBySlug.get(props.model.base_model);
  return parent ? parent.name : props.model.base_model;
});

const derivationMeta = computed(() => {
  const method = props.model.derivation_method;
  if (method && DERIVATION_META[method]) return DERIVATION_META[method];
  return DERIVATION_META.unknown;
});

const derivationLabel = computed(() => {
  const name = baseModelName.value;
  if (!name) return derivationMeta.value.label;
  return `${derivationMeta.value.label}: ${name}`;
});

const derivationBadgeClass = computed(() => derivationMeta.value.cssClass);

const derivationTitle = computed(() => {
  const method = props.model.derivation_method || 'derived';
  const name = baseModelName.value;
  if (!name) return `${method} model`;
  return `${method} of ${name} — click to see base model`;
});

const derivationDepth = computed(() => {
  if (!props.model.base_model) return 0;
  let depth = 0;
  let slug: string | null = props.model.base_model;
  while (slug) {
    depth++;
    const parent = store.modelBySlug.get(slug);
    slug = parent?.base_model ?? null;
  }
  return depth;
});

const baseCreatorLabel = computed(() => {
  if (props.model.base_model) return ''; // already showing derivation badge
  if (!props.model.base_creator) return '';
  if (props.model.base_creator === props.model.creator) return '';
  return `Based on ${props.model.base_creator}`;
});

const sourceSummary = computed(() => {
  let api = 0;
  let community = 0;
  for (const p of props.model.providers) {
    if (p._removed) continue;
    const ids = p.source_ids || [];
    const hasApi = ids.some((id) =>
      store.sources.some((s) => s.id === id && s.source_type === 'api_provider'),
    );
    const hasCommunity = ids.some((id) =>
      store.sources.some((s) => s.id === id && s.source_type === 'community_list'),
    );
    if (hasApi) api++;
    if (hasCommunity) community++;
  }
  return { api, community };
});

const sourceSummaryText = computed(() => {
  const s = sourceSummary.value;
  const parts: string[] = [];
  if (s.api > 0) parts.push(`${s.api} API`);
  if (s.community > 0) parts.push(`${s.community} community`);
  return parts.join(' · ');
});

const status = computed(() => {
  const active = props.model.providers.filter((p) => !p._removed);
  if (!active.length) return 'down';

  let working = 0, broken = 0, limited = 0, untested = 0;
  for (const p of active) {
    const result = p.status.result;
    if (result === 'working') working++;
    else if (result === 'broken' || result === 'not_found') broken++;
    else if (result === 'rate_limited') limited++;
    else untested++;
  }

  if (working === active.length) return 'working';
  if (working > 0) return 'mixed';
  if (broken > 0) return 'broken';
  if (limited > 0) return 'limited';
  return 'untested';
});

const activeProviderCount = computed(() => props.model.providers.filter((p) => !p._removed).length);

const limitBadges = computed(() => {
  const badges: Record<string, string> = {};
  for (const p of props.model.providers) {
    if (p._removed || !p.limitations) continue;
    const l = p.limitations;
    if (l.requires_card && !badges.card) badges.card = 'Card req.';
    if (l.subscription_required && !badges.sub) badges.sub = l.subscription_required;
    if (l.expires && !badges.expires) badges.expires = l.expires;
    if (l.rate_limit && !badges.rate) badges.rate = l.rate_limit;
    if (l.daily_requests !== undefined && (!badges.daily || l.daily_requests < parseInt(badges.daily))) {
      badges.daily = String(l.daily_requests >= 1000 ? `${(l.daily_requests / 1000).toFixed(1).replace(/\.0$/, '')}K` : l.daily_requests);
    }
    if (l.daily_tokens !== undefined && (!badges.tokenDay || l.daily_tokens < parseInt(badges.tokenDay))) {
      badges.tokenDay = String(l.daily_tokens >= 1000 ? `${(l.daily_tokens / 1000).toFixed(1).replace(/\.0$/, '')}K` : l.daily_tokens);
    }
  }
  return badges;
});

const topRankings = computed(() => {
  const rankings = props.model.role_rankings;
  const result: Record<string, number> = {};
  let count = 0;
  for (const [role, rank] of Object.entries(rankings)) {
    if (count >= 2) break;
    result[role] = rank;
    count++;
  }
  return result;
});

function handleCardClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest('.provider-block') || target.closest('.provider-strip-more') || target.closest('.copy-btn-badge')) return;
  emit('model-click');
}


const { success: toastSuccess } = useToast();

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toastSuccess(`"${text}" copied`); } catch { /* noop */ }
}

function handleProviderClick(dp: ProviderDatapoint) {
  emit('provider-click', dp);
}

const contextLabel = computed(() => {
  const maxCtx = props.model.best_context;
  const minCtx = props.model.min_context;
  if (!maxCtx && !minCtx) return '— context';
  if (!minCtx || minCtx === maxCtx) return `Max: ${formatContext(maxCtx!)} context`;
  return `${formatContext(minCtx)}–${formatContext(maxCtx!)} context`;
});

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    model: 'Model',
    build: 'Build',
    general: 'General',
    small_model: 'Small',
    explore: 'Explore',
    stable: 'Stable',
  };
  return labels[role] || role;
}
</script>

<style scoped>
.model-card {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  transition:
    border-color 0.15s,
    border-left-color 0.3s,
    box-shadow 0.15s;
}

.model-card.card-working {
  border-left-color: var(--green);
}

.model-card.card-mixed {
  border-left-color: var(--orange);
}

.model-card.card-down {
  border-left-color: var(--red);
}

.model-card.card-limited {
  border-left-color: var(--orange);
}

.model-card.card-broken {
  border-left-color: var(--red);
}

.model-card.card-untested {
  border-left-color: var(--text-muted);
}

.model-card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
}

.model-card.card-expanded {
  border-color: var(--accent);
  box-shadow: var(--shadow-glow);
}

.mc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.mc-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mc-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
}

.mc-badge-creator {
  background: var(--accent-subtle);
  color: var(--accent);
}

.mc-badge-model {
  background: rgba(52, 211, 153, 0.12);
  color: var(--green);
}

.mc-badge-sep {
  font-size: 0.65rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.mc-creator-icon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
}

.mc-creator-icon-fb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 0.52rem;
  font-weight: 800;
  text-transform: uppercase;
  flex-shrink: 0;
}

.mc-model-icon-fb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 0.52rem;
  font-weight: 800;
  text-transform: uppercase;
  flex-shrink: 0;
}

.copy-btn-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.12s;
}

.mc-badge:hover .copy-btn-badge,
.copy-btn-badge:focus-visible {
  opacity: 1;
}

.mc-header-right {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.mc-ranking-badge {
  padding: 2px 8px;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.15);
  color: var(--green);
}

.mc-stats {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.mc-stat-divider {
  color: var(--border);
}

.mc-finetune-badge {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
  flex-shrink: 0;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s;
}
.mc-finetune-badge:hover {
  background: rgba(99, 102, 241, 0.22);
}
.mc-finetune-badge.deriv-ft { background: rgba(99, 102, 241, 0.12); color: #818cf8; }
.mc-finetune-badge.deriv-ft:hover { background: rgba(99, 102, 241, 0.22); }
.mc-finetune-badge.deriv-merge { background: rgba(168, 85, 247, 0.12); color: #a855f7; }
.mc-finetune-badge.deriv-merge:hover { background: rgba(168, 85, 247, 0.22); }
.mc-finetune-badge.deriv-distill { background: rgba(236, 72, 153, 0.12); color: #ec4899; }
.mc-finetune-badge.deriv-distill:hover { background: rgba(236, 72, 153, 0.22); }
.mc-finetune-badge.deriv-dpo { background: rgba(34, 211, 238, 0.12); color: #22d3ee; }
.mc-finetune-badge.deriv-dpo:hover { background: rgba(34, 211, 238, 0.22); }
.mc-finetune-badge.deriv-cpt { background: rgba(250, 204, 21, 0.12); color: #eab308; }
.mc-finetune-badge.deriv-cpt:hover { background: rgba(250, 204, 21, 0.22); }
.mc-finetune-badge.deriv-lora { background: rgba(52, 211, 153, 0.12); color: #34d399; }
.mc-finetune-badge.deriv-lora:hover { background: rgba(52, 211, 153, 0.22); }
.mc-finetune-badge.deriv-unknown { background: rgba(156, 163, 175, 0.12); color: #9ca3af; }
.mc-finetune-badge.deriv-unknown:hover { background: rgba(156, 163, 175, 0.22); }

.mc-base-creator-badge {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.15);
  color: #f59e0b;
  flex-shrink: 0;
}

.mc-depth-badge {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.1);
  color: #a5b4fc;
  flex-shrink: 0;
}

.mc-limit-warn {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--red);
  flex-shrink: 0;
}

.mc-limit-info {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.15);
  color: var(--orange);
  flex-shrink: 0;
}

.mc-status-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: auto;
  flex-shrink: 0;
}

.mc-status-pulse.pulse-working {
  background: var(--green);
  box-shadow: 0 0 6px var(--green-glow);
  animation: pulse-dot 2s var(--ease-smooth, ease-in-out) infinite;
}

.mc-status-pulse.pulse-mixed {
  background: var(--orange);
  box-shadow: 0 0 6px var(--orange-glow);
  animation: pulse-dot 1.5s var(--ease-smooth, ease-in-out) infinite;
}

.mc-status-pulse.pulse-down {
  background: var(--red);
  box-shadow: 0 0 6px var(--red-glow);
  animation: pulse-dot-error 1.5s var(--ease-smooth, ease-in-out) infinite;
}

.mc-status-pulse.pulse-untested {
  background: var(--text-muted);
}

@media (max-width: 768px) {
  .model-card {
    padding: 10px 12px;
  }
  .mc-badge {
    font-size: 0.7rem;
    padding: 2px 8px;
  }
  .mc-header-right {
    display: none;
  }
}
</style>
