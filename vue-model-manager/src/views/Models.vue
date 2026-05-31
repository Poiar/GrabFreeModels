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

    <!-- Table -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="sortable" :class="{ active: sortBy === 'name' }" @click="setSort('name')">
              Model <span class="sort-indicator">{{ sortIndicator('name') }}</span>
            </th>
            <th class="sortable" :class="{ active: sortBy === 'provider' }" @click="setSort('provider')">
              Provider <span class="sort-indicator">{{ sortIndicator('provider') }}</span>
            </th>
            <th class="sortable" :class="{ active: sortBy === 'status' }" @click="setSort('status')">
              Status <span class="sort-indicator">{{ sortIndicator('status') }}</span>
            </th>
            <th class="sortable" :class="{ active: sortBy === 'context' }" @click="setSort('context')">
              Context <span class="sort-indicator">{{ sortIndicator('context') }}</span>
            </th>
            <th>Best For</th>
            <th class="sortable" :class="{ active: sortBy === 'price_in' }" @click="setSort('price_in')">
              Price In <span class="sort-indicator">{{ sortIndicator('price_in') }}</span>
            </th>
            <th class="sortable" :class="{ active: sortBy === 'price_out' }" @click="setSort('price_out')">
              Price Out <span class="sort-indicator">{{ sortIndicator('price_out') }}</span>
            </th>
            <th class="sortable" :class="{ active: sortBy === 'detail' }" @click="setSort('detail')">
              Detail <span class="sort-indicator">{{ sortIndicator('detail') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-if="paginatedModels.length > 0">
            <tr v-for="model in paginatedModels" :key="model.id">
              <td>
                <div class="model-name" :title="model.name">{{ model.name }}</div>
               <div class="model-id" :title="model.id">{{ model.id }}</div>
              </td>
              <td>{{ model.provider }}</td>
              <td>
                <span class="badge" :class="`badge-${model.status.result}`">
                  {{ formatStatus(model.status.result) }}
                </span>
              </td>
              <td>
                <span class="context-len">
                  {{ model.context_length != null ? formatContext(model.context_length) : '—' }}
                </span>
              </td>
              <td>
                <div class="best-for-tags">
                  <span v-for="tag in model.best_for.slice(0, 3)" :key="tag" class="tag">
                    {{ tag }}
                  </span>
                  <span v-if="model.best_for.length > 3" class="tag">
                    +{{ model.best_for.length - 3 }}
                  </span>
                </div>
              </td>
              <td>
                <span class="font-sm text-dim">
                  {{ model.input_price_per_million != null ? '$' + model.input_price_per_million : '—' }}
                </span>
              </td>
              <td>
                <span class="font-sm text-dim">
                  {{ model.output_price_per_million != null ? '$' + model.output_price_per_million : '—' }}
                </span>
              </td>
              <td>
                <div class="detail-text" :title="model.status.detail">
                  {{ model.status.detail }}
                </div>
              </td>
            </tr>
          </template>
          <tr v-else>
            <td colspan="8" class="empty-state">
              <div class="empty-state-inner">
                <span class="empty-state-icon">🔍</span>
                <p>No models match your filters.</p>
                <button class="refresh-btn" @click="resetFilters">Clear all filters</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <button :disabled="page === 1" @click="page = 1" aria-label="First page">«</button>
      <button :disabled="page === 1" @click="page--" aria-label="Previous page">‹</button>
      <template v-for="p in pageNumbers" :key="p">
        <button v-if="p !== '…'" :class="{ 'page-btn': true, active: p === page }" @click="page = p as number">
          {{ p }}
        </button>
        <span v-else class="page-ellipsis">…</span>
      </template>
      <button :disabled="page === totalPages" @click="page++" aria-label="Next page">›</button>
      <button :disabled="page === totalPages" @click="page = totalPages" aria-label="Last page">»</button>
      <select v-model.number="perPage" class="per-page-select">
        <option :value="10">10 / page</option>
        <option :value="25">25 / page</option>
        <option :value="50">50 / page</option>
        <option :value="sortedModels.length">All</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useModelsStore } from '@/store/models'

const store = useModelsStore()
const search = ref('')
const providerFilter = ref('')
const statusFilter = ref('')
const typeFilter = ref('')
const sortBy = ref('name')
const sortDesc = ref(false)
const page = ref(1)
const perPage = ref(25)

// Reset to page 1 when filters or sort change
watch([search, providerFilter, statusFilter, typeFilter, sortBy, sortDesc], () => {
  page.value = 1
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
      case 'price_in': {
        const aPrice = a.input_price_per_million
        const bPrice = b.input_price_per_million
        if (aPrice == null && bPrice == null) return 0
        if (aPrice == null) return 1
        if (bPrice == null) return -1
        return dir * (aPrice - bPrice)
      }
      case 'price_out': {
        const aPrice = a.output_price_per_million
        const bPrice = b.output_price_per_million
        if (aPrice == null && bPrice == null) return 0
        if (aPrice == null) return 1
        if (bPrice == null) return -1
        return dir * (aPrice - bPrice)
      }
      case 'detail':
        return dir * a.status.detail.localeCompare(b.status.detail)
      default:
        return dir * a.name.localeCompare(b.name)
    }
  })

  return sorted
})

const totalPages = computed(() => Math.max(1, Math.ceil(sortedModels.value.length / perPage.value)))

const paginatedModels = computed(() => {
  const start = (page.value - 1) * perPage.value
  return sortedModels.value.slice(start, start + perPage.value)
})

const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 })

function formatContext(n: number): string {
  return fmt.format(n)
}

const pageNumbers = computed((): (number | string)[] => {
  const total = totalPages.value
  const current = page.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | string)[] = [1]
  if (current > 3) pages.push('…')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
})
</script>
