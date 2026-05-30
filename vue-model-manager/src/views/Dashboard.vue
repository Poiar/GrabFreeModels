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
        <div class="stat-value">{{ store.stats.free }}</div>
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
        <div class="stat-value accent">{{ store.stats.untested }}</div>
        <div class="stat-label">Untested</div>
      </div>
      <div class="stat-card">
        <div class="stat-value purple">{{ Math.round(store.stats.workingRatio * 100) }}%</div>
        <div class="stat-label">Working Ratio</div>
      </div>
    </div>

    <!-- Provider Health -->
    <h3 class="section-title">Provider Health</h3>
    <div class="provider-grid">
      <div
        v-for="(health, provider) in store.providerHealth"
        :key="provider"
        class="provider-card"
        :class="{ 'used-up': store.isProviderUsedUp(provider) }"
      >
        <div class="provider-name">
          {{ provider }}
          <span v-if="store.isProviderUsedUp(provider)" class="warn-icon" title="Used up for current month">⚠</span>
        </div>
        <div class="provider-bars">
          <div class="bar-row">
            <span class="bar-label">Working</span>
            <div class="bar-track">
              <div class="bar-fill working" :style="{ width: pct(health.working, health.total) }"></div>
            </div>
            <span class="bar-count">{{ health.working }}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label">Rate Limited</span>
            <div class="bar-track">
              <div class="bar-fill rate_limited" :style="{ width: pct(health.rate_limited, health.total) }"></div>
            </div>
            <span class="bar-count">{{ health.rate_limited }}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label">Broken</span>
            <div class="bar-track">
              <div class="bar-fill broken" :style="{ width: pct(health.broken, health.total) }"></div>
            </div>
            <span class="bar-count">{{ health.broken }}</span>
          </div>
        </div>
        <div class="provider-total">
          {{ health.total }} models total
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
    <div class="card">
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
import { useModelsStore } from '@/store/models'

const store = useModelsStore()

function pct(value: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((value / total) * 100)}%`
}
</script>
