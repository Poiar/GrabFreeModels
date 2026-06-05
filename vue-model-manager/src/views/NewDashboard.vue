<template>
  <div class="new-dashboard">
    <div class="page-header">
      <h2>Dashboard</h2>
      <p>
        Ecosystem overview — {{ store.stats.creators }} creators,
        {{ store.stats.providers }} providers
      </p>
    </div>

    <div v-if="store.isStale" class="stale-banner">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>Data may be stale.</span>
      <button class="refresh-btn refresh-btn-sm" @click="store.loadData()">Refresh</button>
    </div>

    <!-- Stats bar -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value green">{{ store.stats.working }}</div>
        <div class="stat-label">Working</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ store.stats.models }}</div>
        <div class="stat-label">Models</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ store.stats.datapoints }}</div>
        <div class="stat-label">Datapoints</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ store.stats.creators }}</div>
        <div class="stat-label">Creators</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ store.stats.providers }}</div>
        <div class="stat-label">Providers</div>
      </div>
      <div class="stat-card">
        <div class="stat-value accent">{{ store.stats.free }}</div>
        <div class="stat-label">Free</div>
      </div>
      <div class="stat-card">
        <div class="stat-value orange">{{ store.stats.broken }}</div>
        <div class="stat-label">Broken</div>
      </div>
      <div class="stat-card">
        <div class="stat-value purple">{{ Math.round(store.stats.workingRatio * 100) }}%</div>
        <div class="stat-label">Success Rate</div>
      </div>
    </div>

    <!-- Provider health grid -->
    <h3 class="section-title">Provider Health</h3>
    <div class="provider-grid">
      <div
        v-for="prov in store.providerRefs"
        :key="prov.id"
        class="provider-card"
        :class="`prov-${prov.health_status}`"
      >
        <div class="prov-name">{{ prov.name }}</div>
        <div class="prov-stats">
          <span class="prov-count">{{ prov.working_count }}/{{ prov.model_count }}</span>
          <span class="prov-status-dot" :class="`dot-${prov.health_status}`"></span>
        </div>
        <div class="prov-bar-track">
          <div
            class="prov-bar-fill"
            :style="{
              width: `${prov.model_count > 0 ? Math.round((prov.working_count / prov.model_count) * 100) : 0}%`,
            }"
          ></div>
        </div>
        <div class="prov-total">{{ prov.model_count }} models</div>
      </div>
    </div>

    <!-- Used-up providers -->
    <div v-if="store.usedUpProviders.length > 0" class="card">
      <div class="card-title">Used-Up Providers ({{ store.currentMonth }})</div>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="provider in store.usedUpProviders" :key="provider">
            <td>
              <strong>{{ provider }}</strong>
            </td>
            <td>{{ store.providerUsage[provider]?.reason ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Last tested -->
    <div v-if="store.testSummary" class="card">
      <div class="card-title">Validation</div>
      <p>Last tested: {{ store.testSummary.date }}</p>
      <p v-if="store.validationMethod">{{ store.validationMethod.procedure }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModelsStore } from '@/store/models';
const store = useModelsStore();
</script>

<style scoped>
.new-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0 0 4px;
}
.page-header p {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  margin-bottom: 24px;
}
.stat-card {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  text-align: center;
}
.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
}
.stat-value.green {
  color: var(--green);
}
.stat-value.accent {
  color: var(--accent);
}
.stat-value.orange {
  color: var(--orange);
}
.stat-value.purple {
  color: var(--purple, #a78bfa);
}
.stat-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 16px;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  margin-bottom: 24px;
}
.provider-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}
.prov-healthy {
  border-left: 3px solid var(--green);
}
.prov-degraded {
  border-left: 3px solid var(--orange);
}
.prov-down {
  border-left: 3px solid var(--red);
}

.prov-name {
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 4px;
}
.prov-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.prov-count {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--green);
}
.prov-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.dot-healthy {
  background: var(--green);
}
.dot-degraded {
  background: var(--orange);
}
.dot-down {
  background: var(--red);
}

.prov-bar-track {
  height: 4px;
  background: var(--bg-elevated);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}
.prov-bar-fill {
  height: 100%;
  background: var(--green);
  border-radius: 2px;
  transition: width 0.3s;
}
.prov-total {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  margin-bottom: 16px;
}
.card-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin-bottom: 8px;
}
.card p {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 4px 0;
}

table {
  width: 100%;
  font-size: 0.78rem;
}
th,
td {
  padding: 6px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
th {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.72rem;
}

.refresh-btn {
  padding: 4px 10px;
  font-size: 0.68rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}
.refresh-btn-sm {
  margin-left: auto;
}

@media (max-width: 768px) {
  .new-dashboard {
    padding: 12px;
  }
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .provider-grid {
    grid-template-columns: 1fr;
  }
}
</style>
