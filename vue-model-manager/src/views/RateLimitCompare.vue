<template>
  <div class="rl-page">
    <div class="page-header">
      <h2>Rate Limit Comparison</h2>
      <p>Compare free tier quotas across providers — RPM, TPM, and daily limits</p>
    </div>

    <!-- Search / filter -->
    <div class="rl-toolbar">
      <input v-model="searchQuery" class="rl-search" type="text" placeholder="Search models..." />
      <select v-model="providerFilter" class="rl-select">
        <option value="">All providers</option>
        <option v-for="p in allProviders" :key="p.slug" :value="p.slug">
          {{ p.name }}
        </option>
      </select>
    </div>

    <!-- Summary leaderboard -->
    <section class="rl-section">
      <h3 class="rl-section-title">Summary Leaderboard</h3>
      <p class="rl-section-subtitle">Top 5 most generous providers by each limit type</p>
      <div class="rl-leaderboard">
        <div class="rl-lb-col">
          <div class="rl-lb-header">Highest RPM</div>
          <div
            v-for="(entry, i) in topRpm"
            :key="entry.slug"
            class="rl-lb-row"
            :class="{ 'rl-lb-gold': i === 0 }"
          >
            <span class="rl-lb-rank">{{ i + 1 }}</span>
            <router-link :to="'/provider/' + entry.slug" class="rl-lb-name">{{
              entry.name
            }}</router-link>
            <span class="rl-lb-val" :class="limitClass(entry.max_rpm)">{{
              formatLimit(entry.max_rpm)
            }}</span>
          </div>
        </div>
        <div class="rl-lb-col">
          <div class="rl-lb-header">Highest TPM</div>
          <div
            v-for="(entry, i) in topTpm"
            :key="entry.slug"
            class="rl-lb-row"
            :class="{ 'rl-lb-gold': i === 0 }"
          >
            <span class="rl-lb-rank">{{ i + 1 }}</span>
            <router-link :to="'/provider/' + entry.slug" class="rl-lb-name">{{
              entry.name
            }}</router-link>
            <span class="rl-lb-val" :class="limitClass(entry.max_tpm)">{{
              formatLimit(entry.max_tpm)
            }}</span>
          </div>
        </div>
        <div class="rl-lb-col">
          <div class="rl-lb-header">Highest Daily</div>
          <div
            v-for="(entry, i) in topDaily"
            :key="entry.slug"
            class="rl-lb-row"
            :class="{ 'rl-lb-gold': i === 0 }"
          >
            <span class="rl-lb-rank">{{ i + 1 }}</span>
            <router-link :to="'/provider/' + entry.slug" class="rl-lb-name">{{
              entry.name
            }}</router-link>
            <span class="rl-lb-val" :class="limitClass(entry.max_daily_requests)">{{
              formatLimit(entry.max_daily_requests)
            }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Model-anchored view -->
    <section class="rl-section">
      <h3 class="rl-section-title">Model Provider Breakdown</h3>
      <p class="rl-section-subtitle">
        Select a model to see its providers sorted by rate limit generosity
      </p>
      <select v-model="selectedModelSlug" class="rl-select rl-model-select">
        <option value="">— Pick a model —</option>
        <option v-for="m in filteredModels" :key="m.slug" :value="m.slug">
          {{ m.name }}
        </option>
      </select>

      <div v-if="selectedModel" class="rl-table-wrap">
        <table class="rl-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>RPM</th>
              <th>TPM</th>
              <th>Daily Requests</th>
              <th>Auth Required</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="dp in sortedProvidersForModel" :key="dp.full_id">
              <td>
                <router-link :to="'/provider/' + dp.provider_slug" class="rl-prov-link">
                  {{ dp.provider }}
                </router-link>
              </td>
              <td :class="limitClass(dp.max_rpm)">{{ formatLimit(dp.max_rpm) }}</td>
              <td :class="limitClass(dp.max_tpm)">{{ formatLimit(dp.max_tpm) }}</td>
              <td :class="limitClass(dp.max_daily_requests)">
                {{ formatLimit(dp.max_daily_requests) }}
              </td>
              <td>
                <span v-if="dp.requires_account_id" class="rl-badge rl-badge-yes">Yes</span>
                <span v-else class="rl-badge rl-badge-no">No</span>
              </td>
              <td>
                <span class="rl-status" :class="dp.status.result">{{ dp.status.result }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="filteredModels.length > 0 && !selectedModelSlug" class="rl-prompt">
        <p>Select a model above to see provider-by-provider rate limit breakdown.</p>
      </div>
    </section>

    <!-- Provider ranking -->
    <section class="rl-section">
      <h3 class="rl-section-title">Provider Rate Limit Ranking</h3>
      <p class="rl-section-subtitle">All providers sorted by average RPM across their models</p>
      <div class="rl-table-wrap">
        <table class="rl-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Models</th>
              <th>Avg RPM</th>
              <th>Max RPM</th>
              <th>Avg TPM</th>
              <th>Max TPM</th>
              <th>Daily Cap</th>
              <th>Auth Type</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pr in providerRankings" :key="pr.slug">
              <td>
                <router-link :to="'/provider/' + pr.slug" class="rl-prov-link">{{
                  pr.name
                }}</router-link>
              </td>
              <td class="rl-cell-num">{{ pr.modelCount }}</td>
              <td :class="limitClass(pr.avgRpm)" class="rl-cell-num">
                {{ formatLimit(pr.avgRpm) }}
              </td>
              <td :class="limitClass(pr.maxRpm)" class="rl-cell-num">
                {{ formatLimit(pr.maxRpm) }}
              </td>
              <td :class="limitClass(pr.avgTpm)" class="rl-cell-num">
                {{ formatLimit(pr.avgTpm) }}
              </td>
              <td :class="limitClass(pr.maxTpm)" class="rl-cell-num">
                {{ formatLimit(pr.maxTpm) }}
              </td>
              <td :class="limitClass(pr.dailyCap)" class="rl-cell-num">
                {{ formatLimit(pr.dailyCap) }}
              </td>
              <td>
                <span v-if="pr.requiresCard" class="rl-badge rl-badge-yes">Card</span>
                <span v-else-if="pr.requiresAccount" class="rl-badge rl-badge-warn">Account</span>
                <span v-else class="rl-badge rl-badge-no">Open</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Best value highlights -->
    <section class="rl-section">
      <h3 class="rl-section-title">Best Value Models</h3>
      <p class="rl-section-subtitle">
        Models available on 3+ providers with at least one offering high limits
      </p>
      <div v-if="bestValueModels.length === 0" class="rl-prompt">
        <p>No models match the criteria.</p>
      </div>
      <div v-else class="rl-bv-grid">
        <div v-for="entry in bestValueModels" :key="entry.model.slug" class="rl-bv-card">
          <div class="rl-bv-name">
            <router-link :to="'/model/' + entry.model.slug" class="rl-prov-link">
              {{ entry.model.name }}
            </router-link>
          </div>
          <div class="rl-bv-meta">
            <span class="rl-bv-count">{{ entry.model.providers.length }} providers</span>
            <span v-for="dp in entry.highLimitProviders" :key="dp.full_id" class="rl-bv-prov">
              {{ dp.provider }}
            </span>
          </div>
          <div class="rl-bv-detail">
            <div v-for="dp in entry.model.providers" :key="dp.full_id" class="rl-bv-dp">
              <router-link :to="'/provider/' + dp.provider_slug" class="rl-bv-dp-prov">{{
                dp.provider
              }}</router-link>
              <span :class="limitClass(dp.max_rpm)" class="rl-bv-dp-limit"
                >{{ formatLimit(dp.max_rpm) }} RPM</span
              >
              <span :class="limitClass(dp.max_tpm)" class="rl-bv-dp-limit"
                >{{ formatLimit(dp.max_tpm) }} TPM</span
              >
              <span :class="limitClass(dp.max_daily_requests)" class="rl-bv-dp-limit"
                >{{ formatLimit(dp.max_daily_requests) }}/d</span
              >
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '@/store/models';
import type { ProviderDatapoint, ModelData } from '@/types';

const store = useModelsStore();

const searchQuery = ref('');
const providerFilter = ref('');
const selectedModelSlug = ref('');

// ── All provider references ──
const allProviders = computed(() =>
  [...store.providerRefs].sort((a, b) => a.name.localeCompare(b.name)),
);

// ── Filtered models (by search + provider) ──
const filteredModels = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  const ps = providerFilter.value;
  return store.allModels.filter((m) => {
    if (q && !m.name.toLowerCase().includes(q)) return false;
    if (ps && !m.providers.some((dp) => dp.provider_slug === ps)) return false;
    return true;
  });
});

// ── Summary leaderboard (top 5 per limit) ──
function providersWithLimit(field: 'max_rpm' | 'max_tpm' | 'max_daily_requests') {
  return allProviders.value
    .filter((p) => p[field] != null)
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))
    .slice(0, 5);
}

const topRpm = computed(() => providersWithLimit('max_rpm'));
const topTpm = computed(() => providersWithLimit('max_tpm'));
const topDaily = computed(() => providersWithLimit('max_daily_requests'));

// ── Model-anchored providers ──
const selectedModel = computed(() =>
  selectedModelSlug.value
    ? (store.allModels.find((m) => m.slug === selectedModelSlug.value) ?? null)
    : null,
);

const sortedProvidersForModel = computed(() => {
  const model = selectedModel.value;
  if (!model) return [];
  return [...model.providers].sort((a, b) => {
    const rpmA = a.max_rpm ?? 0;
    const rpmB = b.max_rpm ?? 0;
    if (rpmB !== rpmA) return rpmB - rpmA;
    const tpmA = a.max_tpm ?? 0;
    const tpmB = b.max_tpm ?? 0;
    return tpmB - tpmA;
  });
});

// ── Provider ranking ──
const providerRankings = computed(() => {
  // Aggregate per provider across datapoints
  const map = new Map<
    string,
    {
      name: string;
      slug: string;
      rpms: number[];
      tpms: number[];
      dailys: number[];
      modelCount: number;
      requiresCard: boolean | null;
      requiresAccount: boolean | null;
    }
  >();
  for (const model of store.allModels) {
    for (const dp of model.providers) {
      let entry = map.get(dp.provider_slug);
      if (!entry) {
        entry = {
          name: dp.provider,
          slug: dp.provider_slug,
          rpms: [],
          tpms: [],
          dailys: [],
          modelCount: 0,
          requiresCard: null,
          requiresAccount: null,
        };
        map.set(dp.provider_slug, entry);
      }
      if (dp.max_rpm != null) entry.rpms.push(dp.max_rpm);
      if (dp.max_tpm != null) entry.tpms.push(dp.max_tpm);
      if (dp.max_daily_requests != null) entry.dailys.push(dp.max_daily_requests);
      // Count unique models (super_id)
      entry.modelCount = new Set(
        store.allModels
          .filter((m) => m.providers.some((p) => p.provider_slug === dp.provider_slug))
          .map((m) => m.super_id),
      ).size;
      if (dp.requires_card != null) entry.requiresCard = dp.requires_card;
      if (dp.requires_account_id != null) entry.requiresAccount = dp.requires_account_id;
    }
  }

  // Merge with provider refs for declared limits
  for (const pr of store.providerRefs) {
    const e = map.get(pr.slug);
    if (e) {
      if (pr.requires_card != null) e.requiresCard = pr.requires_card;
      if (pr.requires_account_id != null) e.requiresAccount = pr.requires_account_id;
    }
  }

  return [...map.values()]
    .map((e) => ({
      name: e.name,
      slug: e.slug,
      modelCount: e.modelCount,
      avgRpm:
        e.rpms.length > 0 ? Math.round(e.rpms.reduce((a, b) => a + b, 0) / e.rpms.length) : null,
      maxRpm: e.rpms.length > 0 ? Math.max(...e.rpms) : null,
      avgTpm:
        e.tpms.length > 0 ? Math.round(e.tpms.reduce((a, b) => a + b, 0) / e.tpms.length) : null,
      maxTpm: e.tpms.length > 0 ? Math.max(...e.tpms) : null,
      dailyCap: e.dailys.length > 0 ? Math.max(...e.dailys) : null,
      requiresCard: e.requiresCard === true,
      requiresAccount: e.requiresAccount === true,
    }))
    .sort((a, b) => (b.avgRpm ?? 0) - (a.avgRpm ?? 0));
});

// ── Best value models ──
interface BestValueEntry {
  model: ModelData;
  highLimitProviders: ProviderDatapoint[];
}

const bestValueModels = computed(() => {
  const result: BestValueEntry[] = [];
  const HIGH_RPM = 60; // threshold for "high" RPM
  for (const model of store.allModels) {
    if (model.providers.length < 3) continue;
    const highLimitProviders = model.providers.filter((dp) => (dp.max_rpm ?? 0) >= HIGH_RPM);
    if (highLimitProviders.length > 0) {
      result.push({ model, highLimitProviders });
    }
  }
  // Sort by provider count descending
  return result.sort((a, b) => b.model.providers.length - a.model.providers.length);
});

// ── Formatting helpers ──
function formatLimit(val: number | null): string {
  if (val == null) return 'Not specified';
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
  if (val >= 1_000) return (val / 1_000).toFixed(1) + 'K';
  return String(val);
}

function limitClass(val: number | null): string {
  if (val == null) return 'rl-limit-none';
  if (val >= 500) return 'rl-limit-high';
  if (val >= 60) return 'rl-limit-mid';
  return 'rl-limit-low';
}
</script>

<style scoped>
.rl-page {
  max-width: 1100px;
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
  color: var(--text-dim);
  margin: 0 0 20px;
}

/* Sections */
.rl-section {
  margin-bottom: 32px;
}
.rl-section-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 2px;
}
.rl-section-subtitle {
  font-size: 0.72rem;
  color: var(--text-dim);
  margin: 0 0 14px;
}

/* Toolbar */
.rl-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
}
.rl-search {
  flex: 1;
  font-size: 0.82rem;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--text);
  font-family: inherit;
}
.rl-search:focus {
  outline: none;
  border-color: var(--accent);
}
.rl-select {
  font-size: 0.82rem;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--text);
  font-family: inherit;
  min-width: 180px;
}
.rl-select:focus {
  outline: none;
  border-color: var(--accent);
}
.rl-model-select {
  min-width: 320px;
  margin-bottom: 14px;
}

/* Leaderboard */
.rl-leaderboard {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.rl-lb-col {
  background: var(--bg-card);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.rl-lb-header {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  padding: 10px 14px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.rl-lb-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 0.78rem;
  border-bottom: 1px solid var(--border);
}
.rl-lb-row:last-child {
  border-bottom: none;
}
.rl-lb-gold {
  background: rgba(251, 191, 36, 0.06);
}
.rl-lb-rank {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-dim);
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}
.rl-lb-name {
  flex: 1;
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rl-lb-name:hover {
  text-decoration: underline;
}
.rl-lb-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
  font-weight: 700;
  flex-shrink: 0;
}

/* Table */
.rl-table-wrap {
  overflow-x: auto;
}
.rl-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
  background: var(--bg-card);
  border-radius: 8px;
  overflow: hidden;
}
.rl-table th {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  padding: 10px 12px;
  text-align: left;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.rl-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.rl-table tr:last-child td {
  border-bottom: none;
}
.rl-table tr:hover td {
  background: var(--bg-hover);
}
.rl-cell-num {
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
}

.rl-prov-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
.rl-prov-link:hover {
  text-decoration: underline;
}

/* Limit colors */
.rl-limit-high {
  color: var(--green, #34d399);
}
.rl-limit-mid {
  color: var(--orange, #fbbf24);
}
.rl-limit-low {
  color: var(--red, #f87171);
}
.rl-limit-none {
  color: var(--text-dim);
  font-style: italic;
}

/* Status badges */
.rl-status {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.03em;
}
.rl-status.working {
  background: rgba(63, 185, 80, 0.12);
  color: var(--green);
}
.rl-status.broken {
  background: rgba(248, 113, 113, 0.12);
  color: var(--red);
}
.rl-status.rate_limited {
  background: rgba(251, 191, 36, 0.12);
  color: var(--orange);
}
.rl-status.untested {
  background: rgba(156, 163, 175, 0.12);
  color: var(--text-dim);
}
.rl-status.not_found {
  background: rgba(248, 113, 113, 0.12);
  color: var(--red);
}

/* Auth badges */
.rl-badge {
  display: inline-block;
  font-size: 0.58rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.rl-badge-yes {
  background: rgba(248, 113, 113, 0.12);
  color: var(--red);
}
.rl-badge-no {
  background: rgba(63, 185, 80, 0.12);
  color: var(--green);
}
.rl-badge-warn {
  background: rgba(251, 191, 36, 0.12);
  color: var(--orange);
}

/* Prompt */
.rl-prompt {
  text-align: center;
  padding: 40px 0;
  color: var(--text-dim);
  font-size: 0.85rem;
}

/* Best value grid */
.rl-bv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}
.rl-bv-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
}
.rl-bv-name {
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 6px;
}
.rl-bv-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 0.7rem;
}
.rl-bv-count {
  color: var(--text-dim);
  font-weight: 600;
}
.rl-bv-prov {
  background: rgba(63, 185, 80, 0.12);
  color: var(--green);
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.6rem;
}
.rl-bv-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rl-bv-dp {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.72rem;
  padding: 3px 6px;
  background: var(--bg);
  border-radius: 4px;
}
.rl-bv-dp-prov {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  min-width: 90px;
}
.rl-bv-dp-prov:hover {
  text-decoration: underline;
}
.rl-bv-dp-limit {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 700;
}

@media (max-width: 768px) {
  .rl-toolbar {
    flex-direction: column;
  }
  .rl-leaderboard {
    grid-template-columns: 1fr;
  }
  .rl-bv-grid {
    grid-template-columns: 1fr;
  }
}
</style>
