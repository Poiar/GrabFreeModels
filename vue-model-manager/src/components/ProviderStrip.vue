<template>
  <div class="provider-strip">
    <ProviderBlock
      v-for="dp in visibleProviders"
      :key="dp.full_id"
      :dp="dp"
      class="provider-strip-item"
      @click="$emit('provider-click', dp)"
    />
    <button v-if="overflowCount > 0" class="provider-strip-more" @click="$emit('expand')">
      +{{ overflowCount }} more
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ProviderBlock from '@/components/ProviderBlock.vue';
import type { ProviderDatapoint } from '@/types';

const props = withDefaults(
  defineProps<{
    providers: ProviderDatapoint[];
    maxVisible?: number;
  }>(),
  {
    maxVisible: 5,
  },
);

defineEmits<{
  'provider-click': [dp: ProviderDatapoint];
  expand: [];
}>();

const visibleProviders = computed(() => props.providers.slice(0, props.maxVisible));
const overflowCount = computed(() => Math.max(0, props.providers.length - props.maxVisible));
</script>

<style scoped>
.provider-strip {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 0;
}

.provider-strip-more {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 0.7rem;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px dashed var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  transition:
    color 0.15s,
    border-color 0.15s;
}

.provider-strip-more:hover {
  color: var(--accent);
  border-color: var(--accent);
}
</style>
