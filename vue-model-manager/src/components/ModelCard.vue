<template>
  <div class="model-card" :class="{ 'card-expanded': expanded }" @click="handleCardClick">
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
      <span class="mc-stat">{{ hasFreeProvider ? 'Free' : formatPrice(model.cheapest_input_price) + '/' + formatPrice(model.cheapest_output_price) }}</span>
      <span class="mc-stat-divider">|</span>
      <span class="mc-stat">{{ activeProviderCount }} provider{{ activeProviderCount !== 1 ? 's' : '' }}</span>
      <span class="mc-status-indicator" :class="`status-${status}`"></span>
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
import { ref, computed } from 'vue'
import ProviderStrip from '@/components/ProviderStrip.vue'
import type { ModelData, CreatorData, ProviderDatapoint } from '@/types'

const props = defineProps<{
  model: ModelData
  creator: CreatorData
}>()

const emit = defineEmits<{
  'model-click': []
  'provider-click': [dp: ProviderDatapoint]
}>()

const expanded = ref(false)

const status = computed(() => {
  const active = props.model.providers.filter(p => !p._removed)
  if (!active.length) return 'down'
  const working = active.filter(p => p.status.result === 'working').length
  if (working === active.length) return 'working'
  if (working > 0) return 'mixed'
  return 'down'
})

const activeProviderCount = computed(() => props.model.providers.filter(p => !p._removed).length)

const hasFreeProvider = computed(() =>
  props.model.providers.some(p => p.is_free && p.input_price_per_million === 0 && p.output_price_per_million === 0)
)

const topRankings = computed(() => {
  const rankings = props.model.role_rankings
  const result: Record<string, number> = {}
  let count = 0
  for (const [role, rank] of Object.entries(rankings)) {
    if (count >= 2) break
    result[role] = rank
    count++
  }
  return result
})

function handleCardClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.provider-block') || target.closest('.provider-strip-more')) return
  emit('model-click')
}

function handleProviderClick(dp: ProviderDatapoint) {
  emit('provider-click', dp)
}

function formatContext(ctx: number): string {
  if (!ctx) return '—'
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  return `${Math.round(ctx / 1000)}K`
}

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  if (price < 1) return `$${price.toFixed(2)}`
  return `$${price.toFixed(0)}`
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    model: 'Model', build: 'Build', general: 'General',
    small_model: 'Small', explore: 'Explore', stable: 'Stable',
  }
  return labels[role] || role
}
</script>

<style scoped>
.model-card {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.model-card:hover {
  border-color: var(--border);
}

.model-card.card-expanded {
  border-color: var(--accent);
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

.mc-status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: auto;
  flex-shrink: 0;
}

.mc-status-indicator.status-working { background: var(--green); box-shadow: 0 0 4px var(--green-glow); }
.mc-status-indicator.status-mixed { background: var(--orange); box-shadow: 0 0 4px var(--orange-glow); }
.mc-status-indicator.status-down { background: var(--red); box-shadow: 0 0 4px var(--red-glow); }
.mc-status-indicator.status-untested { background: var(--text-muted); }

@media (max-width: 768px) {
  .model-card { padding: 10px 12px; }
  .mc-name { font-size: 0.85rem; }
  .mc-header-right { display: none; }
}
</style>