<template>
  <div class="model-list-page">
    <!-- Stale warning -->
    <div v-if="store.isStale" class="stale-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span>Data may be stale (loaded over 1 hour ago).</span>
      <button @click="store.loadData()" class="refresh-btn refresh-btn-sm">Refresh</button>
    </div>

    <!-- Page header -->
    <div class="ml-header">
      <h2>Models</h2>
      <p class="ml-subtitle">{{ filteredModels.length }} models from {{ store.creators.length }} creators</p>
    </div>

    <!-- Controls -->
    <div class="ml-controls">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search models..."
        class="ml-search"
        aria-label="Search models"
      />
      <select v-model="creatorFilter" class="ml-select" aria-label="Filter by creator">
        <option value="">All Creators</option>
        <option v-for="c in store.creators" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select v-model="statusFilter" class="ml-select" aria-label="Filter by status">
        <option value="">All</option>
        <option value="working">Working</option>
        <option value="mixed">Mixed</option>
        <option value="untested">Untested</option>
        <option value="down">Down</option>
      </select>
      <select v-model="priceFilter" class="ml-select" aria-label="Filter by price">
        <option value="">All</option>
        <option value="free">Free only</option>
        <option value="paid">Paid only</option>
      </select>
      <div class="ml-sort">
        <select v-model="sortKey" class="ml-select" aria-label="Sort by">
          <option value="name">Name</option>
          <option value="context">Context</option>
          <option value="price">Price</option>
          <option value="providers">Providers</option>
        </select>
        <button class="ml-sort-dir" @click="sortAsc = !sortAsc" :title="sortAsc ? 'Ascending' : 'Descending'">
          {{ sortAsc ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <!-- Export buttons -->
    <div class="ml-export">
      <button @click="exportJSON" class="export-btn">Export JSON</button>
      <button @click="exportCSV" class="export-btn">Export CSV</button>
    </div>

    <!-- Model list -->
    <div class="ml-list">
      <ModelCard
        v-for="{ model, creator } in filteredAndSortedModels"
        :key="model.super_id"
        :model="model"
        :creator="creator"
        @model-click="openDetail(model, creator)"
        @provider-click="openDetail(model, creator)"
      />
    </div>

    <!-- Empty state -->
    <div v-if="filteredAndSortedModels.length === 0 && !store.loading" class="ml-empty">
      <p>No models match your filters.</p>
      <button @click="clearFilters" class="refresh-btn">Clear filters</button>
    </div>

    <!-- Detail panel -->
    <ModelDetailPanel
      v-if="detailModel"
      :open="!!detailModel"
      :model="detailModel.model"
      :creator="detailModel.creator"
      @close="detailModel = null"
      @navigate-to="detailModel = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ModelCard from '@/components/ModelCard.vue'
import ModelDetailPanel from '@/components/ModelDetailPanel.vue'
import { useModelsStore } from '@/store/models'
import type { ModelData, CreatorData } from '@/types'

const store = useModelsStore()

const searchQuery = ref('')
const creatorFilter = ref('')
const statusFilter = ref('')
const priceFilter = ref('')
const sortKey = ref('name')
const sortAsc = ref(true)

const detailModel = ref<{ model: ModelData; creator: CreatorData } | null>(null)

function openDetail(model: ModelData, creator: CreatorData) {
  detailModel.value = { model, creator }
}

function getModelStatus(model: ModelData): string {
  const active = model.providers.filter(p => !p._removed)
  if (!active.length) return 'down'
  const working = active.filter(p => p.status.result === 'working').length
  if (working === active.length) return 'working'
  if (working > 0) return 'mixed'
  return 'down'
}

const filteredModels = computed(() => {
  let models = store.allModels

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    models = models.filter(m => m.name.toLowerCase().includes(q))
  }

  if (creatorFilter.value) {
    models = models.filter(m => {
      const creator = store.creators.find(c => c.models.some(mod => mod.super_id === m.super_id))
      return creator?.id === creatorFilter.value
    })
  }

  if (statusFilter.value) {
    models = models.filter(m => getModelStatus(m) === statusFilter.value)
  }

  if (priceFilter.value === 'free') {
    models = models.filter(m => m.providers.some(p => p.is_free && p.input_price_per_million === 0 && p.output_price_per_million === 0))
  } else if (priceFilter.value === 'paid') {
    models = models.filter(m => !m.providers.some(p => p.is_free && p.input_price_per_million === 0 && p.output_price_per_million === 0))
  }

  return models
})

const filteredAndSortedModels = computed(() => {
  const list = filteredModels.value.map(model => {
    const creator = store.creators.find(c => c.models.some(m => m.super_id === model.super_id))!
    return { model, creator }
  })

  list.sort((a, b) => {
    let aVal: any, bVal: any
    switch (sortKey.value) {
      case 'name': aVal = a.model.name; bVal = b.model.name; break
      case 'context': aVal = a.model.best_context; bVal = b.model.best_context; break
      case 'price': aVal = a.model.cheapest_input_price + a.model.cheapest_output_price; bVal = b.model.cheapest_input_price + b.model.cheapest_output_price; break
      case 'providers': aVal = a.model.providers.length; bVal = b.model.providers.length; break
      default: return 0
    }
    if (aVal == null) return 1
    if (bVal == null) return -1
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal
    return sortAsc.value ? cmp : -cmp
  })

  return list
})

function clearFilters() {
  searchQuery.value = ''
  creatorFilter.value = ''
  statusFilter.value = ''
  priceFilter.value = ''
}

function exportJSON() {
  const data = filteredAndSortedModels.value.map(({ model, creator }) => ({
    name: model.name,
    creator: creator.name,
    providers: model.providers.map(p => ({
      provider: p.provider,
      context: p.context_length,
      input_price: p.input_price_per_million,
      output_price: p.output_price_per_million,
      free: p.is_free,
      tools: p.supports_tools,
      status: p.status.result,
    })),
  }))
  downloadFile(JSON.stringify(data, null, 2), 'models.json', 'application/json')
}

function exportCSV() {
  const rows = [['Model', 'Creator', 'Provider', 'Context', 'Input Price', 'Output Price', 'Free', 'Tools', 'Status']]
  for (const { model, creator } of filteredAndSortedModels.value) {
    for (const p of model.providers) {
      rows.push([
        model.name, creator.name, p.provider,
        String(p.context_length || ''),
        String(p.input_price_per_million),
        String(p.output_price_per_million),
        String(p.is_free),
        String(!!p.supports_tools),
        p.status.result,
      ])
    }
  }
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  downloadFile(csv, 'models.csv', 'text/csv')
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.model-list-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.stale-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid var(--orange);
  border-radius: 8px;
  font-size: 0.78rem;
  color: var(--orange);
}

.ml-header { margin-bottom: 16px; }
.ml-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.ml-subtitle { font-size: 0.78rem; color: var(--text-muted); margin: 0; }

.ml-controls { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }

.ml-search {
  flex: 1; min-width: 200px; padding: 8px 12px;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated); color: var(--text);
  font-size: 0.82rem; font-family: inherit;
}
.ml-search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-subtle); }

.ml-select {
  padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated); color: var(--text);
  font-size: 0.78rem; font-family: inherit; cursor: pointer;
}

.ml-sort { display: flex; gap: 4px; }

.ml-sort-dir {
  padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated); color: var(--text); cursor: pointer; font-size: 0.78rem;
}

.ml-export { display: flex; gap: 8px; margin-bottom: 16px; }

.export-btn {
  padding: 6px 14px; font-size: 0.72rem; font-weight: 600;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated); color: var(--text); cursor: pointer; font-family: inherit;
}
.export-btn:hover { border-color: var(--accent); color: var(--accent); }

.ml-list { display: flex; flex-direction: column; gap: 8px; }

.ml-empty { text-align: center; padding: 40px 20px; color: var(--text-muted); }

.refresh-btn {
  padding: 6px 12px; font-size: 0.72rem;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated); color: var(--text); cursor: pointer; font-family: inherit;
}
.refresh-btn:hover { border-color: var(--accent); }
.refresh-btn-sm { padding: 4px 10px; font-size: 0.68rem; margin-left: auto; }

@media (max-width: 768px) {
  .model-list-page { padding: 12px; }
  .ml-controls { flex-direction: column; }
  .ml-search { min-width: auto; }
}
</style>