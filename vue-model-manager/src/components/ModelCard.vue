<template>
  <div class="model-card" :class="[`card-${status}`, { 'card-expanded': expanded }]" @click="handleCardClick">
    <!-- Header -->
    <div class="mc-header">
      <div class="mc-header-left">
        <h3 class="mc-name">{{ model.name }}</h3>
        <span class="mc-creator-badge">{{ creator.name }}</span>
      </div>
      <div class="mc-header-right">
        <span v-for="(rank, role) in topRankings" :key="role" class="mc-ranking-badge">
          #{{ rank }} {{ roleLabel(role) }}
        </span>
      </div>
    </div>

    <!-- Summary stats -->
    <div class="mc-stats">
      <span class="mc-stat">Max: {{ formatContext(model.best_context) }} context</span>
      <span class="mc-stat-divider">|</span>
      <span class="mc-stat">Free</span>
      <span class="mc-stat-divider">|</span>
      <span class="mc-stat"
        >{{ activeProviderCount }} provider{{ activeProviderCount !== 1 ? 's' : '' }}</span
      >
      <span v-if="sourceSummaryText" class="mc-stat-divider">|</span>
      <span v-if="sourceSummaryText" class="mc-stat mc-source-line">{{ sourceSummaryText }}</span>
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
  const working = active.filter((p) => p.status.result === 'working').length;
  if (working === active.length) return 'working';
  if (working > 0) return 'mixed';
  return 'down';
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
  if (target.closest('.provider-block') || target.closest('.provider-strip-more')) return;
  emit('model-click');
}

function handleProviderClick(dp: ProviderDatapoint) {
  emit('provider-click', dp);
}

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

.mc-name {
  font-size: 0.92rem;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mc-creator-badge {
  padding: 2px 8px;
  font-size: 0.68rem;
  font-weight: 600;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
  flex-shrink: 0;
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
  .mc-name {
    font-size: 0.85rem;
  }
  .mc-header-right {
    display: none;
  }
}
</style>
