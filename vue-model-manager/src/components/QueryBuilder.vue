<template>
  <div class="qb">
    <div class="qb-row">
      <!-- AND / OR toggle -->
      <div class="qb-toggle" v-if="hasExistingQuery">
        <button
          class="qb-toggle-btn"
          :class="{ active: !orMode }"
          @click="orMode = false"
          title="Match ALL conditions (AND)"
        >AND</button>
        <button
          class="qb-toggle-btn"
          :class="{ active: orMode }"
          @click="orMode = true"
          title="Match ANY condition (OR)"
        >OR</button>
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

      <!-- Value selector / input -->
      <template v-if="needsValue">
        <select v-if="isSelectField" v-model="value" class="qb-select qb-value">
          <option value="" disabled>Select…</option>
          <option v-for="opt in valueOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
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
      <button
        class="qb-add"
        :disabled="!canAdd"
        @click="submit"
        title="Add condition"
      >
        <span class="qb-add-icon">+</span>
        <span class="qb-add-label">Add</span>
      </button>
    </div>

    <!-- Active filter chips from builder -->
    <div v-if="conditions.length" class="qb-conditions">
      <div
        v-for="(cond, i) in conditions"
        :key="`${cond.field}-${cond.op}-${cond.value}-${i}`"
        class="qb-cond"
        :class="{ 'qb-cond-negated': cond.negated }"
      >
        <span class="qb-cond-field">{{ fieldLabel(cond.field) }}</span>
        <span class="qb-cond-op" :class="{ 'qb-cond-op-neg': cond.negated }">{{ opLabel(cond.op) }}</span>
        <span class="qb-cond-val">{{ cond.value }}</span>
        <button class="qb-cond-remove" @click="removeCondition(i)" title="Remove">✕</button>
      </div>
      <button class="qb-cond-clear" @click="clearConditions">Clear all</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FILTERABLE_FIELDS, type FieldDef } from '@/composables/useJqlFilter'

/* ─── Types ─── */

export interface BuilderCondition {
  field: string
  op: string
  value: string
  negated: boolean
  /** The JQL fragment this condition produces */
  jql: string
}

/* ─── State ─── */

const emit = defineEmits<{
  change: [conditions: BuilderCondition[]]
}>()

const fields = FILTERABLE_FIELDS
const field = ref('')
const op = ref('')
const value = ref('')
const orMode = ref(false)
const conditions = ref<BuilderCondition[]>([])

const hasExistingQuery = computed(() => conditions.value.length > 0)

/* ─── Derived ─── */

const fieldDef = computed<FieldDef | undefined>(() =>
  FILTERABLE_FIELDS.find(f => f.key === field.value),
)

const isSelectField = computed(() => fieldDef.value?.type === 'select')

const needsValue = computed(() => {
  if (!op.value) return false
  return op.value !== 'IS EMPTY' && op.value !== 'IS NOT EMPTY'
})

const availableOps = computed(() => {
  const fd = fieldDef.value
  if (!fd) return []

  if (fd.type === 'number') {
    const ops = [
      { value: ':', label: '=' },
      { value: '!=', label: '≠' },
      { value: ':>', label: '>' },
      { value: ':<', label: '<' },
    ]
    if (fd.nullable) {
      ops.push({ value: 'IS EMPTY', label: 'is empty' })
      ops.push({ value: 'IS NOT EMPTY', label: 'is not empty' })
    }
    return ops
  }

  if (fd.type === 'select') {
    const ops = [
      { value: ':', label: '=' },
      { value: '!=', label: '≠' },
      { value: 'IN', label: 'in' },
      { value: 'NOT IN', label: 'not in' },
    ]
    if (fd.nullable) {
      ops.push({ value: 'IS EMPTY', label: 'is empty' })
      ops.push({ value: 'IS NOT EMPTY', label: 'is not empty' })
    }
    return ops
  }

  // text
  const ops = [
    { value: ':', label: 'contains' },
    { value: '!=', label: 'does not contain' },
  ]
  if (fd.nullable) {
    ops.push({ value: 'IS EMPTY', label: 'is empty' })
    ops.push({ value: 'IS NOT EMPTY', label: 'is not empty' })
  }
  return ops
})

const valueOptions = computed(() => {
  const fd = fieldDef.value
  if (!fd) return []
  if (fd.type === 'select' && fd.options) return fd.options
  return []
})

const valuePlaceholder = computed(() => {
  const fd = fieldDef.value
  if (!fd) return 'Value…'
  if (fd.type === 'number') return 'Number…'
  if (op.value === 'IN' || op.value === 'NOT IN') return 'val1, val2, …'
  return `${fd.label}…`
})

const canAdd = computed(() => {
  if (!field.value || !op.value) return false
  if (needsValue.value && !value.value.trim()) return false
  return true
})

/* ─── Methods ─── */

function onFieldChange() {
  op.value = ''
  value.value = ''
  // Auto-select first op
  if (availableOps.value.length === 1) {
    op.value = availableOps.value[0].value
  }
}

watch(op, () => {
  value.value = ''
})

function submit() {
  if (!canAdd.value) return
  const fd = fieldDef.value!
  const negated = op.value === '!=' || op.value === 'NOT IN'

  // Build JQL fragment
  let jql: string
  if (op.value === 'IS EMPTY') {
    jql = `${field.value} IS EMPTY`
  } else if (op.value === 'IS NOT EMPTY') {
    jql = `${field.value} IS NOT EMPTY`
  } else if (op.value === 'IN' || op.value === 'NOT IN') {
    jql = `${field.value} ${op.value} (${value.value})`
  } else if (op.value === '!=') {
    jql = `${field.value}!=${value.value}`
  } else {
    jql = `${field.value}${op.value}${value.value}`
  }

  conditions.value = [...conditions.value, {
    field: field.value,
    op: op.value,
    value: value.value,
    negated,
    jql,
  }]

  // Reset
  field.value = ''
  op.value = ''
  value.value = ''

  emitChange()
}

function removeCondition(i: number) {
  conditions.value = conditions.value.filter((_, idx) => idx !== i)
  emitChange()
}

function clearConditions() {
  conditions.value = []
  emitChange()
}

function emitChange() {
  emit('change', conditions.value)
}

/* ─── Helpers ─── */

function fieldLabel(key: string): string {
  return FILTERABLE_FIELDS.find(f => f.key === key)?.label ?? key
}

function opLabel(opVal: string): string {
  const map: Record<string, string> = {
    ':': '=',
    '!=': '≠',
    ':>': '>',
    ':<': '<',
    IN: 'in',
    'NOT IN': 'not in',
    'IS EMPTY': 'is empty',
    'IS NOT EMPTY': 'is not empty',
  }
  return map[opVal] ?? opVal
}
</script>
