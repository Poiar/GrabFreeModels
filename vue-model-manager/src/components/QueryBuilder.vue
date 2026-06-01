<template>
  <div class="qb">
    <div class="qb-builder">
      <div class="qb-builder-row">
        <span class="qb-builder-label">Add filter</span>

        <!-- AND / OR toggle -->
        <div class="qb-toggle" v-if="conditions.length + (field ? 1 : 0) > 1">
          <button class="qb-toggle-btn" :class="{ active: !localOrMode }" @click="localOrMode = false">AND</button>
          <button class="qb-toggle-btn" :class="{ active: localOrMode }" @click="localOrMode = true">OR</button>
        </div>

        <!-- Group toggle -->
        <div class="qb-toggle" v-if="conditions.length >= 1">
          <button class="qb-toggle-btn qb-toggle-group" :class="{ active: grouping }" @click="toggleGroup" title="Group conditions in parentheses">
            ( )
          </button>
        </div>

        <!-- Field selector -->
        <select v-model="field" class="qb-select qb-field" @change="onFieldChange">
          <option value="" disabled>Field…</option>
          <option v-for="f in fields" :key="f.key" :value="f.key">{{ f.label }}</option>
        </select>

        <!-- Operator selector -->
        <select v-model="op" class="qb-select qb-op" :disabled="!field">
          <option v-for="o in availableOps" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <!-- Value selector / input / multi-select -->
        <template v-if="needsValue">
          <SearchSelect
            v-if="isSelectField && !isMultiOp"
            v-model="value"
            :options="valueOptions"
            placeholder="Select…"
            class="qb-value"
          />
          <SearchSelect
            v-else-if="isMultiOp"
            v-model="multiValue"
            :options="valueOptions"
            placeholder="Select…"
            class="qb-value"
            multiple
            @change="(vals: string | string[]) => onMultiChange(Array.isArray(vals) ? vals : [String(vals)])"
          />
          <input
            v-else
            v-model="value"
            type="text"
            class="qb-input qb-value"
            :placeholder="valuePlaceholder"
            @keydown.enter="submit"
          />
        </template>

        <!-- Add button -->
        <button class="qb-add" :disabled="!canAdd" @click="submit" title="Add condition">
          <span class="qb-add-icon">+</span><span class="qb-add-label">Add</span>
        </button>
      </div>

      <!-- Saved searches row -->
      <div class="qb-saved-row">
        <button class="qb-saved-btn" @click="showSaved = !showSaved" :class="{ active: showSaved }">
          ★ Saved
        </button>
        <button class="qb-saved-btn" @click="showHistory = !showHistory" :class="{ active: showHistory }" v-if="hasHistory">
          ↺ History
        </button>
        <button class="qb-saved-btn qb-save-current" @click="promptSave" v-if="jqlQuery && jqlQuery.trim()">
          ☆ Save current
        </button>
      </div>
    </div>

    <!-- Saved searches dropdown -->
    <div v-if="showSaved && savedSearches.length" class="qb-saved-dropdown">
      <div v-for="s in savedSearches" :key="s.id" class="qb-saved-item" @click="loadSearch(s)">
        <span class="qb-saved-name">{{ s.name }}</span>
        <span class="qb-saved-query">{{ s.query }}</span>
        <button class="qb-saved-del" @click.stop="deleteSearch(s.id)" title="Delete">✕</button>
      </div>
      <div v-if="!savedSearches.length" class="qb-saved-empty">No saved searches</div>
    </div>

    <!-- History dropdown -->
    <div v-if="showHistory && history.length" class="qb-saved-dropdown">
      <div class="qb-saved-header">
        <span>Recent searches</span>
        <button class="qb-saved-clear" @click="clearHistory">Clear</button>
      </div>
      <div v-for="h in history" :key="h.id" class="qb-saved-item" @click="loadSearch(h)">
        <span class="qb-saved-query">{{ h.query }}</span>
        <span class="qb-saved-time">{{ formatTime(h.ts) }}</span>
      </div>
    </div>

    <!-- Active condition chips -->
    <div v-if="conditions.length" class="qb-conditions">
      <div v-if="grouping" class="qb-group-open">(</div>
      <div
        v-for="(cond, i) in conditions"
        :key="`cond-${i}`"
        class="qb-cond"
        :class="{ 'qb-cond-negated': cond.negated }"
      >
        <span v-if="i > 0" class="qb-cond-join">{{ localOrMode ? 'OR' : 'AND' }}</span>
        <span class="qb-cond-field">{{ fieldLabel(cond.field) }}</span>
        <span class="qb-cond-op" :class="{ 'qb-cond-op-neg': cond.negated }">{{ opLabel(cond.op) }}</span>
        <span class="qb-cond-val">{{ formatCondValue(cond) }}</span>
        <button class="qb-cond-remove" @click="removeCondition(i)" title="Remove">✕</button>
      </div>
      <div v-if="grouping" class="qb-group-close">)</div>
      <button class="qb-cond-clear" @click="clearAll" title="Remove all">✕ Clear</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FILTERABLE_FIELDS, type FieldDef } from '@/composables/useJqlFilter'
import { useSavedSearches } from '@/composables/useSavedSearches'
import SearchSelect from './SearchSelect.vue'

export interface BuilderCondition {
  field: string; op: string; value: string; negated: boolean; jql: string
}

const props = defineProps<{
  conditions: BuilderCondition[]
  orMode?: boolean
  jqlQuery?: string
}>()

const emit = defineEmits<{
  change: [conditions: BuilderCondition[]]
  clear: []
}>()

const { saved: savedSearches, history, hasHistory, save, remove: removeSearch, clearHistory } = useSavedSearches()

const fields = FILTERABLE_FIELDS
const field = ref('')
const op = ref('')
const value = ref('')
const multiValue = ref<string[]>([])
const localOrMode = ref(props.orMode ?? false)
const grouping = ref(false)
const showSaved = ref(false)
const showHistory = ref(false)

watch(() => props.orMode, (v) => { if (v !== undefined) localOrMode.value = v })

const fieldDef = computed<FieldDef | undefined>(() => FILTERABLE_FIELDS.find(f => f.key === field.value))
const isSelectField = computed(() => fieldDef.value?.type === 'select')
const isMultiOp = computed(() => op.value === 'IN' || op.value === 'NOT IN')
const needsValue = computed(() => op.value && op.value !== 'IS EMPTY' && op.value !== 'IS NOT EMPTY')

const availableOps = computed(() => {
  const fd = fieldDef.value
  if (!fd) return []
  if (fd.type === 'number') {
    const ops = [{ value: ':', label: '=' }, { value: '!=', label: '≠' }, { value: ':>', label: '>' }, { value: ':<', label: '<' }] as Array<{value:string;label:string}>
    if (fd.nullable) ops.push({ value: 'IS EMPTY', label: 'is empty' }, { value: 'IS NOT EMPTY', label: 'is not empty' })
    return ops
  }
  if (fd.type === 'select') {
    const ops = [{ value: ':', label: '=' }, { value: '!=', label: '≠' }, { value: 'IN', label: 'in' }, { value: 'NOT IN', label: 'not in' }] as Array<{value:string;label:string}>
    if (fd.nullable) ops.push({ value: 'IS EMPTY', label: 'is empty' }, { value: 'IS NOT EMPTY', label: 'is not empty' })
    return ops
  }
  const ops = [{ value: ':', label: 'contains' }, { value: '!=', label: 'does not contain' }] as Array<{value:string;label:string}>
  if (fd.nullable) ops.push({ value: 'IS EMPTY', label: 'is empty' }, { value: 'IS NOT EMPTY', label: 'is not empty' })
  return ops
})

const valueOptions = computed(() => {
  const fd = fieldDef.value
  if (!fd || fd.type !== 'select' || !fd.options) return []
  return fd.options
})

const valuePlaceholder = computed(() => {
  const fd = fieldDef.value
  if (!fd) return 'Value…'
  if (fd.type === 'number') return 'Number…'
  return `${fd.label}…`
})

const canAdd = computed(() => {
  if (!field.value || !op.value) return false
  if (needsValue.value && !isMultiOp.value && !value.value.trim()) return false
  if (needsValue.value && isMultiOp.value && multiValue.value.length === 0) return false
  return true
})

function onFieldChange() { op.value = ''; value.value = ''; multiValue.value = [] }
watch(op, () => { value.value = ''; multiValue.value = [] })
function onMultiChange(vals: string[]) { multiValue.value = vals }

function toggleGroup() { grouping.value = !grouping.value }

function submit() {
  if (!canAdd.value) return
  const fd = fieldDef.value!
  const negated = op.value === '!=' || op.value === 'NOT IN'
  let jql = ''
  if (op.value === 'IS EMPTY') jql = `${fd.key} IS EMPTY`
  else if (op.value === 'IS NOT EMPTY') jql = `${fd.key} IS NOT EMPTY`
  else if (op.value === 'IN') jql = `${fd.key} IN (${multiValue.value.join(',')})`
  else if (op.value === 'NOT IN') jql = `${fd.key} NOT IN (${multiValue.value.join(',')})`
  else if (op.value === '!=') jql = `${fd.key}!=${value.value}`
  else jql = `${fd.key}${op.value}${value.value}`
  const newCond: BuilderCondition = { field: field.value, op: op.value, value: multiValue.value.join(',') || value.value, negated, jql }
  emit('change', [...props.conditions, newCond])
  field.value = ''; op.value = ''; value.value = ''; multiValue.value = []
}

function removeCondition(i: number) { emit('change', props.conditions.filter((_, idx) => idx !== i)) }
function clearAll() { emit('clear') }

function loadSearch(s: { query: string }) {
  emit('change', []) // clear builder conditions
  showSaved.value = false
  showHistory.value = false
  // Parent will pick up the query change via the jql composable
  emit('clear') // signal parent to use this query
  setTimeout(() => {
    const ev = new CustomEvent('load-saved-query', { detail: s.query })
    window.dispatchEvent(ev)
  }, 0)
}

function promptSave() {
  const name = prompt('Save this search as:')
  if (!name?.trim()) return
  const q = props.jqlQuery ?? ''
  save(name.trim(), q)
}

function deleteSearch(id: string) { removeSearch(id) }

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fieldLabel(key: string): string { return FILTERABLE_FIELDS.find(f => f.key === key)?.label ?? key }
function opLabel(op: string): string { return { ':':'=','!=':'≠',':>':'>',':<':'<',IN:'in','NOT IN':'not in','IS EMPTY':'is empty','IS NOT EMPTY':'is not empty' }[op] ?? op }
function formatCondValue(c: BuilderCondition): string {
  if (c.op === 'IS EMPTY' || c.op === 'IS NOT EMPTY') return ''
  if (c.op === 'IN' || c.op === 'NOT IN') return `(${c.value})`
  return c.value
}
</script>
