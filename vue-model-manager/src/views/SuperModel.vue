<template>
  <div>
    <div class="page-header">
      <div class="breadcrumb">
        <router-link to="/models">SuperModels</router-link>
        <span class="sep">›</span>
        <span>{{ super_?.name ?? '…' }}</span>
      </div>
      <h2>
        {{ super_?.name ?? 'Loading…' }}
        <span v-if="superFamily" class="header-family">{{ superFamily }}</span>
      </h2>
      <p>{{ super_?.datapoints.length ?? 0 }} instance{{ super_?.datapoints.length !== 1 ? 's' : '' }} across {{ super_?.providers?.length ?? 0 }} provider{{ super_?.providers?.length !== 1 ? 's' : '' }}</p>
    </div>

    <div v-if="!super_ && !notFound" class="center-message">
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading model…</p>
      </div>
    </div>

    <div v-else-if="notFound" class="center-message error-box">
      <svg class="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <h2>Model not found</h2>
      <p class="error-message">No super model with ID <code>{{ route.params.id }}</code>.</p>
      <router-link to="/all" class="refresh-btn">Browse all models</router-link>
    </div>

    <template v-else-if="super_"">
      <!-- Summary cards -->
      <div class="stats-grid super-stats">
        <div class="stat-card">
          <div class="stat-value">{{ super_.datapoints.length }}</div>
          <div class="stat-label">Providers</div>
        </div>
        <div class="stat-card stat-card-highlight">
          <div class="stat-value green">{{ workingCount }}</div>
          <div class="stat-label">Working</div>
        </div>
        <div class="stat-card">
          <div class="stat-value orange">{{ rateLimitedCount }}</div>
          <div class="stat-label">Rate Limited</div>
        </div>
        <div class="stat-card">
          <div class="stat-value red">{{ brokenCount }}</div>
          <div class="stat-label">Broken</div>
        </div>
        <div class="stat-card">
          <div class="stat-value accent">{{ untestedCount }}</div>
          <div class="stat-label">Untested</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ bestContext ? formatContext(bestContext) : '—' }}</div>
          <div class="stat-label">Best Context</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ super_?.any_tools ? 'Yes' : 'No' }}</div>
          <div class="stat-label">Tool Support</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" :class="super_.all_free ? 'green' : 'orange'">{{ super_.all_free ? 'All Free' : 'Some Paid' }}</div>
          <div class="stat-label">Pricing</div>
        </div>
      </div>

      <!-- Role rankings -->
      <div class="section" v-if="modelRoles.length > 0">
        <h3>Role Rankings</h3>
        <div class="role-badges">
          <div v-for="role in modelRoles" :key="role.name" class="role-card">
            <span class="role-name">{{ role.label }}</span>
            <span class="role-score">{{ role.score }}</span>
            <span v-if="role.best_datapoint" class="role-best-provider">via {{ role.best_datapoint }}</span>
          </div>
        </div>
      </div>

      <!-- Provider comparison table -->
      <div class="section">
        <h3>Provider Comparison</h3>
        <p class="section-hint">Click a row to see test details</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Context</th>
                <th>Input Price</th>
                <th>Output Price</th>
                <th>Tools</th>
                <th>Free</th>
                <th>Last Tested</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="dp in sortedDatapoints" :key="dp.id">
                <tr
                  :class="{ 'row-removed': dp._removed, 'row-expanded': expandedDp === dp.id }"
                  @click="toggleExpand(dp)"
                  role="button"
                  :title="'View details for ' + dp.id"
                >
                  <td class="col-provider">
                    <span class="provider-name">{{ dp.provider }}</span>
                    <span class="provider-source">{{ dp.source }}</span>
                  </td>
                  <td>
                    <span v-if="dp._removed" class="badge badge-removed">Removed</span>
                    <span v-else class="badge" :class="`badge-${dp.status.result}`">{{ formatStatus(dp.status.result) }}</span>
                  </td>
                  <td>
                    <span class="context-len">{{ dp.context_length ? formatContext(dp.context_length) : '—' }}</span>
                  </td>
                  <td>{{ dp.input_price_per_million ? '$' + dp.input_price_per_million + '/M' : '—' }}</td>
                  <td>{{ dp.output_price_per_million ? '$' + dp.output_price_per_million + '/M' : '—' }}</td>
                  <td>
                    <span v-if="dp.supports_tools === true" class="check-yes">✓</span>
                    <span v-else class="check-no">—</span>
                  </td>
                  <td>
                    <span v-if="dp.is_free" class="check-yes">✓</span>
                    <span v-else class="check-no">✗</span>
                  </td>
                  <td class="col-date">{{ dp.status.tested ?? '—' }}</td>
                </tr>
                <tr v-if="expandedDp === dp.id" class="detail-row">
                  <td colspan="8">
                    <div class="detail-inline">
                      <div class="detail-inline-col">
                        <span class="detail-inline-label">Test Result</span>
                        <p class="detail-inline-text">{{ dp.status.detail ?? 'No details' }}</p>
                      </div>
                      <div class="detail-inline-col" v-if="dp.last_success">
                        <span class="detail-inline-label">Last Success</span>
                        <p class="detail-inline-text">{{ dp.last_success }}</p>
                      </div>
                      <div class="detail-inline-col" v-if="dp.notes">
                        <span class="detail-inline-label">Notes</span>
                        <p class="detail-inline-text">{{ dp.notes }}</p>
                      </div>
                      <button class="detail-inline-close" @click.stop="expandedDp = null">✕</button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Features (from datapoint_model_features) -->
      <div class="section" v-if="allFeatures.length > 0">
        <h3>Features</h3>
        <div class="feature-grid">
          <div v-for="feat in allFeatures" :key="feat.type" class="feature-group">
            <span class="feature-type">{{ formatFeatureType(feat.type) }}</span>
            <div class="feature-values">
              <span v-for="val in feat.values" :key="val" class="tag">{{ val }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Known issues for any datapoint of this super model -->
      <div class="section" v-if="superIssues.length > 0">
        <h3>Known Issues</h3>
        <div v-for="issue in superIssues" :key="issue.model_id + issue.issue" class="issue-card">
          <div class="issue-header">
            <span class="badge" :class="`badge-severity-${issue.severity}`">{{ issue.severity }}</span>
            <span class="issue-title">{{ issue.issue }}</span>
            <span class="issue-model-id">on {{ issue.model_id }}</span>
          </div>
          <p><span class="mini-label">Impact:</span> {{ issue.impact }}</p>
          <p v-if="issue.workaround"><span class="mini-label">Workaround:</span> {{ issue.workaround }}</p>
        </div>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useModelsStore } from '@/store/models'

const route = useRoute()
const store = useModelsStore()
const expandedDp = ref<string | null>(null)

const superId = computed(() => Number(route.params.id))

const super_ = computed(() => {
  if (isNaN(superId.value)) return null
  return store.superModelById.get(superId.value) ?? null
})

const notFound = computed(() => store.allDatapoints.length > 0 && !super_.value && !isNaN(superId.value))

const superFamily = computed(() => {
  if (!super_.value) return null
  const families = new Set(super_.value.datapoints.map(d => d.family).filter((f): f is string => !!f))
  return families.size === 1 ? [...families][0] : null
})

const sortedDatapoints = computed(() => {
  if (!super_.value) return []
  return [...super_.value.datapoints].sort((a, b) => {
    if (a.is_free !== b.is_free) return a.is_free ? -1 : 1
    return a.provider.localeCompare(b.provider)
  })
})

const workingCount = computed(() => super_.value?.datapoints.filter(d => d.status.result === 'working').length ?? 0)
const rateLimitedCount = computed(() => super_.value?.datapoints.filter(d => d.status.result === 'rate_limited').length ?? 0)
const brokenCount = computed(() => super_.value?.datapoints.filter(d => d.status.result === 'broken').length ?? 0)
const untestedCount = computed(() => super_.value?.datapoints.filter(d => d.status.result === 'untested').length ?? 0)
const bestContext = computed(() => super_.value?.best_context_length ?? null)

const ROLE_ORDER = ['model', 'build', 'general', 'small_model', 'explore'] as const
const ROLE_LABELS: Record<string, string> = {
  model: 'Model',
  build: 'Build',
  general: 'General',
  small_model: 'Small Model',
  explore: 'Explore',
}

interface ModelRole {
  name: string
  label: string
  score: number
  best_datapoint: string | null
}

const modelRoles = computed((): ModelRole[] => {
  if (!super_.value) return []
  const results: ModelRole[] = []
  for (const role of ROLE_ORDER) {
    let bestScore = -1
    let bestDp: string | null = null
    for (const dp of super_.value.datapoints) {
      const score = store.getRoleScore(role, dp.id)
      if (score && score.score > bestScore) {
        bestScore = score.score
        bestDp = dp.provider
      }
    }
    if (bestScore >= 0) {
      results.push({ name: role, label: ROLE_LABELS[role] ?? role, score: bestScore, best_datapoint: bestDp })
    }
  }
  return results
})

interface FeatureGroup {
  type: string
  values: string[]
}

const allFeatures = computed((): FeatureGroup[] => {
  if (!super_.value) return []
  const grouped = new Map<string, Set<string>>()
  for (const dp of super_.value.datapoints) {
    for (const tag of dp.tags) {
      if (!grouped.has('tag')) grouped.set('tag', new Set())
      grouped.get('tag')!.add(tag)
    }
    for (const bf of dp.best_for) {
      if (!grouped.has('best_for')) grouped.set('best_for', new Set())
      grouped.get('best_for')!.add(bf)
    }
    if (dp.family) {
      if (!grouped.has('family')) grouped.set('family', new Set())
      grouped.get('family')!.add(dp.family)
    }
    if (dp.knowledge_cutoff) {
      if (!grouped.has('knowledge_cutoff')) grouped.set('knowledge_cutoff', new Set())
      grouped.get('knowledge_cutoff')!.add(dp.knowledge_cutoff)
    }
    if (dp.releaseDate) {
      if (!grouped.has('release_date')) grouped.set('release_date', new Set())
      grouped.get('release_date')!.add(dp.releaseDate)
    }
    if (dp.supports_reasoning) {
      if (!grouped.has('supports_reasoning')) grouped.set('supports_reasoning', new Set())
      grouped.get('supports_reasoning')!.add('Yes')
    }
    if (dp.open_weights) {
      if (!grouped.has('open_weights')) grouped.set('open_weights', new Set())
      grouped.get('open_weights')!.add('Yes')
    }
  }
  const result: FeatureGroup[] = []
  for (const [type, values] of grouped) {
    result.push({ type, values: Array.from(values).sort() })
  }
  return result
})

const superIssues = computed(() => {
  if (!super_.value) return []
  const ids = new Set(super_.value.datapoints.map(d => d.id))
  return store.knownIssues.filter(issue => ids.has(issue.model_id))
})



function toggleExpand(dp: { id: string }) {
  expandedDp.value = expandedDp.value === dp.id ? null : dp.id
}

function formatStatus(s: string): string {
  if (s === 'rate_limited') return 'Rate Limited'
  if (s === 'not_found') return 'Not Found'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatContext(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(n)
}

function formatFeatureType(t: string): string {
  const labels: Record<string, string> = {
    tag: 'Tags',
    best_for: 'Best For',
    family: 'Family',
    knowledge_cutoff: 'Knowledge Cutoff',
    release_date: 'Release Date',
    supports_reasoning: 'Reasoning',
    open_weights: 'Open Weights',
  }
  return labels[t] ?? t
}

// Reset selected datapoint when route changes
watch(() => route.params.id, () => {
  expandedDp.value = null
})
</script>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.breadcrumb a {
  color: var(--accent);
  text-decoration: none;
}
.breadcrumb a:hover {
  text-decoration: underline;
}
.breadcrumb .sep {
  color: var(--border);
}

.header-family {
  font-size: 0.55em;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--accent-subtle);
  padding: 2px 8px;
  border-radius: var(--radius-full, 999px);
  vertical-align: middle;
  margin-left: 8px;
}

.super-stats {
  margin-bottom: 24px;
}

.section {
  margin-bottom: 28px;
}
.section h3 {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 12px;
}
.section-hint {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin: -8px 0 8px;
}

.role-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.role-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 16px;
  background: var(--surface-raised, var(--surface));
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  min-width: 80px;
}
.role-name {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.role-score {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
}
.role-best-provider {
  font-size: 0.6rem;
  color: var(--text-dim);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
thead th {
  text-align: left;
  padding: 8px 12px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
tbody td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle, rgba(127,127,127,0.08));
  vertical-align: middle;
}
tbody tr {
  cursor: pointer;
  transition: background 0.12s;
}
tbody tr:hover {
  background: var(--accent-subtle);
}
tbody tr.row-removed {
  opacity: 0.5;
}
.row-expanded {
  background: var(--accent-subtle);
}

.detail-row td {
  padding: 0;
  border-bottom: 1px solid var(--border);
}
.detail-inline {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 16px;
  padding: 12px 16px;
  position: relative;
}
.detail-inline-col {
  min-width: 0;
}
.detail-inline-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: block;
  margin-bottom: 4px;
}
.detail-inline-text {
  font-size: 0.78rem;
  color: var(--text-dim);
  white-space: normal;
  overflow-wrap: break-word;
}
.detail-inline-close {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  align-self: start;
  transition: all 0.12s;
}
.detail-inline-close:hover {
  color: var(--text);
  border-color: var(--text-muted);
}

.col-provider {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.provider-name {
  font-weight: 600;
}
.provider-source {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
}

.col-date {
  color: var(--text-dim);
  font-size: 0.72rem;
  white-space: nowrap;
}

.check-yes {
  color: var(--green);
  font-weight: 700;
}
.check-no {
  color: var(--text-muted);
}

.feature-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.feature-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.feature-type {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.feature-values {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.issue-card {
  padding: 12px 16px;
  background: var(--surface-raised, var(--surface));
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  margin-bottom: 8px;
}
.issue-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.issue-title {
  font-weight: 600;
  font-size: 0.85rem;
}
.issue-model-id {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  margin-left: auto;
}
.issue-card p {
  font-size: 0.78rem;
  color: var(--text-dim);
  margin: 2px 0;
}
.mini-label {
  font-weight: 600;
  color: var(--text-muted);
}
</style>
