<template>
  <div>
    <div class="page-header">
      <h2>All</h2>
      <p>Browse, search, and filter all tracked models — free and paid</p>
    </div>

    <!-- JQL Filter Bar -->
    <div class="jql-bar">
      <div class="jql-input-row">
        <svg class="jql-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          ref="jql.inputRef"
          v-model="jql.rawQuery.value"
          type="text"
          class="jql-input"
          placeholder="Filter: field:value, field:>number, field IN (a,b), ORDER BY field DESC…"
          spellcheck="false"
          @input="jql.onInput"
          @keydown="jql.onKeydown"
          @focus="jql.onFocus"
          @blur="jql.onBlur"
        />
        <button v-if="jql.rawQuery.value" class="jql-clear" @click="jql.rawQuery.value = ''" title="Clear filter">✕</button>
      </div>

      <div v-if="jql.suggestions.value" class="jql-suggestions">
        <div
          v-for="(opt, i) in jql.suggestions.value.options"
          :key="opt.value"
          class="jql-suggestion"
          :class="{ active: i === jql.activeSuggestion.value }"
          @mousedown.prevent="jql.applySuggestion(opt.insert)"
        >
          <span class="jql-sugg-label">{{ opt.label }}</span>
          <span class="jql-sugg-insert">{{ opt.insert }}</span>
        </div>
      </div>

      <div class="jql-chips">
        <button
          v-for="(token, i) in allTokens"
          :key="`${token.field}-${token.rawValue}-${i}`"
          class="jql-chip"
          :class="{ 'jql-chip-negated': token.op === '!=' || token.op === 'NOT IN' }"
          @click="jql.removeToken(i)"
          :title="`Remove ${token.label}`"
        >
          <span class="jql-chip-label">{{ token.label }}</span>
          <span class="jql-chip-remove">✕</span>
        </button>
        <button v-if="hasOrderBy" class="jql-chip jql-chip-sort" @click="clearOrderBy" title="Remove sort">
          <span class="jql-chip-label">ORDER BY {{ jql.parsed.value.orderBy }} {{ jql.parsed.value.orderDir }}</span>
          <span class="jql-chip-remove">✕</span>
        </button>
      </div>

      <div v-if="jql.validationErrors.value.length" class="jql-errors">
        <div v-for="(err, i) in jql.validationErrors.value" :key="i" class="jql-error">
          <svg class="jql-error-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span class="jql-error-msg">{{ err.message }}</span>
        </div>
      </div>

      <div class="jql-bar-footer">
        <span class="filter-count">
          {{ jql.filteredModels.value.length }} of {{ store.allModels.length }} models
        </span>
        <div class="export-btns">
          <button class="export-btn" title="Export as CSV" @click="exportCsv">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV
          </button>
          <button class="export-btn" title="Export as JSON" @click="exportJson">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            JSON
          </button>
        </div>
      </div>
    </div>

    <!-- Visual Query Builder -->
    <QueryBuilder
      :conditions="builderConditions"
      :jql-query="jql.rawQuery.value ?? ''"
      :provider-names="store.allProviderNames"
      :author-names="store.allAuthorNames"
      @change="onBuilderChange"
      @clear="onBuilderClear"
    />

    <div class="filters">
      <div class="sort-controls">
        <select v-model="sortBy" class="sort-select">
          <option value="name">Sort: Name</option>
          <option value="author">Sort: Author</option>
          <option value="provider">Sort: Provider</option>
          <option value="type">Sort: Type</option>
          <option value="status">Sort: Status</option>
          <option value="context">Sort: Context</option>
          <option value="detail">Sort: Detail</option>
        </select>
        <button class="sort-dir-btn" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Descending' : 'Ascending'">
          <svg v-if="sortDesc" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </button>
      </div>
      <span class="result-count">{{ sortedItems.length }} result{{ sortedItems.length !== 1 ? 's' : '' }}</span>
    </div>

    <div class="table-wrap vscroll-table">
      <div class="vscroll-header-row">
        <div class="vscroll-header-cell col-name sortable" :class="{ active: sortBy === 'name' }" @click="setSort('name')">
          Model <SortArrow :active="sortBy === 'name'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-author sortable" :class="{ active: sortBy === 'author' }" @click="setSort('author')">
          Author <SortArrow :active="sortBy === 'author'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-provider sortable" :class="{ active: sortBy === 'provider' }" @click="setSort('provider')">
          Provider <SortArrow :active="sortBy === 'provider'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-type sortable" :class="{ active: sortBy === 'type' }" @click="setSort('type')">
          Type <SortArrow :active="sortBy === 'type'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-status sortable" :class="{ active: sortBy === 'status' }" @click="setSort('status')">
          Status <SortArrow :active="sortBy === 'status'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-context sortable" :class="{ active: sortBy === 'context' }" @click="setSort('context')">
          Context <SortArrow :active="sortBy === 'context'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-detail sortable" :class="{ active: sortBy === 'detail' }" @click="setSort('detail')">
          Details <SortArrow :active="sortBy === 'detail'" :desc="sortDesc" />
        </div>
      </div>

      <DynamicScroller
        v-if="sortedItems.length > 0"
        ref="scrollerRef"
        :key="'scroller-' + isMobile"
        :items="sortedItems"
        :min-item-size="56"
        key-field="id"
        class="vscroll-body"
      >
        <template #default="{ item, active }">
          <DynamicScrollerItem :item="item" :active="active">
          <div class="vscroll-row row-clickable" :class="{ 'row-removed': item._removed }" @click="selectedModel = item" role="button" tabindex="0" :title="'View details for ' + item.name">
            <div class="vscroll-cell col-name">
              <router-link :to="`/super/${item.super_id}`" class="model-name-link" :title="item.name" @click.stop>{{ item.name }}</router-link>
              <div class="model-id-wrap">
                <span class="model-id" :title="item.id">{{ item.id }}</span>
                <button class="copy-btn" :class="{ copied: copiedIds.has(item.id) }" :title="copiedIds.has(item.id) ? 'Copied!' : 'Copy ID'" aria-label="Copy model ID" @click.stop="handleCopy(item.id)">
                  {{ copiedIds.has(item.id) ? '✓' : '📋' }}
                </button>
              </div>
            </div>
            <div class="vscroll-cell col-author" data-label="Author" aria-label="Author">{{ item.author }}</div>
            <div class="vscroll-cell col-provider" data-label="Provider" aria-label="Provider">
              <span>{{ item.provider }}</span>
              <span v-if="store.isModelProviderUsedUp(item.id)" class="used-up-icon" title="Provider used up for this month">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
            </div>
            <div class="vscroll-cell col-type" data-label="Type" aria-label="Type">
              <span class="badge" :class="item.is_free ? 'badge-free-type' : 'badge-paid-type'">
                {{ item.is_free ? 'Free' : 'Paid' }}
              </span>
            </div>
            <div class="vscroll-cell col-status" data-label="Status" aria-label="Status">
              <span v-if="item._removed" class="badge badge-removed" title="No longer offered as free by provider">
                Removed
              </span>
              <span v-else class="badge" :class="`badge-${item.status.result}`">
                {{ formatStatus(item.status.result) }}
              </span>
            </div>
            <div class="vscroll-cell col-context" data-label="Context" aria-label="Context">
              <span class="context-len">{{ item.context_length != null ? formatContext(item.context_length) : '—' }}</span>
            </div>
            <div class="vscroll-cell col-detail" data-label="Details" aria-label="Details">
              <div class="best-for-tags">
                <span v-for="tag in item.best_for.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
                <span v-if="item.best_for.length > 3" class="tag">+{{ item.best_for.length - 3 }}</span>
                <span v-if="item.supports_tools === true" class="tag tool-tag">Tools ✓</span>
              </div>
              <div class="detail-text" :title="item.status.detail">{{ item.status.detail }}</div>
            </div>
          </div>
          </DynamicScrollerItem>
        </template>
      </DynamicScroller>

      <div v-else class="empty-state">
        <div class="empty-state-inner">
          <div class="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </div>
          <h3>No models found</h3>
          <p>No models match the current filters. Try adjusting your search criteria or clearing all filters.</p>
          <button class="clear-btn" @click="clearAll">Clear all filters</button>
        </div>
      </div>
    </div>

    <!-- Detail Panel -->
    <ModelDetail :model="selectedModel" @close="selectedModel = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted, onUnmounted, h, defineComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModelsStore } from '@/store/models'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import { useJqlFilter } from '@/composables/useJqlFilter'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useToast } from '@/composables/useToast'
import type { FilterToken, SortSpec } from '@/composables/useJqlFilter'
import type { Model } from '@/types'
import type { BuilderCondition } from '@/components/QueryBuilder.vue'
import ModelDetail from '@/components/ModelDetail.vue'
import QueryBuilder from '@/components/QueryBuilder.vue'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

type ScrollerExposed = { scrollToPosition: (pos: number) => void }
const scrollerRef = ref<ScrollerExposed | null>(null)

const SortArrow = defineComponent({
  props: { active: Boolean, desc: Boolean },
  setup(props) {
    return () => h('span', { class: ['sort-arrow', { active: props.active }] },
      props.active ? (props.desc ? ' ↓' : ' ↑') : ' ⇅'
    )
  }
})

const store = useModelsStore()
const { isMobile } = useBreakpoint()
const route = useRoute()
const router = useRouter()
const selectedModel = ref<Model | null>(null)
const copiedIds = reactive(new Set<string>())

const { showToast } = useToast()

watch(() => route.query.model, (id) => {
  if (id && typeof id === 'string') {
    selectedModel.value = store.getModelById(id) ?? null
  } else {
    selectedModel.value = null
  }
}, { immediate: true })

watch(selectedModel, (m) => {
  const currentId = route.query.model
  if (m && currentId !== m.id) {
    router.replace({ ...route, query: { ...route.query, model: m.id } })
  } else if (!m && currentId) {
    const q = { ...route.query }
    delete q.model
    router.replace({ ...route, query: q })
  }
})
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function handleCopy(id: string) {
  try { await navigator.clipboard.writeText(id) }
  catch {
    const ta = document.createElement('textarea')
    ta.value = id; ta.style.position = 'fixed'; ta.style.left = '-9999px'
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
  }
  copiedIds.add(id)
  showToast(`Copied: ${id}`, 'success')
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => copiedIds.delete(id), 1500)
}

const sortBy = ref('name')
const sortDesc = ref(false)
const builderConditions = ref<BuilderCondition[]>([])

const jql = useJqlFilter(
  computed(() => store.allModels),
  computed(() => store.allProviderNames),
  computed(() => store.allAuthorNames),
)
function readQueryFromUrl() {
  if (route.query.q && typeof route.query.q === 'string') {
    jql.rawQuery.value = route.query.q
  }
}
function writeQueryToUrl(q: string) {
  router.replace({ ...route, query: { ...route.query, q: q.trim() || undefined } })
}
onMounted(() => readQueryFromUrl())
watch(() => jql.rawQuery.value, (q) => writeQueryToUrl(q))

watch(jql.sortSpec, (spec: SortSpec | null) => {
  if (spec) { sortBy.value = spec.field; sortDesc.value = spec.desc }
  else { sortBy.value = 'name'; sortDesc.value = false }
})

watch([() => jql.rawQuery.value, sortBy, sortDesc], () => {
  scrollerRef.value?.scrollToPosition(0)
})

const allTokens = computed<FilterToken[]>(() =>
  jql.parsed.value.expression.flat().filter(t => t.field !== '_text'),
)
const hasOrderBy = computed(() => !!jql.parsed.value.orderBy)

function onBuilderChange(conditions: BuilderCondition[]) {
  builderConditions.value = conditions
  syncBuilderToQuery(conditions)
}
function onBuilderClear() {
  builderConditions.value = []
  jql.rawQuery.value = ''
}
function clearAll() {
  jql.rawQuery.value = ''
  builderConditions.value = []
  sortBy.value = 'name'
  sortDesc.value = false
}

function syncBuilderToQuery(conditions: BuilderCondition[]) {
  if (conditions.length === 0) { jql.rawQuery.value = ''; return }
  let q = conditions[0].jql
  for (let i = 1; i < conditions.length; i++) {
    q += conditions[i].joinOr ? ' OR ' : ' AND '
    q += conditions[i].jql
  }
  jql.rawQuery.value = q
}
watch(() => jql.rawQuery.value, () => {
  const tt = jql.parsed.value.expression.flat().filter(t => t.field !== '_text')
  if (tt.length !== builderConditions.value.length) builderConditions.value = []
})
function clearOrderBy() {
  jql.rawQuery.value = jql.rawQuery.value.replace(/\s+ORDER\s+BY\s+\w+\s*(ASC|DESC)?\s*$/i, '').trim()
  sortBy.value = 'name'; sortDesc.value = false
}

function onLoadSavedQuery(e: Event) {
  const q = (e as CustomEvent).detail as string
  jql.rawQuery.value = q
  builderConditions.value = []
}
onMounted(() => window.addEventListener('load-saved-query', onLoadSavedQuery))
onUnmounted(() => window.removeEventListener('load-saved-query', onLoadSavedQuery))

function setSort(field: string) {
  if (sortBy.value === field) {
    sortDesc.value = !sortDesc.value
  } else {
    sortBy.value = field
    sortDesc.value = false
  }
}

const filteredModels = computed(() => jql.filteredModels.value)

const sortedItems = computed(() => {
  const arr = [...filteredModels.value]
  arr.sort((a, b) => {
    let cmp = 0
    switch (sortBy.value) {
      case 'author':
        cmp = (a.author ?? '').localeCompare(b.author ?? '')
        if (cmp === 0) cmp = (a.provider ?? '').localeCompare(b.provider ?? '')
        break
      case 'provider':
        cmp = (a.provider ?? '').localeCompare(b.provider ?? '')
        break
      case 'type':
        cmp = (a.is_free === b.is_free) ? 0 : a.is_free ? -1 : 1
        break
      case 'status':
        cmp = (a.status?.result ?? '').localeCompare(b.status?.result ?? '')
        break
      case 'context':
        cmp = (a.context_length ?? 0) - (b.context_length ?? 0)
        break
      case 'detail':
        cmp = (a.status?.detail ?? '').localeCompare(b.status?.detail ?? '')
        break
      case 'name':
      default:
        cmp = (a.name ?? '').localeCompare(b.name ?? '')
        break
    }
    return sortDesc.value ? -cmp : cmp
  })
  return arr
})

function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  if (e.key === 'Escape') {
    if (selectedModel.value) selectedModel.value = null
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportCsv() {
  const header = ['id', 'name', 'author', 'provider', 'status', 'context_length', 'type', 'input_price_per_million', 'output_price_per_million', 'best_for', 'tools', 'notes', 'status_detail', 'status_tested', 'last_success', 'removed', 'removed_date']
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const rows = sortedItems.value.map(m => [
    m.id, m.name, m.author ?? '', m.provider, m._removed ? 'removed' : m.status.result,
    m.context_length ?? '', m.is_free ? 'free' : 'paid',
    m.input_price_per_million ?? '', m.output_price_per_million ?? '',
    m.best_for.join('; '), m.supports_tools ? 'yes' : 'no', m.notes ?? '',
    m.status.detail, m.status.tested || '', m.last_success || '',
    m._removed ? 'yes' : 'no', m._removedDate || '',
  ].map(esc).join(','))
  const meta = [
    `# exported_at: ${new Date().toISOString()}`,
    `# count: ${sortedItems.value.length}/${store.allModels.length}`,
    `# query: ${jql.rawQuery.value || '(none)'}`,
    `# sort: ${sortBy.value} ${sortDesc.value ? 'DESC' : 'ASC'}`,
  ]
  const csv = [...meta, header.join(','), ...rows].join('\n')
  download(csv, 'models.csv', 'text/csv')
}

function exportJson() {
  const data = sortedItems.value.map(m => ({
    id: m.id, name: m.name, author: m.author ?? null, provider: m.provider,
    status: m._removed ? 'removed' : m.status.result,
    context_length: m.context_length, type: m.is_free ? 'free' : 'paid',
    input_price_per_million: m.input_price_per_million ?? null,
    output_price_per_million: m.output_price_per_million ?? null,
    best_for: m.best_for, supports_tools: m.supports_tools ?? false,
    notes: m.notes, status_detail: m.status.detail,
    status_tested: m.status.tested || null, last_success: m.last_success || null,
    _removed: m._removed || false, _removedDate: m._removedDate || null,
  }))
  const json = JSON.stringify({
    _meta: {
      exported_at: new Date().toISOString(),
      count: data.length,
      total_models: store.allModels.length,
      jql_query: jql.rawQuery.value || null,
      sort_by: sortBy.value,
      sort_desc: sortDesc.value,
    },
    models: data,
  }, null, 2)
  download(json, 'models.json', 'application/json')
}

function formatStatus(s: string | undefined): string {
  if (!s) return '—'
  if (s === 'rate_limited') return 'Rate-limited'
  if (s === 'small_model') return 'Small model'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const fmtCompact = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 })
function formatContext(n: number): string { return fmtCompact.format(n) }
</script>

<style scoped>
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sort-select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.sort-select:focus {
  border-color: var(--accent);
}

.sort-dir-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.sort-dir-btn:hover {
  color: var(--text);
  border-color: var(--accent);
}

.result-count {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
  margin-left: auto;
  font-weight: 500;
}

.vscroll-table {
  height: calc(100vh - 260px);
  min-height: 300px;
}

.vscroll-row {
  min-height: 56px;
  height: auto;
  align-items: flex-start;
  padding: 4px 0;
}

.vscroll-cell {
  justify-content: flex-start;
  align-items: flex-start;
  padding-top: 8px;
  padding-bottom: 8px;
  min-height: 48px;
}

.col-status,
.col-context,
.col-type {
  align-items: center;
}

:deep(.vscroll-row) {
  cursor: pointer;
}

.col-name     { width: 20%; min-width: 150px; }
.col-author   { width: 9%;  min-width: 75px; }
.col-provider { width: 11%; min-width: 95px; }
.col-type     { width: 7%;  min-width: 65px; }
.col-status   { width: 8%;  min-width: 75px; }
.col-context  { width: 7%;  min-width: 60px; }
.col-detail   { width: 15%; min-width: 150px; }

.sort-arrow {
  font-size: 0.65rem;
  opacity: 0.3;
  font-weight: 400;
}

.sort-arrow.active {
  opacity: 1;
}

.jql-bar {
  margin-bottom: 4px;
}
.jql-input-row {
  display: flex; align-items: center; gap: 6px;
  background: var(--bg-elevated, var(--surface)); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 6px 10px; margin-bottom: 4px;
  position: relative;
}
.jql-input-row:focus-within { border-color: var(--accent); }
.jql-search-icon { color: var(--text-muted); flex-shrink: 0; }
.jql-input {
  flex: 1; background: none; border: none; color: var(--text);
  font-size: 0.78rem; outline: none; padding: 0; font-family: inherit;
}
.jql-input::placeholder { color: var(--text-muted); font-size: 0.75rem; }
.jql-clear {
  background: none; border: none; color: var(--text-muted); cursor: pointer;
  padding: 0 2px; font-size: 0.8rem; line-height: 1;
}
.jql-clear:hover { color: var(--text); }
.jql-suggestions {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 50;
  background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: var(--radius-sm); max-height: 240px; overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35); margin-top: 2px;
}
.jql-suggestion {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px; cursor: pointer; font-size: 0.75rem;
  border-bottom: 1px solid var(--border);
}
.jql-suggestion:last-child { border-bottom: none; }
.jql-suggestion.active { background: rgba(88,166,255,0.12); }
.jql-suggestion:hover { background: rgba(88,166,255,0.08); }
.jql-sugg-label { font-weight: 600; color: var(--text); flex: 1; }
.jql-sugg-insert { color: var(--text-muted); font-size: 0.7rem; font-family: monospace; }

.tool-tag {
  background: rgba(88,166,255,0.10);
  color: var(--accent);
  border-color: rgba(88,166,255,0.2);
}
</style>
