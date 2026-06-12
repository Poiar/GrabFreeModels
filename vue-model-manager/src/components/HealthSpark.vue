<template>
  <div
    v-if="data"
    class="hs-wrap"
    :title="data.stability + '% stable · ' + data.latency_ms + 'ms avg'"
  >
    <svg viewBox="0 0 40 12" class="hs-svg">
      <polyline
        :points="data.points.map((p) => p.x + ',' + p.y).join(' ')"
        fill="none"
        :stroke="
          data.stability >= 80
            ? 'var(--green)'
            : data.stability >= 50
              ? 'var(--orange)'
              : 'var(--red)'
        "
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <span v-if="data.latency_ms" class="hs-latency">{{ data.latency_ms }}ms</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useModelsStore } from '@/store/models';

const props = defineProps<{ fullId: string; providerSlug: string }>();

const store = useModelsStore();

const data = computed(() => {
  const mh = store.getModelHealth(props.fullId);
  if (!mh?.snapshots?.length) return null;
  const recent = mh.snapshots.slice(0, 10).reverse();
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < recent.length; i++) {
    points.push({
      x: (i / Math.max(recent.length - 1, 1)) * 40,
      y: recent[i].status === 'working' ? 2 : recent[i].status === 'rate_limited' ? 6 : 10,
    });
  }
  const latencies = recent.filter((s) => s.latency_ms != null && s.status === 'working');
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b.latency_ms!, 0) / latencies.length)
    : null;
  return { points, stability: mh.stability, latency_ms: avgLatency };
});
</script>

<style scoped>
.hs-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}
.hs-svg {
  width: 40px;
  height: 12px;
  flex-shrink: 0;
}
.hs-latency {
  font-size: 0.58rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
}
</style>
