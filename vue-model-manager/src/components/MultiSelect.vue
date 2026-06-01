<template>
  <div class="ms" ref="rootRef" :class="{ open: isOpen }">
    <div class="ms-trigger" @click="toggle" :class="{ 'ms-has-val': modelValue.length > 0 }">
      <template v-if="modelValue.length > 0">
        <span class="ms-pill" v-for="v in modelValue.slice(0, 3)" :key="v">{{ optLabel(v) }}</span>
        <span v-if="modelValue.length > 3" class="ms-count">+{{ modelValue.length - 3 }}</span>
      </template>
      <template v-else><span class="ms-ph">{{ placeholder }}</span></template>
      <span class="ms-arrow" :class="{ 'ms-arrow-up': isOpen }">▾</span>
    </div>
    <div v-if="isOpen" class="ms-dropdown">
      <div class="ms-search-wrap" v-if="options.length > 3">
        <input ref="searchRef" v-model="search" type="text" class="ms-search" placeholder="Search…" @click.stop @keydown.esc="isOpen = false" />
      </div>
      <div class="ms-list">
        <label v-for="opt in filteredOpts" :key="opt.value" class="ms-opt" :class="{ selected: isSelected(opt.value) }">
          <input type="checkbox" :checked="isSelected(opt.value)" @change="pick(opt.value)" @click.stop class="ms-cb" />
          <span class="ms-opt-label">{{ opt.label }}</span>
        </label>
        <div v-if="!filteredOpts.length" class="ms-empty">No matches</div>
      </div>
      <div v-if="modelValue.length > 0" class="ms-footer">
        <span class="ms-sel-count">{{ modelValue.length }} selected</span>
        <button class="ms-clear" @click.stop="clearAll">Clear</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

export interface Opt { value: string; label: string }

const props = defineProps<{ modelValue: string[]; options: Opt[]; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: string[]]; change: [v: string[]] }>()

const isOpen = ref(false)
const search = ref('')
const rootRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)

const filteredOpts = computed(() => {
  if (!search.value) return props.options
  const q = search.value.toLowerCase()
  return props.options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
})

function optLabel(v: string): string { return props.options.find(o => o.value === v)?.label ?? v }
function isSelected(v: string): boolean { return props.modelValue.includes(v) }
function pick(v: string) {
  const cur = [...props.modelValue]
  const idx = cur.indexOf(v)
  if (idx >= 0) cur.splice(idx, 1); else cur.push(v)
  emit('update:modelValue', cur)
  emit('change', cur)
}
function clearAll() { emit('update:modelValue', []); emit('change', []) }
function toggle() { isOpen.value = !isOpen.value; if (isOpen.value) setTimeout(() => searchRef.value?.focus(), 20) }
function onOutside(e: MouseEvent) { if (rootRef.value && !rootRef.value.contains(e.target as Node)) isOpen.value = false }

onMounted(() => document.addEventListener('mousedown', onOutside))
onUnmounted(() => document.removeEventListener('mousedown', onOutside))
</script>
