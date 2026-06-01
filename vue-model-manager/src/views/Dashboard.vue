<template>
  <div>
    <div class="page-header">
      <h2>Dashboard</h2>
      <p>Overview of all tracked free LLM models and provider health</p>
    </div>

    <!-- Stale data warning -->
    <div v-if="store.isStale" class="stale-banner">
      ⚠ Data may be stale (loaded over 1 hour ago). <button @click="store.loadData()" class="refresh-btn">Refresh</button>
    </div>

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ store.stats.total }}</div>
        <div class="stat-label">Total Models</div>
      </div>
      <div class="stat-card">
        <div class="stat-value accent">{{ store.stats.free }}</div>
        <div class="stat-label">Free Models</div>
      </div>
      <div class="stat-card">
        <div class="stat-value green">{{ store.stats.working }}</div>
        <div class="stat-label">Working</div>
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
        <div class="stat-value purple">{{ Math.round(store.stats.workingRatio * 100) }}%</div>
        <div class="stat-label">Working Ratio</div>
      </div>
      <div class="stat-card" v-if="store.removedModels.length > 0">
        <div class="stat-value orange">{{ store.removedModels.length }}</div>
        <div class="stat-label">Removed</div>
      </div>
    </div>

    <!-- Provider Health -->
    <h3 class="section-title">Provider Health</h3>
    <div class="provider-grid">
      <div
        v-for="entry in providerEntries"
        :key="entry.provider"
        class="provider-card"
        :class="{ 'used-up': store.isProviderUsedUp(entry.provider) }"
      >
        <div class="provider-name">
          {{ entry.provider }}
          <span v-if="store.isProviderUsedUp(entry.provider)" class="warn-icon" title="Used up for current month">⚠</span>
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
          {{ entry.health.total }} models total
        </div>
      </div>
    </div>

    <!-- Provider Usage -->
    <div v-if="store.usedUpProviders.length > 0" class="card gap-md">
      <div class="card-title">Used-Up Providers ({{ store.currentMonth }})</div>
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
    <div v-if="store.schemaIssueModels.length > 0" class="card gap-md">
      <div class="card-title">Schema Issues</div>
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
    <div class="card gap-md">
      <div class="card-title">Validation Method</div>
      <p v-if="store.validationMethod" class="validation-procedure">
        {{ store.validationMethod.procedure }}
      </p>
      <p v-if="store.testSummary" class="validation-meta">
        Last tested: {{ store.testSummary.date }} · Method: {{ store.testSummary.method }}
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
