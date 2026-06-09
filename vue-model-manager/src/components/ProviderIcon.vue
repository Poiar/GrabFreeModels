<template>
  <span class="pi-wrap" :class="[`pi-${size}`, cls]" :style="{ '--pi-color': color }">
    <img
      v-if="loaded"
      :src="`/logos/${slug}.svg`"
      :width="size"
      :height="size"
      class="pi-img"
      :alt="alt"
      @error="onError"
    />
    <svg
      v-else
      class="pi-svg"
      :viewBox="icon.viewBox"
      v-html="icon.body"
      :aria-label="alt"
    ></svg>
  </span>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { getProviderIcon } from '@/data/provider-icons';
import { getProviderColorMuted } from '@/data/provider-colors';

const props = withDefaults(
  defineProps<{
    slug: string;
    size?: number;
    alt?: string;
    cls?: string;
  }>(),
  {
    size: 24,
    alt: '',
    cls: '',
  },
);

const loaded = ref(true);
const icon = computed(() => getProviderIcon(props.slug));
const color = computed(() => getProviderColorMuted(props.slug));

function onError() {
  loaded.value = false;
}
</script>

<style scoped>
.pi-wrap {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  width: v-bind('`${size}px`');
  height: v-bind('`${size}px`');
  background: var(--pi-color);
}

.pi-img,
.pi-svg {
  border-radius: 4px;
  display: inline-block;
  width: v-bind('`${size}px`');
  height: v-bind('`${size}px`');
}

.pi-img {
  filter: invert(1);
}
</style>
