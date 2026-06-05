<template>
  <div class="skeleton" :class="`skeleton-${variant}`" :style="style">
    <div v-if="variant === 'card'" class="skeleton-card-inner">
      <div class="skeleton-line skeleton-line-sm" style="width: 30%"></div>
      <div class="skeleton-line" style="width: 85%"></div>
      <div class="skeleton-line" style="width: 60%"></div>
      <div class="skeleton-line skeleton-line-sm" style="width: 40%"></div>
    </div>
    <div v-else-if="variant === 'row'" class="skeleton-row-inner">
      <div class="skeleton-line" style="width: 25%"></div>
      <div class="skeleton-line" style="width: 15%"></div>
      <div class="skeleton-line" style="width: 20%"></div>
      <div class="skeleton-line" style="width: 10%"></div>
    </div>
    <div v-else-if="variant === 'stat'" class="skeleton-stat-inner">
      <div class="skeleton-line skeleton-line-sm" style="width: 60%"></div>
      <div class="skeleton-line skeleton-line-lg" style="width: 40%"></div>
    </div>
    <div v-else-if="variant === 'text'">
      <div
        v-for="i in lines"
        :key="i"
        class="skeleton-line"
        :style="{ width: i === lines ? '60%' : '100%' }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'card' | 'row' | 'stat' | 'text';
    width?: string;
    height?: string;
    lines?: number;
  }>(),
  {
    variant: 'text',
    width: '100%',
    height: 'auto',
    lines: 3,
  },
);

const style = computed(() => ({
  width: props.width,
  height: props.height,
}));
</script>

<style scoped>
.skeleton {
  --skeleton-bg: var(--bg-hover, #1e2538);
  --skeleton-shine: rgba(255, 255, 255, 0.04);
}

.skeleton-card-inner,
.skeleton-row-inner,
.skeleton-stat-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}

.skeleton-row-inner {
  flex-direction: row;
  align-items: center;
  gap: 16px;
}

.skeleton-stat-inner {
  gap: 6px;
}

.skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: var(--skeleton-bg);
  position: relative;
  overflow: hidden;
}

.skeleton-line::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, var(--skeleton-shine) 50%, transparent 100%);
  animation: skeleton-shine 1.8s ease-in-out infinite;
}

.skeleton-line-sm {
  height: 10px;
}

.skeleton-line-lg {
  height: 22px;
}

@keyframes skeleton-shine {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line::after {
    animation: none;
    display: none;
  }
}
</style>
