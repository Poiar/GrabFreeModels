<template>
  <div>
    <div class="page-header">
      <h2>Rankings</h2>
      <p>Role-specific ranked lists of verified free models only — paid, removed, broken, and rate-limited models are excluded. Use the type picker to switch which ranking to sort by; each model's other role rankings are shown as pills.</p>
    </div>

    <!-- JQL Filter Bar -->
    <div class="jql-bar">
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

      <div class="jql-input-wrap">
        <span class="jql-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </span>
        <div class="jql-highlight" aria-hidden="true" v-html="highlightedQuery"></div>
        <input
          ref="jql.inputRef"
          v-model="jql.rawQuery.value"
          type="text"
          class="jql-input"
          :class="{ 'jql-input-invalid': jql.validationErrors.value.length > 0 }"
          placeholder='Try: provider:openrouter status:working context:>100000 ORDER BY context DESC'
          spellcheck="false"
          autocomplete="off"
          @input="jql.onInput"
          @keydown="jql.onKeydown"
          @focus="jql.onFocus"
          @blur="jql.onBlur"
          @click="jql.onInput($event)"
        />
        <button v-if="jql.rawQuery.value || allTokens.length" class="jql-clear" @click="clearAll" title="Clear all">✕</button>
        <div class="jql-underline" v-if="jql.validationErrors.value.length">
          <div
            v-for="(err, i) in jql.validationErrors.value"
            :key="i"
            class="jql-underline-mark"
            :style="underlineStyle(err)"
          />
        </div>
      </div>

      <div v-if="jql.showSuggestions.value && jql.suggestions.value" class="jql-suggestions">
        <div
          v-for="(opt, si) in jql.suggestions.value.options"
          :key="opt.insert"
          class="jql-suggestion"
          :class="{ 'jql-suggestion-active': si === jql.activeSuggestion.value }"
          @mousedown.prevent="jql.applySuggestion(opt.insert)"
          @mouseenter="jql.activeSuggestion.value = si"
        >
          <span class="jql-suggestion-label">{{ opt.label }}</span>
          <span class="jql-suggestion-field">{{ opt.insert }}</span>
        </div>
        <div v-if="!jql.suggestions.value.options.length" class="jql-suggestion-empty">
          No matching {{ jql.suggestions.value.field }}s
        </div>
      </div>

      <div class="jql-bar-footer">
        <span class="filter-count">
          {{ sortedItems.length }} of {{ flatRankings.length }} ranked models
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
        <span class="jql-hint">
          <kbd>field:value</kbd> · <kbd>!=</kbd> · <kbd>&gt;</kbd> · <kbd>&lt;</kbd> · <kbd>IS EMPTY</kbd> · <kbd>IN (a,b)</kbd> · <kbd>NOT</kbd> · <kbd>OR</kbd> · <kbd>ORDER BY</kbd>
        </span>
      </div>
    </div>

    <!-- Visual Query Builder -->
    <QueryBuilder
      :conditions="builderConditions"
      :jql-query="jql.rawQuery.value ?? ''"
      @change="onBuilderChange"
      @clear="onBuilderClear"
    />

    <div class="filters">
      <div class="role-filter">
        <div class="type-pills">
          <button
            v-for="role in ROLES"
            :key="role"
            :class="['status-btn', { active: roleFilter === role }]"
            @click="roleFilter = role"
          >
            {{ formatRole(role) }}
          </button>
        </div>
      </div>
      <div class="sort-controls" v-if="sortBy !== 'rank'">
        <select v-model="sortBy" class="sort-select">
          <option value="name">Sort: Name</option>
          <option value="author">Sort: Author</option>
          <option value="provider">Sort: Provider</option>
          <option value="context">Sort: Context</option>
        </select>
        <button class="sort-dir-btn" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Descending' : 'Ascending'">
          <svg v-if="sortDesc" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </button>
      </div>
      <span class="result-count">{{ sortedItems.length }} result{{ sortedItems.length !== 1 ? 's' : '' }}</span>
    </div>

    <div class="vscroll-table">
      <div class="vscroll-header-row">
        <div class="vscroll-header-cell col-rank sortable" :class="{ active: sortBy === 'rank' }" @click="setSort('rank')">
          {{ formatRole(roleFilter) }} Rank <SortArrow :active="sortBy === 'rank'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-model sortable" :class="{ active: sortBy === 'name' }" @click="setSort('name')">
          Model <SortArrow :active="sortBy === 'name'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-author sortable" :class="{ active: sortBy === 'author' }" @click="setSort('author')">
          Author <SortArrow :active="sortBy === 'author'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-provider sortable" :class="{ active: sortBy === 'provider' }" @click="setSort('provider')">
          Provider <SortArrow :active="sortBy === 'provider'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-status">Status</div>
        <div class="vscroll-header-cell col-context sortable" :class="{ active: sortBy === 'context' }" @click="setSort('context')">
          Context <SortArrow :active="sortBy === 'context'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-tools">Tools</div>
        <div class="vscroll-header-cell col-tags">Tags</div>
      </div>

      <RecycleScroller
        v-if="sortedItems.length > 0"
        ref="scrollerRef"
        :items="sortedItems"
        :item-size="56"
        key-field="modelId"
        class="vscroll-body"
      >
        <template #default="{ item }">
          <div class="vscroll-row">
            <div class="vscroll-cell col-rank">
              <div class="rank-pills">
                <span
                  v-for="r in item.rankings"
                  :key="r.role"
                  class="rank-pill"
                  :class="{ 'rank-top': r.rank <= 3, 'rank-active': r.role === roleFilter }"
                  :data-role="r.role"
                  :title="formatRole(r.role) + ' rank #' + r.rank"
                >
                  <span class="rp-num">#{{ r.rank }}</span>
                  <span class="rp-role">{{ formatRole(r.role) }}</span>
                </span>
              </div>
            </div>
            <div class="vscroll-cell col-model">
              <div class="model-name" :title="item.model?.name ?? item.modelId">{{ item.model?.name ?? item.modelId }}</div>
              <div class="model-id-wrap">
                <span class="model-id" :title="item.modelId">{{ item.modelId }}</span>
                <button class="copy-btn" :class="{ copied: copiedIds.has(item.modelId) }" :title="copiedIds.has(item.modelId) ? 'Copied!' : 'Copy ID'" @click.stop="handleCopy(item.modelId)">
                  {{ copiedIds.has(item.modelId) ? '✓' : '📋' }}
                </button>
              </div>
            </div>
            <div class="vscroll-cell col-author">{{ item.model?.author ?? '' }}</div>
            <div class="vscroll-cell col-provider">{{ item.model?.provider ?? '' }}</div>
            <div class="vscroll-cell col-status">
              <span class="badge" :class="`badge-${item.model?.status?.result ?? ''}`">
                {{ formatStatus(item.model?.status?.result) }}
              </span>
            </div>
            <div class="vscroll-cell col-context">
              <span class="context-badge" v-if="item.model?.context_length">
                {{ fmtContext(item.model.context_length) }}
              </span>
            </div>
            <div class="vscroll-cell col-tools">
              <span v-if="item.model?.supports_tools === true" class="tool-badge tool-yes" title="Supports tool calling">✓</span>
              <span v-else-if="item.model?.supports_tools === false" class="tool-badge tool-no" title="No tool calling">✗</span>
              <span v-else class="tool-badge tool-unknown">—</span>
            </div>
            <div class="vscroll-cell col-tags">
              <div class="best-for-tags">
                <span v-for="tag in (item.model?.best_for ?? []).slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
                <span v-if="(item.model?.best_for?.length ?? 0) > 3" class="tag">+{{ (item.model?.best_for?.length ?? 0) - 3 }}</span>
              </div>
            </div>
          </div>
        </template>
      </RecycleScroller>

      <div v-else class="empty-state">
        <div class="empty-state-inner">
          <div class="empty-state-icon">🔍</div>
          <p>No models match the current filters</p>
          <button class="clear-btn" @click="clearAll">Clear filters</button>
        </div>
      </div>
    </div>

    <!-- Working but unranked -->
    <div v-if="unrankedWorking.length > 0" class="unranked-section">
      <h3 class="section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>
        Working but Unranked
        <span class="unranked-count">{{ unrankedWorking.length }} model{{ unrankedWorking.length !== 1 ? 's' : '' }}</span>
      </h3>
      <p class="unranked-hint">These models are working and free but not yet assigned to a role ranking.</p>
      <div class="unranked-grid">
        <div v-for="model in unrankedWorking" :key="model.id" class="unranked-card">
          <div class="unranked-name" :title="model.name">{{ model.name }}</div>
          <div class="unranked-id-wrap">
            <span class="model-id" :title="model.id">{{ model.id }}</span>
            <button class="copy-btn" :class="{ copied: copiedIds.has(model.id) }" :title="copiedIds.has(model.id) ? 'Copied!' : 'Copy ID'" @click.stop="handleCopy(model.id)">
              {{ copiedIds.has(model.id) ? '✓' : '📋' }}
            </button>
          </div>
          <div class="unranked-meta">
            <span class="badge badge-provider">{{ model.provider }}</span>
            <span v-if="model.context_length" class="badge badge-context">{{ fmtContext(model.context_length) }}</span>
            <span v-for="tag in model.best_for.slice(0, 2)" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted, onUnmounted, h, defineComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModelsStore } from '@/store/models'
import { RecycleScroller } from 'vue-virtual-scroller'
import { useJqlFilter } from '@/composables/useJqlFilter'
import { useSavedSearches } from '@/composables/useSavedSearches'
import type { FilterToken, SortSpec } from '@/composables/useJqlFilter'
import type { Model } from '@/types'
import type { BuilderCondition } from '@/components/QueryBuilder.vue'
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
const route = useRoute()
const router = useRouter()
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
  copyTimer = setTimeout(() => { copiedIds.delete(id) }, 1500)
}

const ROLES = ['model', 'build', 'general', 'small_model', 'explore'] as const
type Role = (typeof ROLES)[number]

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatStatus(s: string | undefined): string {
  if (!s) return '—'
  if (s === 'rate_limited') return 'Rate-limited'
  if (s === 'small_model') return 'Small model'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtContext(n: number): string {
  return n >= 1048576 ? (n / 1048576).toFixed(1) + 'M' : Math.round(n / 1000) + 'K'
}

interface ModelRanking {
  modelId: string
  rankings: { role: string; rank: number }[]
  bestRank: number
  roleRank: number
}

const roleFilter = ref<Role>('model')

const flatRankings = computed<ModelRanking[]>(() => {
  const selectedRole = roleFilter.value
  const arr = store.roleRankings[selectedRole] ?? []
  const list: ModelRanking[] = []
  for (let i = 0; i < arr.length; i++) {
    const modelId = arr[i]
    const model = store.getModelById(modelId)
    if (!model || !model.is_free || model._removed || model.status.result === 'broken' || model.status.result === 'rate_limited') continue
    const allRankings: { role: string; rank: number }[] = []
    for (const role of ROLES) {
      const roleArr = store.roleRankings[role] ?? []
      const idx = roleArr.indexOf(modelId)
      if (idx !== -1) allRankings.push({ role, rank: idx + 1 })
    }
    allRankings.sort((a, b) => a.rank - b.rank)
    list.push({ modelId, rankings: allRankings, bestRank: allRankings[0].rank, roleRank: i + 1 })
  }
  return list
})

const sortBy = ref('rank')
const sortDesc = ref(false)
const builderConditions = ref<BuilderCondition[]>([])

const jql = useJqlFilter(
  computed(() => store.allModels),
  computed(() => store.allProviderNames),
  computed(() => store.allAuthorNames),
)
const { pushHistory } = useSavedSearches()

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

let historyTimer: ReturnType<typeof setTimeout> | null = null
watch(() => jql.rawQuery.value, (q) => {
  if (historyTimer) clearTimeout(historyTimer)
  historyTimer = setTimeout(() => { if (q.trim()) pushHistory(q.trim()) }, 2000)
})

watch(jql.sortSpec, (spec: SortSpec | null) => {
  if (spec) { sortBy.value = spec.field; sortDesc.value = spec.desc }
  else { sortBy.value = 'rank'; sortDesc.value = false }
})

watch([() => jql.rawQuery.value, sortBy, sortDesc, roleFilter], () => {
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
  sortBy.value = 'rank'
  sortDesc.value = false
}

function underlineStyle(err: { start: number; end: number }) {
  const charWidth = 7.8
  const left = 36 + err.start * charWidth
  const width = Math.max(8, (err.end - err.start) * charWidth)
  return { left: `${left}px`, width: `${width}px` }
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
  sortBy.value = 'rank'; sortDesc.value = false
}

function onLoadSavedQuery(e: Event) {
  const q = (e as CustomEvent).detail as string
  jql.rawQuery.value = q
  builderConditions.value = []
}
onMounted(() => window.addEventListener('load-saved-query', onLoadSavedQuery))
onUnmounted(() => window.removeEventListener('load-saved-query', onLoadSavedQuery))

const filtered = computed(() => {
  const jqlIds = new Set(jql.filteredModels.value.map(m => m.id))
  return flatRankings.value.filter(mr => jqlIds.has(mr.modelId))
})

const STATUS_ORDER: Record<string, number> = { working: 0, untested: 1, rate_limited: 2, broken: 3, paid: 4 }
const ROLE_ORDER: Record<string, number> = {}
ROLES.forEach((r, i) => { ROLE_ORDER[r] = i })

function setSort(field: string) {
  if (sortBy.value === field) {
    sortDesc.value = !sortDesc.value
  } else {
    sortBy.value = field
    sortDesc.value = false
  }
}

function bestRoleOrder(item: ModelRanking): number {
  let best = 99
  for (const r of item.rankings) {
    const o = ROLE_ORDER[r.role] ?? 99
    if (o < best) best = o
  }
  return best
}

const sortedItems = computed(() => {
  const arr = filtered.value.map(mr => ({
    ...mr,
    model: store.getModelById(mr.modelId),
  }))
  arr.sort((a, b) => {
    let cmp = 0
    switch (sortBy.value) {
      case 'rank':
        cmp = a.roleRank - b.roleRank
        if (cmp === 0) cmp = (STATUS_ORDER[a.model?.status?.result ?? ''] ?? 5) - (STATUS_ORDER[b.model?.status?.result ?? ''] ?? 5)
        if (cmp === 0) cmp = bestRoleOrder(a) - bestRoleOrder(b)
        break
      case 'name':
        cmp = (a.model?.name ?? '').localeCompare(b.model?.name ?? '')
        break
      case 'provider':
        cmp = (a.model?.provider ?? '').localeCompare(b.model?.provider ?? '')
        break
      case 'context':
        cmp = (a.model?.context_length ?? 0) - (b.model?.context_length ?? 0)
        break
      default:
        cmp = 0
    }
    return sortDesc.value ? -cmp : cmp
  })
  return arr
})

const rankedIds = computed(() => {
  const set = new Set<string>()
  for (const role of ROLES) {
    for (const id of (store.roleRankings[role] ?? [])) set.add(id)
  }
  return set
})

const unrankedWorking = computed(() =>
  store.workingModels.filter(m => !m._removed && !rankedIds.value.has(m.id) && !store.isModelProviderUsedUp(m.id))
)

function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

  if (e.key === '/') {
    e.preventDefault()
    const inputs = document.querySelectorAll<HTMLInputElement>('.jql-input, .search-input, input[type="text"]')
    if (inputs[0]) inputs[0].focus()
  }
  if (e.key === 'Escape') {
    if (selectedModel.value) selectedModel.value = null
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

const selectedModel = ref<Model | null>(null)

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
  const header = ['model_id', 'model_name', 'provider', 'status', 'context_length', 'best_for', 'role_rankings']
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const rows = sortedItems.value.map(mr => [
    mr.modelId, mr.model?.name ?? '', mr.model?.provider ?? '',
    mr.model?.status?.result ?? '', mr.model?.context_length ?? '',
    (mr.model?.best_for ?? []).join('; '),
    mr.rankings.map(r => `${r.role}:${r.rank}`).join('; '),
  ].map(esc).join(','))
  const meta = [
    `# exported_at: ${new Date().toISOString()}`,
    `# count: ${sortedItems.value.length}/${flatRankings.value.length}`,
    `# role: ${roleFilter.value}`,
    `# query: ${jql.rawQuery.value || '(none)'}`,
  ]
  const csv = [...meta, header.join(','), ...rows].join('\n')
  download(csv, 'rankings.csv', 'text/csv')
}

function exportJson() {
  const data = sortedItems.value.map(mr => ({
    model_id: mr.modelId,
    model_name: mr.model?.name ?? null,
    provider: mr.model?.provider ?? null,
    status: mr.model?.status?.result ?? null,
    context_length: mr.model?.context_length ?? null,
    best_for: mr.model?.best_for ?? [],
    tools: mr.model?.supports_tools ?? null,
    role_rankings: mr.rankings.map(r => ({ role: r.role, rank: r.rank })),
  }))
  const json = JSON.stringify({
    _meta: {
      exported_at: new Date().toISOString(),
      count: data.length,
      total_ranked: flatRankings.value.length,
      role: roleFilter.value,
      jql_query: jql.rawQuery.value || null,
    },
    rankings: data,
  }, null, 2)
  download(json, 'rankings.json', 'application/json')
}

const highlightedQuery = computed(() => {
  const raw = jql.rawQuery.value
  if (!raw) return ''
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const regex = /(\w+)\s+(NOT\s+IN)\s*\(\s*((?:"[^"]*"|[^)])+)\)|(\w+)\s+(IS\s+NOT\s+EMPTY|IS\s+EMPTY)|(?:NOT\s+)?(\w+)\s*(?:(:?>|:<!|=)|(:!=|!=)|:=|=)\s*(?:"([^"]*?)"|(\S+))|(\w+)\s+(IN)\s*\(\s*((?:"[^"]*"|[^)])+)\)|\b(OR)\b|\b(ORDER\s+BY\s+\w+\s*(?:ASC|DESC)?)\b/gi
  let result = '', last = 0, m: RegExpExecArray | null
  while ((m = regex.exec(raw)) !== null) {
    result += esc(raw.slice(last, m.index))
    if (m[1] != null) result += `<span class="jql-hl-field">${esc(m[1])}</span> <span class="jql-hl-op jql-hl-neg">${esc(m[2])}</span>(<span class="jql-hl-val jql-hl-neg">${esc(m[3])})</span>`
    else if (m[4] != null) result += `<span class="jql-hl-field">${esc(m[4])}</span> <span class="jql-hl-kw ${m[5]==='IS NOT EMPTY'?'jql-hl-neg':''}">${esc(m[5])}</span>`
    else if (m[6] != null) {
      const nP = m[0].trimStart().toUpperCase().startsWith('NOT')
      const op = m[7] ?? m[8] ?? ':'; const val = m[9] ?? m[10] ?? ''
      if (nP) result += `<span class="jql-hl-kw jql-hl-neg">NOT </span>`
      const n = op === '!=' || nP
      result += `<span class="jql-hl-field">${esc(m[6])}</span><span class="jql-hl-op${n?' jql-hl-neg':''}">${esc(op)}</span><span class="jql-hl-val${n?' jql-hl-neg':''}">${esc(val)}</span>`
    } else if (m[11] != null) result += `<span class="jql-hl-field">${esc(m[11])}</span> <span class="jql-hl-kw">${esc(m[12])}</span>(<span class="jql-hl-val">${esc(m[13])})</span>`
    else if (m[14] != null) result += `<span class="jql-hl-kw">${esc(m[14])}</span>`
    else if (m[15] != null) result += `<span class="jql-hl-kw">${esc(m[15])}</span>`
    last = m.index + m[0].length
  }
  return result + esc(raw.slice(last))
})
</script>

<style scoped>
/* ── Filters bar ── */
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.role-filter {
  display: flex;
  align-items: center;
}

.type-pills {
  display: flex;
  gap: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px;
}

.status-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  padding: 5px 14px;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.status-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.status-btn.active {
  background: var(--accent-subtle, rgba(88,166,255,0.12));
  color: var(--accent);
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

/* ── Rankings vscroll overrides ── */
:deep(.vscroll-table) {
  height: calc(100vh - 260px);
  min-height: 300px;
}

.col-rank    { width: 18%; min-width: 180px; }
.col-model   { width: 24%; min-width: 200px; }
.col-author  { width: 10%; min-width: 100px; }
.col-tools   { width: 6%;  min-width: 60px; }
.col-tags    { width: 14%; min-width: 140px; }

.sort-arrow {
  font-size: 0.65rem;
  opacity: 0.3;
  font-weight: 400;
}

.sort-arrow.active {
  opacity: 1;
}

/* ── Rank pills ── */
.rank-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 120px;
}

.rank-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: var(--radius-full, 999px);
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
  line-height: 1;
}

.rank-pill .rp-num {
  font-variant-numeric: tabular-nums;
}

.rank-pill .rp-role {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.6rem;
  opacity: 0.85;
}

/* Role colors */
.rank-pill[data-role="model"]       { background: rgba(88,166,255,0.12); color: var(--accent); }
.rank-pill[data-role="build"]       { background: rgba(63,185,80,0.12);  color: var(--green); }
.rank-pill[data-role="general"]     { background: rgba(188,140,255,0.12); color: var(--purple); }
.rank-pill[data-role="small_model"] { background: rgba(210,153,34,0.12); color: var(--orange); }
.rank-pill[data-role="explore"]     { background: rgba(57,210,192,0.12);  color: var(--cyan); }
/* Active role filter highlight */
.rank-pill.rank-active                        { box-shadow: 0 0 0 2px currentColor, 0 0 8px rgba(255,255,255,0.08); font-size: 0.72rem; padding: 4px 11px; }

/* Top 3 highlight */
.rank-pill.rank-top[data-role="model"]       { background: rgba(88,166,255,0.22); box-shadow: 0 0 0 1px rgba(88,166,255,0.2); }
.rank-pill.rank-top[data-role="build"]       { background: rgba(63,185,80,0.22);  box-shadow: 0 0 0 1px rgba(63,185,80,0.2); }
.rank-pill.rank-top[data-role="general"]     { background: rgba(188,140,255,0.22); box-shadow: 0 0 0 1px rgba(188,140,255,0.2); }
.rank-pill.rank-top[data-role="small_model"] { background: rgba(210,153,34,0.22); box-shadow: 0 0 0 1px rgba(210,153,34,0.2); }
.rank-pill.rank-top[data-role="explore"]     { background: rgba(57,210,192,0.22);  box-shadow: 0 0 0 1px rgba(57,210,192,0.2); }

/* ── Model cell ── */
.model-name {
  font-weight: 600;
  color: var(--text);
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-id-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
}

.model-id {
  font-size: 0.68rem;
  color: var(--text-muted);
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono, monospace);
  line-height: 1;
}

.copy-btn {
  background: none;
  border: 1px solid transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 0.85rem;
  line-height: 1;
  transition: all 0.15s;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.copy-btn:hover {
  color: var(--text);
  background: var(--bg-hover, rgba(255,255,255,0.06));
}

.copy-btn.copied {
  color: var(--green);
}

/* ── Badges ── */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-full, 999px);
  font-size: 0.65rem;
  font-weight: 600;
  white-space: nowrap;
}

.badge-working      { background: rgba(63,185,80,0.12);  color: var(--green); }
.badge-untested     { background: rgba(210,153,34,0.12); color: var(--orange); }
.badge-rate_limited { background: rgba(248,81,73,0.12);  color: var(--red, #f85149); }
.badge-broken       { background: rgba(248,81,73,0.12);  color: var(--red, #f85149); }
.badge-paid         { background: rgba(230,237,243,0.06); color: var(--text-dim); }

.context-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: var(--radius-full, 999px);
  font-size: 0.65rem;
  font-weight: 600;
  background: rgba(63,185,80,0.10);
  color: var(--green);
  white-space: nowrap;
}

.best-for-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.6rem;
  font-weight: 500;
  background: rgba(230,237,243,0.06);
  color: var(--text-dim);
  white-space: nowrap;
}

/* ── Empty state ── */
.empty-state {
  padding: 48px 0;
  text-align: center;
}

.empty-state-icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

.empty-state p {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.clear-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.clear-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Unranked section ── */
.unranked-section {
  margin-top: 36px;
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}

.section-title svg {
  color: var(--orange);
}

.unranked-count {
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 4px;
}

.unranked-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-bottom: 14px;
}

.unranked-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.unranked-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  transition: border-color 0.15s;
}

.unranked-card:hover {
  border-color: var(--border-focus, var(--accent));
}

.unranked-name {
  font-weight: 600;
  font-size: 0.82rem;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unranked-id-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.unranked-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.badge-provider {
  background: rgba(88,166,255,0.12);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.62rem;
  font-weight: 600;
}

.badge-context {
  background: rgba(63,185,80,0.12);
  color: var(--green);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.62rem;
  font-weight: 600;
}

/* ── JQL bar spacing within rankings ── */
.jql-bar {
  margin-bottom: 4px;
}
</style>
