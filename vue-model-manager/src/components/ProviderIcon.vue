<template>
  <img
    v-if="loaded"
    :src="`/logos/${slug}.svg`"
    :width="size"
    :height="size"
    class="pi-img"
    :class="[`pi-${size}`, cls]"
    :alt="alt"
    @error="onError"
  />
  <svg
    v-else
    class="pi-svg"
    :class="[`pi-${size}`, cls]"
    :viewBox="icon.viewBox"
    v-html="icon.body"
    :aria-label="alt"
  ></svg>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { getProviderIcon } from '@/data/provider-icons';

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

function onError() {
  loaded.value = false;
}
</script>

<style scoped>
.pi-img,
.pi-svg {
  flex-shrink: 0;
  border-radius: 4px;
  display: inline-block;
  width: v-bind('`${size}px`');
  height: v-bind('`${size}px`');
}
</style>
