<template>
  <div>
    <div class="page-header">
      <h2>Models</h2>
      <p>Browse, search, and filter all tracked models</p>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input v-model="search" type="text" placeholder="Search name, ID, notes…" />
        <button v-if="search" class="search-clear" @click="search = ''" title="Clear search">✕</button>
      </div>
      <select v-model="providerFilter">
        <option value="">All Providers</option>
        <option v-for="p in store.allProviderNames" :key="p" :value="p">{{ p }}</option>
      </select>
      <select v-model="statusFilter">
        <option value="">All Statuses</option>
        <option value="working">Working</option>
        <option value="rate_limited">Rate Limited</option>
        <option value="broken">Broken</option>
        <option value="untested">Untested</option>
        <option value="paid">Paid</option>
      </select>
      <select v-model="typeFilter">
        <option value="">Free &amp; Paid</option>
        <option value="free">Free Only</option>
        <option value="paid">Paid Only</option>
      </select>
      <span class="filter-count">
        {{ sortedModels.length }} of {{ store.allModels.length }} models
      </span>
      <button v-if="hasActiveFilters" class="clear-btn" @click="resetFilters">
        Clear filters
      </button>
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
              <template v-if="model.is_free"><br><span class="tag tag-free">FREE</span></template>
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
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

type ScrollerExposed = { scrollToPosition: (pos: number) => void }
const scrollerRef = ref<ScrollerExposed | null>(null)

const store = useModelsStore()
const search = ref('')
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
const providerFilter = ref('')
const statusFilter = ref('')
const typeFilter = ref('')
const sortBy = ref('name')
const sortDesc = ref(false)

watch([search, providerFilter, statusFilter, typeFilter, sortBy, sortDesc], () => {
  scrollerRef.value?.scrollToPosition(0)
})

const hasActiveFilters = computed(() =>
  !!search.value || !!providerFilter.value || !!statusFilter.value || !!typeFilter.value
)

function resetFilters() {
  search.value = ''
  providerFilter.value = ''
  statusFilter.value = ''
  typeFilter.value = ''
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

const filteredModels = computed(() => {
  const q = search.value.toLowerCase().trim()

  return store.allModels
    .filter(m => {
      if (typeFilter.value === 'free') return m.is_free
      if (typeFilter.value === 'paid') return !m.is_free
      return true
    })
    .filter(m => !providerFilter.value || m.provider === providerFilter.value)
    .filter(m => !statusFilter.value || m.status.result === statusFilter.value)
    .filter(m => {
      if (!q) return true
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.notes.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.best_for.some(t => t.toLowerCase().includes(q))
      )
    })
})

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
