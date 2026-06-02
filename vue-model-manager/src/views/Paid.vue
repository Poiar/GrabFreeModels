<template>
  <div>
    <div class="page-header">
      <h2>Paid</h2>
      <p>Browse, search, and filter all tracked paid models</p>
    </div>

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
          <div v-for="(err, i) in jql.validationErrors.value" :key="i" class="jql-underline-mark" :style="underlineStyle(err)" />
        </div>
      </div>

      <div v-if="jql.showSuggestions.value && jql.suggestions.value" class="jql-suggestions">
        <div v-for="(opt, si) in jql.suggestions.value.options" :key="opt.insert" class="jql-suggestion" :class="{ 'jql-suggestion-active': si === jql.activeSuggestion.value }" @mousedown.prevent="jql.applySuggestion(opt.insert)" @mouseenter="jql.activeSuggestion.value = si">
          <span class="jql-suggestion-label">{{ opt.label }}</span>
          <span class="jql-suggestion-field">{{ opt.insert }}</span>
        </div>
        <div v-if="!jql.suggestions.value.options.length" class="jql-suggestion-empty">No matching {{ jql.suggestions.value.field }}s</div>
      </div>

      <div class="jql-bar-footer">
        <span class="filter-count">{{ sortedModels.length }} of {{ paidModels.length }} paid models</span>
        <div class="export-btns">
          <button class="export-btn" title="Export as CSV" @click="exportCsv"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> CSV</button>
          <button class="export-btn" title="Export as JSON" @click="exportJson"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> JSON</button>
        </div>
        <span class="jql-hint"><kbd>field:value</kbd> · <kbd>!=</kbd> · <kbd>&gt;</kbd> · <kbd>&lt;</kbd> · <kbd>IS EMPTY</kbd> · <kbd>IN (a,b)</kbd> · <kbd>NOT</kbd> · <kbd>OR</kbd> · <kbd>ORDER BY</kbd></span>
      </div>
    </div>

    <QueryBuilder :conditions="builderConditions" :jql-query="jql.rawQuery.value ?? ''" :provider-names="paidProviderNames" :author-names="paidAuthorNames" @change="onBuilderChange" @clear="onBuilderClear" />

    <div class="table-wrap vscroll-table">
      <div class="vscroll-header-row">
        <div class="vscroll-header-cell col-name sortable" :class="{ active: sortBy === 'name' }" @click="setSort('name')">Model <span class="sort-indicator">{{ sortIndicator('name') }}</span></div>
        <div class="vscroll-header-cell col-provider sortable" :class="{ active: sortBy === 'provider' }" @click="setSort('provider')">Provider <span class="sort-indicator">{{ sortIndicator('provider') }}</span></div>
        <div class="vscroll-header-cell col-status sortable" :class="{ active: sortBy === 'status' }" @click="setSort('status')">Status <span class="sort-indicator">{{ sortIndicator('status') }}</span></div>
        <div class="vscroll-header-cell col-context sortable" :class="{ active: sortBy === 'context' }" @click="setSort('context')">Context <span class="sort-indicator">{{ sortIndicator('context') }}</span></div>
        <div class="vscroll-header-cell col-detail sortable" :class="{ active: sortBy === 'detail' }" @click="setSort('detail')">Latest Test Result <span class="sort-indicator">{{ sortIndicator('detail') }}</span></div>
      </div>
      <RecycleScroller v-if="sortedModels.length > 0" ref="scrollerRef" :items="sortedModels" :item-size="56" key-field="id" class="vscroll-body" :emit-update="false">
        <template #default="{ item: model }">
          <div class="vscroll-row row-clickable" :class="{ 'row-removed': model._removed }" @click="selectedModel = model" role="button" :title="'View details for ' + model.name">
            <div class="vscroll-cell col-name">
              <div class="model-name" :title="model.name">{{ model.name }}</div>
              <div class="model-id-wrap">
                <span class="model-id" :title="model.id">{{ model.id }}</span>
                <button class="copy-btn" :class="{ copied: copiedIds.has(model.id) }" :title="copiedIds.has(model.id) ? 'Copied!' : 'Copy ID'" @click.stop="handleCopy(model.id)">{{ copiedIds.has(model.id) ? '✓' : '📋' }}</button>
              </div>
            </div>
            <div class="vscroll-cell col-provider">
              <span>{{ model.provider }}</span>
              <span v-if="store.isModelProviderUsedUp(model.id)" class="used-up-icon" title="Provider used up for this month"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
            </div>
            <div class="vscroll-cell col-status">
              <span class="badge badge-paid">Paid</span>
            </div>
            <div class="vscroll-cell col-context"><span class="context-len">{{ model.context_length != null ? formatContext(model.context_length) : '—' }}</span></div>
            <div class="vscroll-cell col-detail">
              <div class="best-for-tags"><span v-for="tag in model.best_for.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span><span v-if="model.best_for.length > 3" class="tag">+{{ model.best_for.length - 3 }}</span></div>
              <div class="detail-text" :title="model.input_price_per_million + ' / ' + model.output_price_per_million">in: ${{ model.input_price_per_million }}M · out: ${{ model.output_price_per_million }}M</div>
            </div>
          </div>
        </template>
      </RecycleScroller>
      <div v-else class="empty-state"><div class="empty-state-inner"><span class="empty-state-icon">🔍</span><p>No paid models match your filters.</p><button class="refresh-btn" @click="clearAll">Clear all filters</button></div></div>
    </div>

    <ModelDetail :model="selectedModel" @close="closeDetail" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModelsStore } from '@/store/models'
import { RecycleScroller } from 'vue-virtual-scroller'
import { useJqlFilter } from '@/composables/useJqlFilter'
import type { FilterToken, SortSpec } from '@/composables/useJqlFilter'
import type { Model } from '@/types'
import type { BuilderCondition } from '@/components/QueryBuilder.vue'
import ModelDetail from '@/components/ModelDetail.vue'
import QueryBuilder from '@/components/QueryBuilder.vue'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

type ScrollerExposed = { scrollToPosition: (pos: number) => void }
const scrollerRef = ref<ScrollerExposed | null>(null)
const store = useModelsStore()
const route = useRoute()
const router = useRouter()
const selectedModel = ref<Model | null>(null)
const copiedIds = reactive(new Set<string>())

const paidModels = computed(() => store.allModels.filter(m => !m.is_free && !m.id.endsWith(':free') && !m.id.endsWith('/free')))
const paidProviderNames = computed(() => Array.from(new Set(paidModels.value.map(m => m.provider))).sort())
const paidAuthorNames = computed(() => Array.from(new Set(paidModels.value.map(m => m.author).filter((a): a is string => !!a))).sort())

watch(() => route.query.model, (id) => { if (id && typeof id === 'string') { selectedModel.value = store.getModelById(id) ?? null } else { selectedModel.value = null } }, { immediate: true })
watch(selectedModel, (m) => { const c = route.query.model; if (m && c !== m.id) router.replace({ ...route, query: { ...route.query, model: m.id } }); else if (!m && c) { const q = { ...route.query }; delete q.model; router.replace({ ...route, query: q }) } })
let copyTimer: ReturnType<typeof setTimeout> | null = null
async function handleCopy(id: string) { try { await navigator.clipboard.writeText(id) } catch { const ta = document.createElement('textarea'); ta.value = id; ta.style.position = 'fixed'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta) } copiedIds.add(id); if (copyTimer) clearTimeout(copyTimer); copyTimer = setTimeout(() => copiedIds.delete(id), 1500) }

const sortBy = ref('name')
const sortDesc = ref(false)
const builderConditions = ref<BuilderCondition[]>([])
const jql = useJqlFilter(paidModels, paidProviderNames, paidAuthorNames)

function readQueryFromUrl() { if (route.query.q && typeof route.query.q === 'string') jql.rawQuery.value = route.query.q }
function writeQueryToUrl(q: string) { router.replace({ ...route, query: { ...route.query, q: q.trim() || undefined } }) }
onMounted(() => readQueryFromUrl())
watch(() => jql.rawQuery.value, (q) => writeQueryToUrl(q))
watch(jql.sortSpec, (spec: SortSpec | null) => { if (spec) { sortBy.value = spec.field; sortDesc.value = spec.desc } })
watch([() => jql.rawQuery.value, sortBy, sortDesc], () => { scrollerRef.value?.scrollToPosition(0) })

const allTokens = computed<FilterToken[]>(() => jql.parsed.value.expression.flat().filter(t => t.field !== '_text'))
const hasOrderBy = computed(() => !!jql.parsed.value.orderBy)
function onBuilderChange(c: BuilderCondition[]) { builderConditions.value = c; syncBuilderToQuery(c) }
function onBuilderClear() { builderConditions.value = []; jql.rawQuery.value = '' }
function clearAll() { jql.rawQuery.value = ''; builderConditions.value = []; sortBy.value = 'name'; sortDesc.value = false }
function closeDetail() { selectedModel.value = null }
function syncBuilderToQuery(c: BuilderCondition[]) { if (!c.length) { jql.rawQuery.value = ''; return } let q = c[0].jql; for (let i = 1; i < c.length; i++) { q += c[i].joinOr ? ' OR ' : ' AND '; q += c[i].jql } jql.rawQuery.value = q }
watch(() => jql.rawQuery.value, () => { const tt = jql.parsed.value.expression.flat().filter(t => t.field !== '_text'); if (tt.length !== builderConditions.value.length) builderConditions.value = [] })
function clearOrderBy() { jql.rawQuery.value = jql.rawQuery.value.replace(/\s+ORDER\s+BY\s+\w+\s*(ASC|DESC)?\s*$/i, '').trim(); sortBy.value = 'name'; sortDesc.value = false }
function onLoadSavedQuery(e: Event) { jql.rawQuery.value = (e as CustomEvent).detail as string; builderConditions.value = [] }
onMounted(() => window.addEventListener('load-saved-query', onLoadSavedQuery))
onUnmounted(() => window.removeEventListener('load-saved-query', onLoadSavedQuery))
function setSort(f: string) { if (sortBy.value === f) sortDesc.value = !sortDesc.value; else { sortBy.value = f; sortDesc.value = false } }

function exportCsv() {
  const esc = (v: unknown) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s }
  const rows = sortedModels.value.map(m => [m.id, m.name, m.provider, m._removed ? 'removed' : m.status.result, m.context_length ?? '', m.input_price_per_million ?? '', m.output_price_per_million ?? '', 'no', m.best_for.join('; '), m.notes, m.status.detail, m.status.tested || '', m.last_success || '', m._removed ? 'yes' : 'no', m._removedDate || ''].map(esc).join(','))
  download([`# exported_at: ${new Date().toISOString()}`, `# count: ${sortedModels.value.length}/${paidModels.value.length}`, `# query: ${jql.rawQuery.value || '(none)'}`, `# sort: ${sortBy.value} ${sortDesc.value ? 'DESC' : 'ASC'}`, 'id,name,provider,status,context_length,input_price_per_million,output_price_per_million,is_free,best_for,notes,status_detail,status_tested,last_success,removed,removed_date', ...rows].join('\n'), 'paid-models.csv', 'text/csv')
}
function exportJson() {
  download(JSON.stringify({ _meta: { exported_at: new Date().toISOString(), count: sortedModels.value.length, total_models: paidModels.value.length, jql_query: jql.rawQuery.value || null, sort_by: sortBy.value, sort_desc: sortDesc.value }, models: sortedModels.value.map(m => ({ id: m.id, name: m.name, provider: m.provider, status: m._removed ? 'removed' : m.status.result, context_length: m.context_length, input_price_per_million: m.input_price_per_million, output_price_per_million: m.output_price_per_million, is_free: m.is_free, best_for: m.best_for, notes: m.notes, status_detail: m.status.detail, status_tested: m.status.tested, last_success: m.last_success || null, _removed: m._removed || false, _removedDate: m._removedDate || null })) }, null, 2), 'paid-models.json', 'application/json')
}
function handleKeydown(e: KeyboardEvent) { if (e.key === 'Escape') closeDetail() }
onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
function download(content: string, filename: string, mime: string) { const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url) }
function sortIndicator(f: string): string { return sortBy.value !== f ? '⇅' : sortDesc.value ? '↓' : '↑' }


const filteredModels = computed(() => jql.filteredModels.value)
const sortedModels = computed(() => {
  const sorted = [...filteredModels.value]; const dir = sortDesc.value ? -1 : 1
  sorted.sort((a, b) => { switch (sortBy.value) { case 'provider': return dir * a.provider.localeCompare(b.provider); case 'status': return dir * a.status.result.localeCompare(b.status.result); case 'context': { const ac = a.context_length, bc = b.context_length; if (ac == null && bc == null) return 0; if (ac == null) return 1; if (bc == null) return -1; return dir * (ac - bc) } case 'detail': return dir * a.status.detail.localeCompare(b.status.detail); default: return dir * a.name.localeCompare(b.name) } })
  return sorted
})
const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 })
function formatContext(n: number): string { return fmt.format(n) }
const highlightedQuery = computed(() => { const q = jql.rawQuery.value; if (!q) return ''; return q.replace(/(\w+)([:=!<>]+|!=)([^\s]+)/g, (_, f, op, v) => `<span class="jql-hl-field">${f}</span><span class="jql-hl-op">${op}</span><span class="jql-hl-val">${v}</span>`) })
function underlineStyle(err: { start: number; end: number }) { const w = 7.8; return { left: `${36 + err.start * w}px`, width: `${Math.max(8, (err.end - err.start) * w)}px` } }
</script>
