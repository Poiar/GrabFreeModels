<template>
  <div>
    <div class="page-header">
      <h2>Models</h2>
      <p>Browse, search, and filter all tracked models</p>
    </div>

    <!-- Jira-style JQL Filter Bar -->
    <div class="jql-bar">
      <div class="jql-chips">
        <button
          v-for="(token, i) in jql.parsed.value.tokens"
          :key="`${token.field}-${token.rawValue}-${i}`"
          class="jql-chip"
          @click="jql.removeToken(i)"
          :title="`Remove ${token.label}`"
        >
          <span class="jql-chip-label">{{ token.label }}</span>
          <span class="jql-chip-remove">✕</span>
        </button>
      </div>
      <div class="jql-input-wrap">
        <span class="jql-icon">🔍</span>
        <input
          ref="jql.inputRef"
          v-model="jql.rawQuery.value"
          type="text"
          class="jql-input"
          placeholder='e.g. provider:openrouter status:working context:>100000 free LLM'
          spellcheck="false"
          @input="jql.onInput"
          @keydown="jql.onKeydown"
          @focus="jql.onFocus"
          @blur="jql.onBlur"
          @click="jql.onInput($event)"
        />
        <button v-if="jql.rawQuery.value || jql.parsed.value.tokens.length" class="jql-clear" @click="clearAll" title="Clear all">✕</button>
      </div>
      <div v-if="jql.suggestions.value" class="jql-suggestions">
        <div v-for="opt in jql.suggestions.value.options" :key="opt.insert" class="jql-suggestion" @mousedown.prevent="jql.applySuggestion(opt.insert)">
          <span class="jql-suggestion-label">{{ opt.label }}</span>
          <span class="jql-suggestion-field">{{ opt.insert }}</span>
        </div>
        <div v-if="!jql.suggestions.value.options.length" class="jql-suggestion-empty">
          No matching {{ jql.suggestions.value.field }}s
        </div>
      </div>
      <span class="filter-count">
        {{ sortedModels.length }} of {{ store.allModels.length }} models
      </span>
    </div>

    <!-- Virtual Scroll Table -->
    <div class="table-wrap vscroll-table">
      <div class="vscroll-header-row">
        <div class="vscroll-header-cell sortable" :class="{ active: sortBy === 'name' }" @click="setSort('name')">
          Model <span class="sort-indicator">{{ sortIndicator('name') }}</span>
        </div>
        <div class="vscroll-header-cell sortable" :class="{ active: sortBy === 'provider' }" @click="setSort('provider')">
          Provider <span class="sort-indicator">{{ sortIndicator('provider') }}</span>
        </div>
        <div class="vscroll-header-cell">
          Type
        </div>
        <div class="vscroll-header-cell sortable" :class="{ active: sortBy === 'status' }" @click="setSort('status')">
          Status <span class="sort-indicator">{{ sortIndicator('status') }}</span>
        </div>
        <div class="vscroll-header-cell sortable" :class="{ active: sortBy === 'context' }" @click="setSort('context')">
          Context <span class="sort-indicator">{{ sortIndicator('context') }}</span>
        </div>
        <div class="vscroll-header-cell sortable" :class="{ active: sortBy === 'detail' }" @click="setSort('detail')">
          Latest Test Result <span class="sort-indicator">{{ sortIndicator('detail') }}</span>
        </div>
      </div>
      <RecycleScroller
        v-if="sortedModels.length > 0"
        ref="scrollerRef"
        :items="sortedModels"
        :item-size="52"
        key-field="id"
        class="vscroll-body"
        :emit-update="false"
      >
        <template #default="{ item: model }">
          <div class="vscroll-row">
            <div class="vscroll-cell col-name">
              <div class="model-name" :title="model.name">{{ model.name }}</div>
              <div class="model-id-wrap">
                <span class="model-id" :title="model.id">{{ model.id }}</span>
                <button class="copy-btn" :class="{ copied: copiedIds.has(model.id) }" :title="copiedIds.has(model.id) ? 'Copied!' : 'Copy ID'" @click.stop="handleCopy(model.id)">
                  {{ copiedIds.has(model.id) ? '✓' : '📋' }}
                </button>
              </div>
            </div>
            <div class="vscroll-cell col-provider">
              <span>{{ model.provider }}</span>
            </div>
            <div class="vscroll-cell col-type">
              <span class="badge" :class="model.is_free ? 'badge-free-type' : 'badge-paid-type'">
                {{ model.is_free ? 'Free' : 'Paid' }}
              </span>
            </div>
            <div class="vscroll-cell col-status">
              <span class="badge" :class="`badge-${model.status.result}`">
                {{ formatStatus(model.status.result) }}
              </span>
            </div>
            <div class="vscroll-cell col-context">
              <span class="context-len">
                {{ model.context_length != null ? formatContext(model.context_length) : '—' }}
              </span>
            </div>
            <div class="vscroll-cell col-detail">
              <div class="best-for-tags">
                <span v-for="tag in model.best_for.slice(0, 3)" :key="tag" class="tag">
                  {{ tag }}
                </span>
                <span v-if="model.best_for.length > 3" class="tag">
                  +{{ model.best_for.length - 3 }}
                </span>
              </div>
              <div class="detail-text" :title="model.status.detail">
                {{ model.status.detail }}
              </div>
            </div>
          </div>
        </template>
      </RecycleScroller>
      <div v-else class="empty-state">
        <div class="empty-state-inner">
          <span class="empty-state-icon">🔍</span>
          <p>No models match your filters.</p>
          <button class="refresh-btn" @click="resetFilters">Clear all filters</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { useModelsStore } from '@/store/models'
import { RecycleScroller } from 'vue-virtual-scroller'
import { useJqlFilter } from '@/composables/useJqlFilter'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

type ScrollerExposed = { scrollToPosition: (pos: number) => void }
const scrollerRef = ref<ScrollerExposed | null>(null)

const store = useModelsStore()
const copiedIds = reactive(new Set<string>())
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function handleCopy(id: string) {
  try {
    await navigator.clipboard.writeText(id)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = id
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copiedIds.add(id)
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copiedIds.delete(id)
  }, 1500)
}

const sortBy = ref('name')
const sortDesc = ref(false)

const jql = useJqlFilter(store.allModels, store.allProviderNames)

watch([() => jql.rawQuery.value, sortBy, sortDesc], () => {
  scrollerRef.value?.scrollToPosition(0)
})

function clearAll() {
  jql.rawQuery.value = ''
}

function setSort(field: string) {
  if (sortBy.value === field) {
    sortDesc.value = !sortDesc.value
  } else {
    sortBy.value = field
    sortDesc.value = false
  }
}

function sortIndicator(field: string): string {
  if (sortBy.value !== field) return '⇅'
  return sortDesc.value ? '↓' : '↑'
}

function formatStatus(s: string): string {
  if (s === 'rate_limited') return 'Rate Limited'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const filteredModels = computed(() => jql.filteredModels.value)

const sortedModels = computed(() => {
  const sorted = [...filteredModels.value]
  const dir = sortDesc.value ? -1 : 1

  sorted.sort((a, b) => {
    switch (sortBy.value) {
      case 'provider':
        return dir * a.provider.localeCompare(b.provider)
      case 'status':
        return dir * a.status.result.localeCompare(b.status.result)
      case 'context': {
        const aCtx = a.context_length
        const bCtx = b.context_length
        if (aCtx == null && bCtx == null) return 0
        if (aCtx == null) return 1
        if (bCtx == null) return -1
        return dir * (aCtx - bCtx)
      }
      case 'detail':
        return dir * a.status.detail.localeCompare(b.status.detail)
      default:
        return dir * a.name.localeCompare(b.name)
    }
  })

  return sorted
})

const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 })

function formatContext(n: number): string {
  return fmt.format(n)
}
</script>
