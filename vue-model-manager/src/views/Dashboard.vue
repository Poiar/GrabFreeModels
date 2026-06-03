<template>
  <div>
    <div class="page-header">
      <h2>Dashboard</h2>
      <p>Real-time overview of all tracked free LLM models and provider health</p>
    </div>

    <!-- Stale data warning -->
    <div v-if="store.isStale" class="stale-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span>Data may be stale (loaded over 1 hour ago).</span>
      <button @click="store.loadData()" class="refresh-btn refresh-btn-sm">Refresh</button>
    </div>

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card stat-card-highlight">
        <div class="stat-value green">{{ store.stats.working }}</div>
        <div class="stat-label">Working</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ store.stats.supers }}</div>
        <div class="stat-label">Super Models</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ store.stats.total }}</div>
        <div class="stat-label">Total Instances</div>
      </div>
      <div class="stat-card">
        <div class="stat-value accent">{{ store.stats.free }}</div>
        <div class="stat-label">Free Instances</div>
      </div>
      <div class="stat-card">
        <div class="stat-value purple">{{ Math.round(store.stats.workingRatio * 100) }}%</div>
        <div class="stat-label">Success Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value orange">{{ store.stats.rateLimited }}</div>
        <div class="stat-label">Rate Limited</div>
      </div>
      <div class="stat-card">
        <div class="stat-value red">{{ store.stats.broken }}</div>
        <div class="stat-label">Broken</div>
      </div>
      <div class="stat-card">
        <div class="stat-value accent">{{ store.stats.untested }}</div>
        <div class="stat-label">Untested</div>
      </div>
      <div class="stat-card" v-if="store.removedModels.length > 0">
        <div class="stat-value orange">{{ store.removedModels.length }}</div>
        <div class="stat-label">Removed</div>
      </div>
    </div>

    <!-- Provider Health -->
    <h3 class="section-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      Provider Health
    </h3>
    <div class="provider-grid">
      <div
        v-for="entry in providerEntries"
        :key="entry.provider"
        class="provider-card"
        :class="{ 'used-up': store.isProviderUsedUp(entry.provider) }"
      >
        <div class="provider-name">
          {{ entry.provider }}
          <span v-if="store.isProviderUsedUp(entry.provider)" class="warn-icon" title="Used up for current month">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
        </div>
        <div class="provider-bars">
          <div class="bar-row">
            <span class="bar-label">Working</span>
            <div class="bar-track">
              <div class="bar-fill working" :style="{ width: entry.pctWorking }"></div>
            </div>
            <span class="bar-count">{{ entry.health.working }}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label">Rate Limited</span>
            <div class="bar-track">
              <div class="bar-fill rate_limited" :style="{ width: entry.pctRateLimited }"></div>
            </div>
            <span class="bar-count">{{ entry.health.rate_limited }}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label">Broken</span>
            <div class="bar-track">
              <div class="bar-fill broken" :style="{ width: entry.pctBroken }"></div>
            </div>
            <span class="bar-count">{{ entry.health.broken }}</span>
          </div>

        </div>
        <div class="provider-total">
          {{ entry.health.total }} model{{ entry.health.total !== 1 ? 's' : '' }} total
        </div>
      </div>
    </div>

    <!-- Provider Usage -->
    <div v-if="store.usedUpProviders.length > 0" class="card">
      <div class="card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Used-Up Providers ({{ store.currentMonth }})
      </div>
      <table>
        <thead>
          <tr><th>Provider</th><th>Reason</th></tr>
        </thead>
        <tbody>
          <tr v-for="provider in store.usedUpProviders" :key="provider">
            <td><strong>{{ provider }}</strong></td>
            <td>{{ store.providerUsage[provider]?.reason ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Schema Issues -->
    <div v-if="store.schemaIssueModels.length > 0" class="card">
      <div class="card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Schema Issues
      </div>
      <table>
        <thead>
          <tr><th>Model</th><th>Issue</th></tr>
        </thead>
        <tbody>
          <tr v-for="issue in store.schemaIssueModels" :key="issue.modelId">
            <td class="model-id">{{ issue.modelId }}</td>
            <td class="detail-text">{{ issue.detail }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Validation Info -->
    <div class="card">
      <div class="card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Validation Method
      </div>
      <p v-if="store.validationMethod" class="validation-procedure">
        {{ store.validationMethod.procedure }}
      </p>
      <p v-if="store.testSummary" class="validation-meta">
        Last tested: {{ store.testSummary.date }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useModelsStore } from '@/store/models'

const store = useModelsStore()

function pct(value: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

const providerEntries = computed(() => {
  return Object.entries(store.providerHealth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, health]) => ({
      provider,
      health,
      pctWorking: pct(health.working, health.total),
      pctRateLimited: pct(health.rate_limited, health.total),
      pctBroken: pct(health.broken, health.total),
    }))
})
</script>

<style scoped>
.stat-card-highlight {
  border-color: var(--green-dim);
  background: linear-gradient(135deg, var(--bg-card) 0%, rgba(52,211,153,0.06) 100%);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.section-title svg {
  color: var(--accent);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-title svg {
  color: var(--text-muted);
}

.refresh-btn-sm {
  padding: 4px 12px;
  font-size: 0.72rem;
  margin-left: auto;
}
</style>
