<template>
  <div class="empty-state" role="status">
    <svg class="empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <component :is="iconComponent" />
    </svg>
    <p class="empty-message">{{ message }}</p>
    <p v-if="hint" class="empty-hint">{{ hint }}</p>
    <button v-if="action" class="empty-action" @click="action.handler">{{ action.label }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue';

const props = withDefaults(defineProps<{
  message?: string;
  hint?: string;
  action?: { label: string; handler: () => void } | null;
  icon?: 'search' | 'alert' | 'data' | 'broken';
}>(), {
  message: 'No data available',
  hint: '',
  action: null,
  icon: 'data',
});

const iconPaths: Record<string, () => any> = {
  search: () => [h('circle', { cx: 11, cy: 11, r: 8 }), h('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })],
  alert: () => [h('path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' }), h('line', { x1: 12, y1: 9, x2: 12, y2: 13 }), h('line', { x1: 12, y1: 17, x2: 12.01, y2: 17 })],
  data: () => [h('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }), h('polyline', { points: '7 10 12 15 17 10' }), h('line', { x1: 12, y1: 15, x2: 12, y2: 3 })],
  broken: () => [h('path', { d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }), h('line', { x1: 12, y1: 9, x2: 12, y2: 13 }), h('line', { x1: 12, y1: 17, x2: 12.01, y2: 17 })],
};
const iconComponent = computed(() => iconPaths[props.icon] || iconPaths.data);
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  border-radius: 12px;
  background: var(--bg-card, rgba(255, 255, 255, 0.02));
  border: 1px dashed var(--border, rgba(255, 255, 255, 0.06));
  margin: 16px 0;
}
.empty-icon {
  color: var(--text-muted);
  opacity: 0.4;
  margin-bottom: 12px;
}
.empty-message {
  font-size: 0.9rem;
  color: var(--text-dim);
  margin: 0 0 4px;
}
.empty-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0 0 12px;
  max-width: 280px;
}
.empty-action {
  margin-top: 8px;
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: 0.78rem;
  cursor: pointer;
}
.empty-action:hover {
  background: var(--accent);
  color: #fff;
}
</style>
