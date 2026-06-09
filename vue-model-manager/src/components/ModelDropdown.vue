<template>
  <div class="md-wrap" ref="wrapEl">
    <input
      ref="inputEl"
      v-model="query"
      type="text"
      :placeholder="placeholder"
      class="md-input"
      @focus="open = true"
      @input="open = true"
      @keydown.escape="open = false"
      @keydown.enter="onEnter"
      @keydown.down.prevent="onArrowDown"
      @keydown.up.prevent="onArrowUp"
    />
    <div v-if="open" class="md-dropdown">
      <div
        v-for="(m, idx) in filtered"
        :key="m.slug"
        class="md-item"
        :class="{ 'md-item-active': idx === activeIdx }"
        @mousedown.prevent
        @click="select(m)"
        @mouseenter="activeIdx = idx"
      >
        <span class="md-item-name">{{ m.name }}</span>
        <span class="md-item-creator">{{ m.creator || '' }}</span>
      </div>
      <div v-if="filtered.length === 0" class="md-empty">No models found</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { ModelData } from '@/types';

const props = defineProps<{
  models: ModelData[];
  placeholder?: string;
}>();

const emit = defineEmits<{
  select: [model: ModelData];
}>();

const query = ref('');
const open = ref(false);
const activeIdx = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const wrapEl = ref<HTMLDivElement | null>(null);

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim();
  if (!q) return props.models.slice(0, 100);
  return props.models
    .filter(m => m.name.toLowerCase().includes(q) || (m.creator && m.creator.toLowerCase().includes(q)))
    .slice(0, 100);
});

watch(open, (val) => {
  if (val) activeIdx.value = 0;
});

function select(model: ModelData) {
  query.value = '';
  open.value = false;
  emit('select', model);
}

function onEnter() {
  if (filtered.value[activeIdx.value]) {
    select(filtered.value[activeIdx.value]);
  }
}

function onArrowDown() {
  if (activeIdx.value < filtered.value.length - 1) activeIdx.value++;
}

function onArrowUp() {
  if (activeIdx.value > 0) activeIdx.value--;
}

// Close on click outside
function onDocumentClick(e: MouseEvent) {
  if (wrapEl.value && !wrapEl.value.contains(e.target as Node)) {
    open.value = false;
  }
}

import { onMounted, onUnmounted } from 'vue';
onMounted(() => document.addEventListener('click', onDocumentClick));
onUnmounted(() => document.removeEventListener('click', onDocumentClick));
</script>

<style scoped>
.md-wrap {
  position: relative;
  width: 100%;
}

.md-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--depth-2, var(--bg-elevated));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 0.82rem;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.md-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.md-input::placeholder {
  color: var(--text-muted);
}

.md-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 50;
  background: var(--depth-3, var(--bg-card));
  border: 1px solid var(--border-depth-1);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  max-height: 280px;
  overflow-y: auto;
  box-shadow: var(--shadow-elevation-3);
}

.md-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.1s;
}

.md-item:hover,
.md-item-active {
  background: var(--bg-hover);
}

.md-item-name {
  font-weight: 600;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-item-creator {
  font-size: 0.65rem;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-left: 8px;
}

.md-empty {
  padding: 14px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.75rem;
}
</style>
