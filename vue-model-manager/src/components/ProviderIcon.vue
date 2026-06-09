<template>
  <span class="pi-wrap" :class="[`pi-${size}`, cls]" :style="{ '--pi-color': color }">
    <img
      v-if="imgSrc"
      :src="imgSrc"
      :width="size"
      :height="size"
      class="pi-img"
      :alt="alt"
      @error="onImgError"
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

const tried = ref(new Set<string>());
const icon = computed(() => getProviderIcon(props.slug));
const color = computed(() => getProviderColorMuted(props.slug));

const CANDIDATES = ['.svg', '.png'];

const imgSrc = computed(() => {
  for (const ext of CANDIDATES) {
    const path = `/logos/${props.slug}${ext}`;
    if (!tried.value.has(path)) return path;
  }
  return null;
});

function onImgError() {
  if (imgSrc.value) tried.value.add(imgSrc.value);
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
  /* AA logos are pre-colored — no filter needed */
}
</style>
