<template>
  <span v-if="rank != null && rank > 0" class="rb" :class="levelClass">{{ rank }}</span>
  <span v-else class="rb rb-na">—</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  rank?: number | null;
}>();

const levelClass = computed(() => {
  if (!props.rank) return 'rb-na';
  if (props.rank <= 3) return 'rb-top';
  if (props.rank <= 10) return 'rb-high';
  if (props.rank <= 25) return 'rb-mid';
  return 'rb-low';
});
</script>

<style scoped>
.rb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  padding: 1px 6px;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
}

.rb-top {
  background: rgba(99, 128, 247, 0.15);
  color: #6380f7;
}

.rb-high {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
}

.rb-mid {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.rb-low {
  background: rgba(248, 113, 113, 0.1);
  color: #f87171;
}

.rb-na {
  background: transparent;
  color: var(--text-dim);
}
</style>
