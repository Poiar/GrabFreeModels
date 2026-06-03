<template>
  <div>
    <div class="page-header">
      <h2>Known Issues</h2>
      <p>Non-fatal issues affecting model usability</p>
    </div>

    <div v-if="store.loading" class="card">
      <div class="empty-state-inner" style="padding: 24px;">
        <div class="empty-state-icon" style="font-size: 2rem;">⏳</div>
        <p>Loading issues…</p>
      </div>
    </div>

    <div v-else-if="store.error" class="card">
      <div class="empty-state-inner" style="padding: 24px;">
        <div class="empty-state-icon" style="font-size: 2rem;">⚠️</div>
        <p>Failed to load issues: {{ store.error }}</p>
        <button class="refresh-btn" @click="store.loadData()">Retry</button>
      </div>
    </div>

    <!-- Severity summary bar -->
    <div v-if="!store.loading && !store.error && store.knownIssues.length > 0" class="severity-bar">
      <div
        v-for="sev in severityCounts"
        :key="sev.severity"
        class="severity-pill"
        :class="[`severity-pill-${sev.severity}`, { active: activeSeverityFilter === sev.severity }]"
        @click="toggleSeverityFilter(sev.severity)"
      >
        <span class="severity-dot" :class="`severity-dot-${sev.severity}`"></span>
        <span class="severity-label">{{ sev.severity }}</span>
        <span class="severity-count">{{ sev.count }}</span>
      </div>
      <button v-if="activeSeverityFilter" class="severity-clear" @click="activeSeverityFilter = null">
        Clear filter
      </button>
    </div>

    <div v-if="!store.loading && !store.error && filteredIssues.length === 0 && store.knownIssues.length === 0" class="card">
      <div class="empty-state-inner" style="padding: 24px;">
        <div class="empty-state-icon" style="font-size: 2rem;">✅</div>
        <p>No known issues — all clear!</p>
      </div>
    </div>

    <div v-else-if="!store.loading && !store.error && filteredIssues.length === 0" class="card">
      <div class="empty-state-inner" style="padding: 24px;">
        <div class="empty-state-icon" style="font-size: 2rem;">🔍</div>
        <p>No issues match the selected severity filters.</p>
      </div>
    </div>

    <div v-if="!store.loading && !store.error && filteredIssues.length > 0" class="issues-sort-bar">
      <label>Sort by:</label>
      <select v-model="issuesSortBy">
        <option value="reported">Reported date</option>
        <option value="last_verified">Last verified</option>
        <option value="severity">Severity</option>
        <option value="model_id">Model ID</option>
      </select>
      <button class="sort-dir-btn" @click="issuesSortDesc = !issuesSortDesc" :title="issuesSortDesc ? 'Descending' : 'Ascending'" :aria-label="issuesSortDesc ? 'Sort descending' : 'Sort ascending'">
        {{ issuesSortDesc ? '↓' : '↑' }}
      </button>
    </div>

    <div
      v-for="issue in sortedIssues"
      :key="issue.model_id + issue.issue"
      class="issue-card"
      :class="`issue-card-${issue.severity}`"
    >
      <div class="issue-severity-bar" :class="`issue-severity-bar-${issue.severity}`"></div>
      <div class="issue-content">
        <div class="issue-header">
           <span class="model-id">{{ issue.model_id }}</span>
           <span v-if="store.getModelById(issue.model_id)?.supports_tools === true" class="badge badge-tools-yes" title="Supports tool calling">tools</span>
           <span v-else-if="store.getModelById(issue.model_id)?.supports_tools === false" class="badge badge-tools-no" title="No tool calling">no tools</span>
           <span class="badge" :class="`badge-severity-${issue.severity}`">
             {{ issue.severity }}
           </span>
        </div>
        <div class="issue-body">
          <p class="issue-title">{{ issue.issue }}</p>
          <div class="issue-details">
            <div class="issue-detail-row">
              <span class="detail-icon">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
              <span class="label">Impact</span>
              <span class="value">{{ issue.impact }}</span>
            </div>
            <div class="issue-detail-row">
              <span class="detail-icon">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              </span>
              <span class="label">Workaround</span>
              <span class="label">Workaround</span>
              <span class="value">{{ issue.workaround }}</span>
            </div>
          </div>
          <p class="issue-dates">
            <span>Reported: {{ issue.reported }}</span>
            <span class="date-sep">·</span>
            <span>Last verified: {{ issue.last_verified }}</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useModelsStore } from '@/store/models'
import type { KnownIssue } from '@/types'

const store = useModelsStore()
const activeSeverityFilter = ref<string | null>(null)
const issuesSortBy = ref('reported')
const issuesSortDesc = ref(true)

const severityOrder = ['critical', 'high', 'moderate', 'low'] as const

const severityRank: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 }

const severityCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const issue of store.knownIssues) {
    counts[issue.severity] = (counts[issue.severity] || 0) + 1
  }
  return severityOrder
    .filter(s => counts[s])
    .map(s => ({ severity: s, count: counts[s] }))
})

const filteredIssues = computed(() => {
  const issues = store.knownIssues
  if (!activeSeverityFilter.value) return issues
  return issues.filter(i => i.severity === activeSeverityFilter.value)
})

const sortedIssues = computed((): KnownIssue[] => {
  const sorted = [...filteredIssues.value]
  const dir = issuesSortDesc.value ? -1 : 1
  sorted.sort((a, b) => {
    switch (issuesSortBy.value) {
      case 'severity':
        return dir * ((severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9))
      case 'model_id':
        return dir * a.model_id.localeCompare(b.model_id)
      case 'last_verified':
        return dir * ((a.last_verified ?? '').localeCompare(b.last_verified ?? ''))
      default:
        return dir * (a.reported ?? '').localeCompare(b.reported ?? '')
    }
  })
  return sorted
})

function toggleSeverityFilter(severity: string) {
  if (activeSeverityFilter.value === severity) {
    activeSeverityFilter.value = null
  } else {
    activeSeverityFilter.value = severity
  }
}
</script>

<style scoped>
.issues-sort-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.issues-sort-bar label {
  font-weight: 600;
}

.issues-sort-bar select {
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 0.74rem;
  cursor: pointer;
}

.sort-dir-btn {
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
}

.sort-dir-btn:hover {
  border-color: var(--border-focus);
}

.severity-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.severity-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-dim);
  text-transform: capitalize;
}

.severity-pill:hover {
  border-color: var(--border-focus);
  background: var(--bg-hover);
  transform: translateY(-1px);
}

.severity-pill.active {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.severity-pill-critical.active { border-color: var(--red); background: var(--red-subtle); color: var(--red); }
.severity-pill-high.active { border-color: var(--red-dim); background: var(--red-subtle); color: var(--red-dim); }
.severity-pill-moderate.active { border-color: var(--orange); background: var(--orange-subtle); color: var(--orange); }
.severity-pill-low.active { border-color: var(--accent); background: var(--accent-subtle); color: var(--accent); }

.severity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.severity-dot-critical { background: var(--red); box-shadow: 0 0 6px var(--red-glow); }
.severity-dot-high { background: var(--red-dim); }
.severity-dot-moderate { background: var(--orange); }
.severity-dot-low { background: var(--accent); }

.severity-count {
  font-weight: 700;
  font-size: 0.68rem;
  opacity: 0.7;
}

.severity-clear {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  padding: 6px 12px;
  border-radius: var(--radius-full);
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: 4px;
}

.severity-clear:hover {
  border-color: var(--text-dim);
  color: var(--text);
}

.issue-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0;
  margin-bottom: 14px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  display: flex;
}

.issue-card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
  transform: translateX(3px);
}

.issue-severity-bar {
  width: 4px;
  flex-shrink: 0;
  transition: width 0.2s;
}

.issue-card:hover .issue-severity-bar {
  width: 5px;
}

.issue-severity-bar-critical { background: var(--red); }
.issue-severity-bar-high { background: var(--red-dim); }
.issue-severity-bar-moderate { background: var(--orange); }
.issue-severity-bar-low { background: var(--accent); }

.issue-content {
  flex: 1;
  padding: 18px 20px;
}

.issue-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.issue-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
  line-height: 1.4;
}

.issue-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.issue-detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.82rem;
  line-height: 1.5;
}

.detail-icon {
  color: var(--text-muted);
  flex-shrink: 0;
  margin-top: 2px;
}

.issue-detail-row .label {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  min-width: 80px;
}

.issue-detail-row .value {
  color: var(--text);
}

.badge-tools-yes { border-color: var(--green); background: var(--green-subtle); color: var(--green); font-size: 0.6rem; padding: 2px 8px; }
.badge-tools-no { border-color: var(--red); background: rgba(239,68,68,0.1); color: var(--red); font-size: 0.6rem; padding: 2px 8px; }
.badge-severity-critical { border-color: var(--red); background: rgba(248,81,73,0.12); color: var(--red); }
.badge-severity-high { border-color: var(--red-dim); background: rgba(248,81,73,0.08); color: var(--red-dim); }
.badge-severity-moderate { border-color: var(--orange); background: rgba(210,153,34,0.12); color: var(--orange); }
.badge-severity-low { border-color: var(--accent); background: rgba(88,166,255,0.12); color: var(--accent); }

.issue-dates {
  font-size: 0.7rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-sep {
  color: var(--border);
}
</style>
