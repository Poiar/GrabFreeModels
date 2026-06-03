<template>
  <div class="ss" ref="rootRef" :class="{ open: isOpen }">
    <div class="ss-trigger" role="button" tabindex="0" @click="toggle" @keydown.enter.prevent="toggle" @keydown.space.prevent="toggle" :class="{ 'ss-has-val': hasValue }">
      <template v-if="multiple && (modelValue as string[]).length > 0">
        <span class="ss-multi-pill" v-for="v in (modelValue as string[]).slice(0, 3)" :key="v">{{ optLabel(v) }}</span>
        <span v-if="(modelValue as string[]).length > 3" class="ss-multi-count">+{{ (modelValue as string[]).length - 3 }}</span>
      </template>
      <template v-else-if="!multiple && modelValue">
        <span class="ss-single-val">{{ optLabel(String(modelValue)) }}</span>
      </template>
      <template v-else>
        <span class="ss-placeholder">{{ placeholder }}</span>
      </template>
      <span class="ss-arrow" :class="{ 'ss-arrow-up': isOpen }">▾</span>
    </div>

    <div v-if="isOpen" class="ss-dropdown">
      <div class="ss-search-wrap" v-if="options.length > 4">
        <input
          ref="searchRef"
          v-model="search"
          type="text"
          class="ss-search"
          placeholder="Search…"
          @click.stop
          @keydown.esc="isOpen = false"
        />
      </div>
      <div class="ss-list">
        <div
          v-for="opt in filteredOpts"
          :key="opt.value"
          class="ss-opt"
          :class="{ selected: isSelected(opt.value) }"
          @click.stop="pick(opt)"
        >
          <span class="ss-check" v-if="isSelected(opt.value)">✓</span>
          <span class="ss-opt-label">{{ opt.label }}</span>
        </div>
        <div v-if="!filteredOpts.length" class="ss-empty">No matches</div>
      </div>
      <div v-if="multiple && (modelValue as string[]).length > 1" class="ss-footer">
        <button class="ss-clear" @click.stop="clearAll">Clear</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

export interface Opt { value: string; label: string }

const props = defineProps<{
  modelValue: string | string[]
  options: Opt[]
  placeholder?: string
  multiple?: boolean
  startOpen?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [val: string | string[]]
  change: [val: string | string[]]
}>()

const isOpen = ref(false)
const search = ref('')
const rootRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)

const modelValue = computed(() => props.modelValue)
const multiple = computed(() => props.multiple ?? false)
const hasValue = computed(() => multiple.value ? (modelValue.value as string[]).length > 0 : !!modelValue.value)

const filteredOpts = computed(() => {
  if (!search.value) return props.options
  const q = search.value.toLowerCase()
  return props.options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
})

function optLabel(v: string): string { return props.options.find(o => o.value === v)?.label ?? v }
function isSelected(v: string): boolean { return multiple.value ? (modelValue.value as string[]).includes(v) : modelValue.value === v }

function pick(opt: Opt) {
  if (multiple.value) {
    const cur = [...(modelValue.value as string[])]
    const idx = cur.indexOf(opt.value)
    if (idx >= 0) cur.splice(idx, 1)
    else cur.push(opt.value)
    emit('update:modelValue', cur)
    emit('change', cur)
  } else {
    emit('update:modelValue', opt.value)
    emit('change', opt.value)
    isOpen.value = false
  }
}

function clearAll() { emit('update:modelValue', []); emit('change', []) }

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) setTimeout(() => searchRef.value?.focus(), 20)
}

function onOutside(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) isOpen.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onOutside)
  if (props.startOpen) toggle()
})
onUnmounted(() => document.removeEventListener('mousedown', onOutside))
</script>
