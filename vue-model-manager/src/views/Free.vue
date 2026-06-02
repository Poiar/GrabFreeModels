<template>
  <div>
    <div class="page-header">
      <h2>Free</h2>
      <p>Role-specific ranked lists of verified free models — paid, removed, broken, and rate-limited models are excluded. Use the type picker to switch which ranking to sort by; each model's other role rankings are shown as pills.</p>
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
      </div>
    </div>

    <!-- Visual Query Builder -->
    <QueryBuilder
      :conditions="builderConditions"
      :jql-query="jql.rawQuery.value ?? ''"
      :provider-names="rankedProviderNames"
      :author-names="rankedAuthorNames"
      @change="onBuilderChange"
      @clear="onBuilderClear"
    />

    <!-- Role Info Panel -->
    <div class="role-info-panel" v-if="currentRoleMeta">
      <div class="role-info-header">
        <span class="role-info-name" :data-role="roleFilter">{{ formatRole(roleFilter) }}</span>
        <span class="role-info-desc">{{ currentRoleMeta.description }}</span>
      </div>
      <div class="role-info-formula">
        <span class="formula-label">Score</span>
        <span class="formula-expr">
          <span class="formula-part ctx-part" :title="'Context length / 1,048,756 × ' + currentRoleMeta.ctxWeight">(ctx / 1M) × {{ currentRoleMeta.ctxWeight }}</span>
          <template v-if="currentRoleMeta.tagKeywords.length">
            <span class="formula-op">+</span>
            <span class="formula-part tag-part" :title="currentRoleMeta.tagKeywords.length + ' tags: ' + currentRoleMeta.tagKeywords.join(', ')">tags({{ currentRoleMeta.tagKeywords.length }})</span>
          </template>
          <template v-if="currentRoleMeta.tagPenaltyKeywords.length">
            <span class="formula-op">−</span>
            <span class="formula-part penalty-part" :title="currentRoleMeta.tagPenaltyKeywords.length + ' penalties: ' + currentRoleMeta.tagPenaltyKeywords.join(', ')">penalty({{ currentRoleMeta.tagPenaltyKeywords.length }}) × 0.5</span>
          </template>
          <template v-if="currentRoleMeta.nameSizePenalty">
            <span class="formula-op">−</span>
            <span class="formula-part nsp-part" title="Large model name penalty (1.5)">nameSize</span>
          </template>
        </span>
      </div>
      <div class="role-info-constraints" v-if="currentRoleMeta.maxCtx || currentRoleMeta.needsTools">
        <span v-if="currentRoleMeta.needsTools" class="constraint-badge">Requires Tools</span>
        <span v-if="currentRoleMeta.maxCtx" class="constraint-badge">Max {{ formatContext(currentRoleMeta.maxCtx) }} ctx</span>
      </div>
    </div>

    <div class="filters">
      <div class="role-filter">
        <div class="type-pills">
          <button
            v-for="role in ROLES"
            :key="role"
            :class="['status-btn', { active: roleFilter === role }]"
            :data-role="role"
            @click="onRoleClick(role)"
          >
            {{ formatRole(role) }}
          </button>
        </div>
      </div>
      <div class="scoring-source">
        <select v-model="scoringSource" class="sort-select scoring-select">
          <option value="internal">Scoring: Internal</option>
          <option v-for="src in availableSources" :key="src.id" :value="src.id">Scoring: {{ src.label }}</option>
        </select>
      </div>
      <div class="sort-controls">
        <select v-model="sortBy" class="sort-select">
          <option value="rank">Sort: Rank</option>
          <option value="score">Sort: Score</option>
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

    <div class="table-wrap vscroll-table">
      <div class="vscroll-header-row">
        <div class="vscroll-header-cell col-rank sortable" :class="{ active: sortBy === 'rank' }" @click="setSort('rank')">
          Rank <SortArrow :active="sortBy === 'rank'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-score sortable" :class="{ active: sortBy === 'score' }" @click="setSort('score')">
          Score <SortArrow :active="sortBy === 'score'" :desc="sortDesc" />
        </div>
        <div class="vscroll-header-cell col-name sortable" :class="{ active: sortBy === 'name' }" @click="setSort('name')">
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
        <div class="vscroll-header-cell col-detail">Details</div>
      </div>

      <DynamicScroller
        v-if="sortedItems.length > 0"
        ref="scrollerRef"
        :items="sortedItems"
        :min-item-size="56"
        key-field="modelId"
        class="vscroll-body"
      >
        <template #default="{ item, active }">
          <DynamicScrollerItem :item="item" :active="active">
          <div class="vscroll-row row-clickable" :class="{ 'row-removed': item.model?._removed }" @click="selectedModel = (item.model ?? null)" role="button" :title="'View details for ' + (item.model?.name ?? item.modelId)">
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
            <div class="vscroll-cell col-score">
              <span class="score-val" :title="scoreTooltip(itemScore(item.modelId))">{{ formatScore(itemScore(item.modelId)) }}</span>
            </div>
            <div class="vscroll-cell col-name">
              <router-link :to="item.model ? `/master/${item.model.master_id}` : ''" class="model-name-link" :title="item.model?.name ?? item.modelId" @click.stop>{{ item.model?.name ?? item.modelId }}</router-link>
              <div class="model-id-wrap">
                <span class="model-id" :title="item.modelId">{{ item.modelId }}</span>
                <button class="copy-btn" :class="{ copied: copiedIds.has(item.modelId) }" :title="copiedIds.has(item.modelId) ? 'Copied!' : 'Copy ID'" @click.stop="handleCopy(item.modelId)">
                  {{ copiedIds.has(item.modelId) ? '✓' : '📋' }}
                </button>
              </div>
            </div>
            <div class="vscroll-cell col-author">{{ item.model?.author ?? '' }}</div>
            <div class="vscroll-cell col-provider">
              <span>{{ item.model?.provider ?? '' }}</span>
              <span v-if="item.model && store.isModelProviderUsedUp(item.modelId)" class="used-up-icon" title="Provider used up for this month">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
            </div>
            <div class="vscroll-cell col-status">
              <span class="badge" :class="`badge-${item.model?.status?.result ?? ''}`">
                {{ formatStatus(item.model?.status?.result) }}
              </span>
            </div>
            <div class="vscroll-cell col-context">
              <span class="context-len">{{ item.model?.context_length != null ? formatContext(item.model.context_length) : '—' }}</span>
            </div>
            <div class="vscroll-cell col-detail">
              <div class="best-for-tags">
                <span v-for="tag in (item.model?.best_for ?? []).slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
                <span v-if="(item.model?.best_for?.length ?? 0) > 3" class="tag">+{{ (item.model?.best_for?.length ?? 0) - 3 }}</span>
                <span v-if="item.model?.supports_tools === true" class="tag tool-tag">Tools ✓</span>
              </div>
              <div class="detail-text" :title="item.model?.status?.detail ?? ''">{{ item.model?.status?.detail ?? '' }}</div>
            </div>
          </div>
          </DynamicScrollerItem>
        </template>
      </DynamicScroller>

      <div v-else class="empty-state">
        <div class="empty-state-inner">
          <div class="empty-state-icon">🔍</div>
          <p>No models match the current filters</p>
          <button class="clear-btn" @click="clearAll">Clear filters</button>
        </div>
      </div>
    </div>

    <!-- Detail Panel -->
    <ModelDetail :model="selectedModel" @close="selectedModel = null" />

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
            <span v-if="model.context_length" class="badge badge-context">{{ formatContext(model.context_length) }}</span>
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
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import { useJqlFilter } from '@/composables/useJqlFilter'
import type { FilterToken, SortSpec } from '@/composables/useJqlFilter'
import type { Model, RoleScore } from '@/types'
import type { BuilderCondition } from '@/components/QueryBuilder.vue'
import QueryBuilder from '@/components/QueryBuilder.vue'
import ModelDetail from '@/components/ModelDetail.vue'
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

const SCORING_SOURCES = [
  { id: 'internal', label: 'Internal' },
  { id: 'artificial_analysis', label: 'Artificial Analysis' },
] as const

const scoringSource = ref('internal')

const availableSources = computed(() => {
  return SCORING_SOURCES.filter(s => s.id !== 'internal').filter(s => {
    const scores = store.modelScores
    if (!scores || !scores.scores) return false
    const m = scores.scores instanceof Map ? scores.scores : new Map(Object.entries(scores.scores).map(([k, v]) => [Number(k), v]))
    for (const arr of m.values()) {
      if (arr && arr.some(sc => sc.source === s.id)) return true
    }
    return false
  })
})

function getExternalScore(modelId, source) {
  const scores = store.modelScores
  if (!scores || !scores.scores) return null
  const m = scores.scores instanceof Map ? scores.scores : new Map(Object.entries(scores.scores).map(([k, v]) => [Number(k), v]))
  const arr = m.get(Number(modelId))
  if (!arr) return null
  const s = arr.find(sc => sc.source === source && sc.score_type === 'intelligence') || arr.find(sc => sc.source === source)
  return s ? s.score_value : null
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const fmtCompact = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 })
function formatContext(n: number): string { return fmtCompact.format(n) }

function formatStatus(s: string | undefined): string {
  if (!s) return '—'
  if (s === 'rate_limited') return 'Rate-limited'
  if (s === 'small_model') return 'Small model'
  return s.charAt(0).toUpperCase() + s.slice(1)
}



const currentRoleMeta = computed(() => store.roleMeta[roleFilter.value] ?? null)

function itemScore(modelId: string): RoleScore | undefined {
  return store.getRoleScore(roleFilter.value, modelId)
}

function formatScore(s: RoleScore | undefined): string {
  if (!s) return '—'
  return s.score.toFixed(2)
}

function scoreTooltip(s: RoleScore | undefined): string {
  if (!s) return 'No score data'
  const parts: string[] = [`total: ${s.score.toFixed(2)}`]
  parts.push(`ctx: +${s.ctxContrib.toFixed(2)} (${s.ctx} tok × ${s.ctxWeight})`)
  if (s.tagBonus > 0) parts.push(`tags: +${s.tagBonus} [${s.matchedTags.join(', ')}]`)
  if (s.penaltyContrib > 0) parts.push(`penalty: −${s.penaltyContrib.toFixed(1)} [${s.matchedPenaltyTags.join(', ')}]`)
  if (s.nameSizePenalty > 0) parts.push(`name penalty: −${s.nameSizePenalty}`)
  return parts.join('\n')
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

const rankedProviderNames = computed(() => {
  const set = new Set<string>()
  for (const mr of flatRankings.value) {
    const m = store.getModelById(mr.modelId)
    if (m) set.add(m.provider)
  }
  return Array.from(set).sort()
})
const rankedAuthorNames = computed(() => {
  const set = new Set<string>()
  for (const mr of flatRankings.value) {
    const m = store.getModelById(mr.modelId)
    if (m?.author) set.add(m.author)
  }
  return Array.from(set).sort()
})

const jql = useJqlFilter(
  computed(() => store.allModels),
  rankedProviderNames,
  rankedAuthorNames,
)
function readQueryFromUrl() {
  if (route.query.q && typeof route.query.q === 'string') {
    jql.rawQuery.value = route.query.q
  }
  if (route.query.role && typeof route.query.role === 'string') {
    const r = route.query.role.toLowerCase() as Role
    if (ROLES.includes(r)) roleFilter.value = r
  }
}
function writeQueryToUrl(q: string) {
  const query: Record<string, string | undefined> = { q: q.trim() || undefined }
  if (roleFilter.value !== 'model') query.role = roleFilter.value
  router.replace({ ...route, query })
}
onMounted(() => readQueryFromUrl())
watch(() => jql.rawQuery.value, (q) => writeQueryToUrl(q))
watch(() => roleFilter.value, () => writeQueryToUrl(jql.rawQuery.value ?? ''))
watch(() => scoringSource.value, () => { sortBy.value = 'rank'; sortDesc.value = false })
watch(() => scoringSource.value, () => { sortBy.value = 'rank'; sortDesc.value = false })

watch(jql.sortSpec, (spec: SortSpec | null) => {
  if (spec) { sortBy.value = spec.field; sortDesc.value = spec.desc }
  else { sortBy.value = 'rank'; sortDesc.value = false }
})

watch([() => jql.rawQuery.value, sortBy, sortDesc, roleFilter], () => {
  scrollerRef.value?.scrollToPosition(0)
})

function onRoleClick(role: Role) {
  roleFilter.value = role
  builderConditions.value = []
  sortBy.value = 'rank'
  sortDesc.value = false
}

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
    externalScore: scoringSource.value !== 'internal' ? getExternalScore(mr.modelId, scoringSource.value) : null,
  }))
  arr.sort((a, b) => {
    let cmp = 0
    if (scoringSource.value !== 'internal') {
      const sa = a.externalScore ?? -Infinity
      const sb = b.externalScore ?? -Infinity
      cmp = sb - sa
      if (cmp !== 0) return cmp
    }
    switch (sortBy.value) {
      case 'rank':
        cmp = a.roleRank - b.roleRank
        if (cmp === 0) cmp = (STATUS_ORDER[a.model?.status?.result ?? ''] ?? 5) - (STATUS_ORDER[b.model?.status?.result ?? ''] ?? 5)
        if (cmp === 0) cmp = bestRoleOrder(a) - bestRoleOrder(b)
        break
      case 'name':
        cmp = (a.model?.name ?? '').localeCompare(b.model?.name ?? '')
        break
      case 'author':
        cmp = (a.model?.author ?? '').localeCompare(b.model?.author ?? '')
        if (cmp === 0) cmp = (a.model?.provider ?? '').localeCompare(b.model?.provider ?? '')
        break
      case 'provider':
        cmp = (a.model?.provider ?? '').localeCompare(b.model?.provider ?? '')
        break
      case 'context':
        cmp = (a.model?.context_length ?? 0) - (b.model?.context_length ?? 0)
        break
      case 'score':
        cmp = (itemScore(a.modelId)?.score ?? 0) - (itemScore(b.modelId)?.score ?? 0)
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
  const header = ['model_id', 'model_name', 'provider', 'status', 'context_length', 'score', 'best_for', 'role_rankings']
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const rows = sortedItems.value.map(mr => [
    mr.modelId, mr.model?.name ?? '', mr.model?.provider ?? '',
    mr.model?.status?.result ?? '', mr.model?.context_length ?? '',
    itemScore(mr.modelId)?.score ?? '',
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
  const data = sortedItems.value.map(mr => {
    const sc = itemScore(mr.modelId)
    return {
      model_id: mr.modelId,
      model_name: mr.model?.name ?? null,
      provider: mr.model?.provider ?? null,
      status: mr.model?.status?.result ?? null,
      context_length: mr.model?.context_length ?? null,
      score: sc?.score ?? null,
      score_breakdown: sc ? {
        ctx_contrib: sc.ctxContrib,
        tag_bonus: sc.tagBonus,
        tag_penalty: sc.penaltyContrib,
        name_size_penalty: sc.nameSizePenalty,
        matched_tags: sc.matchedTags,
        matched_penalty_tags: sc.matchedPenaltyTags,
      } : null,
      best_for: mr.model?.best_for ?? [],
      tools: mr.model?.supports_tools ?? null,
      role_rankings: mr.rankings.map(r => ({ role: r.role, rank: r.rank })),
    }
  })
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
.status-btn.active[data-role="model"]       { background: rgba(88,166,255,0.12); color: var(--accent);  box-shadow: 0 0 0 2px var(--accent),  0 0 8px rgba(255,255,255,0.08); }
.status-btn.active[data-role="build"]       { background: rgba(63,185,80,0.12);  color: var(--green);   box-shadow: 0 0 0 2px var(--green),   0 0 8px rgba(255,255,255,0.08); }
.status-btn.active[data-role="general"]     { background: rgba(188,140,255,0.12); color: var(--purple);  box-shadow: 0 0 0 2px var(--purple),  0 0 8px rgba(255,255,255,0.08); }
.status-btn.active[data-role="small_model"] { background: rgba(210,153,34,0.12); color: var(--orange);  box-shadow: 0 0 0 2px var(--orange),  0 0 8px rgba(255,255,255,0.08); }
.status-btn.active[data-role="explore"]     { background: rgba(57,210,192,0.12);  color: var(--cyan);    box-shadow: 0 0 0 2px var(--cyan),    0 0 8px rgba(255,255,255,0.08); }

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
.col-tools {
  align-items: center;
}

:deep(.vscroll-row) {
  cursor: pointer;
}

.col-rank    { width: 13%; min-width: 110px; padding-right: 8px; }
.col-score   { width: 12%; min-width: 110px; }
.col-name    { width: 20%; min-width: 150px; }
.col-author  { width: 9%;  min-width: 75px; }
.col-provider { width: 11%; min-width: 95px; }
.col-status  { width: 8%;  min-width: 75px; }
.col-context { width: 7%;  min-width: 60px; }
.col-detail  { width: 15%; min-width: 150px; }

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

/* Top 3 highlight */
.rank-pill.rank-top[data-role="model"]       { background: rgba(88,166,255,0.22); box-shadow: 0 0 0 1px rgba(88,166,255,0.2); }
.rank-pill.rank-top[data-role="build"]       { background: rgba(63,185,80,0.22);  box-shadow: 0 0 0 1px rgba(63,185,80,0.2); }
.rank-pill.rank-top[data-role="general"]     { background: rgba(188,140,255,0.22); box-shadow: 0 0 0 1px rgba(188,140,255,0.2); }
.rank-pill.rank-top[data-role="small_model"] { background: rgba(210,153,34,0.22); box-shadow: 0 0 0 1px rgba(210,153,34,0.2); }
.rank-pill.rank-top[data-role="explore"]     { background: rgba(57,210,192,0.22);  box-shadow: 0 0 0 1px rgba(57,210,192,0.2); }

/* Active role filter highlight (after rank-top so it wins) */
.rank-pill.rank-active[data-role="model"]       { background: rgba(88,166,255,0.28); box-shadow: 0 0 0 2px currentColor, 0 0 8px rgba(255,255,255,0.08); font-size: 0.72rem; padding: 4px 11px; }
.rank-pill.rank-active[data-role="build"]       { background: rgba(63,185,80,0.28);  box-shadow: 0 0 0 2px currentColor, 0 0 8px rgba(255,255,255,0.08); font-size: 0.72rem; padding: 4px 11px; }
.rank-pill.rank-active[data-role="general"]     { background: rgba(188,140,255,0.28); box-shadow: 0 0 0 2px currentColor, 0 0 8px rgba(255,255,255,0.08); font-size: 0.72rem; padding: 4px 11px; }
.rank-pill.rank-active[data-role="small_model"] { background: rgba(210,153,34,0.28); box-shadow: 0 0 0 2px currentColor, 0 0 8px rgba(255,255,255,0.08); font-size: 0.72rem; padding: 4px 11px; }
.rank-pill.rank-active[data-role="explore"]     { background: rgba(57,210,192,0.28);  box-shadow: 0 0 0 2px currentColor, 0 0 8px rgba(255,255,255,0.08); font-size: 0.72rem; padding: 4px 11px; }

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

/* ── Role info panel ── */
.role-info-panel {
  background: var(--bg-card, rgba(255,255,255,0.03));
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: var(--radius, 8px);
  padding: 10px 14px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.role-info-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.role-info-name {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.role-info-name[data-role="model"]       { color: var(--accent); }
.role-info-name[data-role="build"]       { color: var(--green); }
.role-info-name[data-role="general"]     { color: var(--purple); }
.role-info-name[data-role="small_model"] { color: var(--orange); }
.role-info-name[data-role="explore"]     { color: var(--cyan); }
.role-info-desc {
  font-size: 0.78rem;
  color: var(--text-dim);
  line-height: 1.4;
}
.role-info-formula {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}
.formula-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-dim);
  letter-spacing: 0.06em;
  padding-top: 3px;
  flex-shrink: 0;
}
.formula-expr {
  font-size: 0.75rem;
  font-family: 'SF Mono', 'Fira Code', monospace;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  line-height: 1.6;
}
.formula-part {
  padding: 2px 7px;
  border-radius: 3px;
  font-weight: 600;
  white-space: nowrap;
}
.ctx-part    { background: rgba(88,166,255,0.12); color: var(--accent); }
.tag-part    { background: rgba(63,185,80,0.12);  color: var(--green); }
.penalty-part { background: rgba(210,153,34,0.12); color: var(--orange); }
.nsp-part    { background: rgba(188,140,255,0.12); color: var(--purple); }
.formula-op  { color: var(--text-dim); font-weight: 700; }
.role-info-constraints {
  display: flex;
  gap: 6px;
}
.constraint-badge {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: var(--radius-full, 999px);
  background: rgba(255,255,255,0.06);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Score cell ── */
.col-score {
  align-items: center;
}
.score-val {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  cursor: help;
  border-bottom: 1px dotted var(--text-dim);
}
</style>
