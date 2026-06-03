<template>
  <div class="qb">
    <div class="qb-builder">
      <div class="qb-builder-row">
        <span class="qb-builder-label">Add filter</span>

        <!-- Group toggle -->
        <div class="qb-toggle" v-if="conditions.length >= 1">
          <button class="qb-toggle-btn qb-toggle-group" :class="{ active: grouping }" @click="grouping = !grouping" title="Wrap in parentheses">( )</button>
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

        <!-- Value -->
        <template v-if="needsValue">
          <SearchSelect
            v-if="isSelectField && !isMultiOp"
            v-model="value"
            :options="valueOptions"
            placeholder="Select…"
            class="qb-value"
            :start-open="true"
            :key="'ss-' + field"
            @change="submit"
          />
          <MultiSelect
            v-else-if="isMultiOp"
            v-model="multiValue"
            :options="valueOptions"
            placeholder="Select…"
            class="qb-value"
          />
          <input v-else v-model="value" type="text" class="qb-input qb-value" :placeholder="valuePlaceholder" @keydown.enter="submit" />
        </template>
      </div>

      <!-- Saved / History / Import-Export row -->
      <div class="qb-actions">
        <button class="qb-action-btn" @click="showSaved = !showSaved" :class="{ active: showSaved }">★ Saved</button>
        <button class="qb-action-btn" @click="showHistory = !showHistory" :class="{ active: showHistory }" v-if="hasHistory">↺ History</button>
        <button class="qb-action-btn" @click="promptSave" v-if="jqlQuery && jqlQuery.trim()">☆ Save</button>
        <div class="qb-actions-right">
          <button class="qb-action-btn" @click="exportFilters" title="Export filters as JSON">⬇ Export</button>
          <button class="qb-action-btn" @click="triggerImport" title="Import filters from JSON">⬆ Import</button>
          <input ref="importRef" type="file" accept=".json" style="display:none" @change="handleImport" />
        </div>
      </div>
    </div>

    <!-- Saved dropdown -->
    <div v-if="showSaved" class="qb-dropdown">
      <div v-for="s in savedSearches" :key="s.id" class="qb-drop-item" @click="loadSaved(s)">
        <span class="qb-drop-name">{{ s.name }}</span>
        <span class="qb-drop-qry">{{ s.query }}</span>
        <button class="qb-drop-del" @click.stop="deleteSaved(s.id)">✕</button>
      </div>
      <div v-if="!savedSearches.length" class="qb-drop-empty">No saved searches</div>
    </div>

    <!-- History dropdown -->
    <div v-if="showHistory" class="qb-dropdown">
      <div class="qb-drop-header"><span>Recent</span><button class="qb-drop-clear" @click="clearHistory">Clear</button></div>
      <div v-for="h in history" :key="h.id" class="qb-drop-item" @click="loadSaved(h)">
        <span class="qb-drop-qry">{{ h.query }}</span>
        <span class="qb-drop-time">{{ fmtTime(h.ts) }}</span>
      </div>
    </div>

    <!-- Condition chips with per-condition AND/OR -->
    <div v-if="conditions.length" class="qb-conditions">
      <div v-if="grouping" class="qb-group-mark">(</div>
      <template v-for="(cond, i) in conditions" :key="`c-${i}`">
        <!-- Per-condition join operator -->
        <div v-if="i > 0" class="qb-join">
          <button class="qb-join-btn" :class="{ 'qb-join-or': cond.joinOr }" @click="toggleJoin(i)" :title="cond.joinOr ? 'Click for AND' : 'Click for OR'">
            {{ cond.joinOr ? 'OR' : 'AND' }}
          </button>
        </div>
        <div class="qb-cond" :class="{ 'qb-cond-negated': cond.negated }">
          <span class="qb-cond-field">{{ fieldLabel(cond.field) }}</span>
          <span class="qb-cond-op" :class="{ 'qb-cond-op-neg': cond.negated }">{{ opLabel(cond.op) }}</span>
          <span class="qb-cond-val">{{ fmtVal(cond) }}</span>
          <button class="qb-cond-rm" @click="removeAt(i)" title="Remove">✕</button>
        </div>
      </template>
      <div v-if="grouping" class="qb-group-mark">)</div>
      <button class="qb-cond-clear" @click="$emit('clear')">✕ Clear</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FILTERABLE_FIELDS, type FieldDef } from '@/composables/useJqlFilter'
import { useSavedSearches } from '@/composables/useSavedSearches'
import SearchSelect from './SearchSelect.vue'
import MultiSelect from './MultiSelect.vue'

export interface BuilderCondition {
  field: string; op: string; value: string; negated: boolean; jql: string
  joinOr?: boolean  // if true, this condition is OR'd with the previous; default AND
}

const props = defineProps<{ conditions: BuilderCondition[]; jqlQuery?: string; providerNames?: string[]; authorNames?: string[] }>()
const emit = defineEmits<{ change: [c: BuilderCondition[]]; clear: [] }>()

const { saved: savedSearches, history, hasHistory, save, remove: removeSaved, clearHistory } = useSavedSearches()

const fields = FILTERABLE_FIELDS
const field = ref('')
const op = ref('')
const value = ref('')
const multiValue = ref<string[]>([])
const grouping = ref(false)
const showSaved = ref(false)
const showHistory = ref(false)
const importRef = ref<HTMLInputElement | null>(null)

const fieldDef = computed<FieldDef | undefined>(() => FILTERABLE_FIELDS.find(f => f.key === field.value))
const isSelectField = computed(() => fieldDef.value?.type === 'select')
const isMultiOp = computed(() => op.value === 'IN' || op.value === 'NOT IN')
const needsValue = computed(() => op.value && op.value !== 'IS EMPTY' && op.value !== 'IS NOT EMPTY')

const availableOps = computed(() => {
  const fd = fieldDef.value
  if (!fd) return []
  if (fd.type === 'number') {
    const o = [{ value: ':', label: '=' }, { value: '!=', label: '≠' }, { value: ':>', label: '>' }, { value: ':<', label: '<' }]
    if (fd.nullable) o.push({ value: 'IS EMPTY', label: 'is empty' }, { value: 'IS NOT EMPTY', label: 'is not empty' })
    return o
  }
  if (fd.type === 'select') {
    const o = [{ value: ':', label: '=' }, { value: '!=', label: '≠' }, { value: 'IN', label: 'in' }, { value: 'NOT IN', label: 'not in' }]
    if (fd.nullable) o.push({ value: 'IS EMPTY', label: 'is empty' }, { value: 'IS NOT EMPTY', label: 'is not empty' })
    return o
  }
  const o = [{ value: ':', label: 'contains' }, { value: '!=', label: 'does not contain' }]
  if (fd.nullable) o.push({ value: 'IS EMPTY', label: 'is empty' }, { value: 'IS NOT EMPTY', label: 'is not empty' })
  return o
})

const valueOptions = computed(() => {
  const fd = fieldDef.value
  if (fd?.type !== 'select') return []
  if (fd.key === 'provider' && props.providerNames) return props.providerNames.map(n => ({ value: n, label: n }))
  if (fd.key === 'author' && props.authorNames) return props.authorNames.map(n => ({ value: n, label: n }))
  return fd.options ?? []
})
const valuePlaceholder = computed(() => { const f = fieldDef.value; return f?.type === 'number' ? 'Number…' : `${f?.label ?? 'Value'}…` })
const canAdd = computed(() => {
  if (!field.value || !op.value) return false
  if (needsValue.value && !isMultiOp.value && !value.value.trim()) return false
  if (needsValue.value && isMultiOp.value && multiValue.value.length === 0) return false
  return true
})

function onFieldChange() { op.value = ':'; value.value = ''; multiValue.value = [] }
watch(op, () => { value.value = ''; multiValue.value = [] })
watch(multiValue, (v) => { if (isMultiOp.value && v.length > 0) submit() })

function submit() {
  if (!canAdd.value) return
  const fd = fieldDef.value!
  const neg = op.value === '!=' || op.value === 'NOT IN'
  let jql = ''
  if (op.value === 'IS EMPTY') jql = `${fd.key} IS EMPTY`
  else if (op.value === 'IS NOT EMPTY') jql = `${fd.key} IS NOT EMPTY`
  else if (op.value === 'IN') jql = `${fd.key} IN (${multiValue.value.map(v => `"${v}"`).join(',')})`
  else if (op.value === 'NOT IN') jql = `${fd.key} NOT IN (${multiValue.value.map(v => `"${v}"`).join(',')})`
  else if (op.value === '!=') jql = `${fd.key}!=${value.value}`
  else jql = `${fd.key}${op.value}${value.value}`
  emit('change', [...props.conditions, { field: field.value, op: op.value, value: multiValue.value.join(',') || value.value, negated: neg, jql, joinOr: false }])
  field.value = ''; op.value = ''; value.value = ''; multiValue.value = []
}

function removeAt(i: number) { emit('change', props.conditions.filter((_, idx) => idx !== i)) }
function toggleJoin(i: number) {
  const next = [...props.conditions]
  next[i] = { ...next[i], joinOr: !next[i].joinOr }
  emit('change', next)
}

function loadSaved(s: { query: string }) {
  emit('clear')
  showSaved.value = false; showHistory.value = false
  setTimeout(() => window.dispatchEvent(new CustomEvent('load-saved-query', { detail: s.query })), 0)
}

function deleteSaved(id: string) { removeSaved(id) }
function promptSave() {
  const n = prompt('Save this search as:'); if (!n?.trim()) return
  save(n.trim(), props.jqlQuery ?? '')
}

function exportFilters() {
  const data = JSON.stringify({ saved: savedSearches.value, exportedAt: Date.now() }, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'grabfreemodels-filters.json'; a.click()
  URL.revokeObjectURL(url)
}
function triggerImport() { importRef.value?.click() }
function handleImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string)
      if (Array.isArray(data.saved)) {
        for (const s of data.saved) {
          if (s.name && s.query) save(s.name, s.query)
        }
      }
    } catch { alert('Invalid JSON file') }
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

function fmtTime(ts: number): string {
  const d = new Date(ts), n = new Date()
  return d.toDateString() === n.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
function fieldLabel(k: string): string { return FILTERABLE_FIELDS.find(f => f.key === k)?.label ?? k }
function opLabel(o: string): string { return { ':':'=' ,'!=':'≠' ,':>':'>' ,':<':'<' ,IN:'in' ,'NOT IN':'not in' ,'IS EMPTY':'is empty' ,'IS NOT EMPTY':'is not empty' }[o] ?? o }
function fmtVal(c: BuilderCondition): string {
  if (c.op === 'IS EMPTY' || c.op === 'IS NOT EMPTY') return ''
  if (c.op === 'IN' || c.op === 'NOT IN') return `(${c.value})`
  return c.value
}
</script>
