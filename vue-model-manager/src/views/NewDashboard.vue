<template>
  <div class="new-dashboard">
    <!-- Aurora header -->
    <div class="aurora-header">
      <div class="aurora-mesh"></div>
      <div class="page-header">
        <h2>Dashboard</h2>
        <p>
          {{ store.visibleStats.creators }} creators, {{ store.visibleStats.providers }} providers,
          {{ store.visibleStats.models }} models tracked<template v-if="store.isSourceFilterActive"> <span class="filtered-note"> (filtered)</span></template>
        </p>
      </div>
    </div>

    <!-- Quick search -->
    <div class="dash-search">
      <input
        v-model="searchQuery"
        type="text"
        class="dash-search-input"
        placeholder="Search models, creators, families, providers…"
        @keydown.enter="goSearch"
      />
      <button class="dash-search-btn" @click="goSearch">Find</button>
    </div>

    <!-- Stale banner -->
    <div v-if="store.isStale" class="stale-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>Data may be stale.</span>
      <button class="refresh-btn-sm" @click="store.loadData()">Refresh</button>
    </div>

    <!-- Hero Stats -->
    <div class="hero-stats">
<div class="hero-stat-card stat-green">
        <div class="hsc-top-bar"></div>
        <div class="hsc-value stat-number">{{ store.visibleStats.models }}</div>
        <div class="hsc-label">Super Models</div>
        <div class="hsc-spark">
          <svg viewBox="0 0 60 20" class="sparkline">
            <polyline :points="sparkPoints.models" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
      <div class="hero-stat-card stat-purple">
        <div class="hsc-top-bar"></div>
        <div class="hsc-value stat-number">{{ store.visibleStats.datapoints }}</div>
        <div class="hsc-label">Total Datapoints</div>
        <div class="hsc-spark">
          <svg viewBox="0 0 60 20" class="sparkline">
            <polyline :points="sparkPoints.datapoints" fill="none" stroke="var(--purple)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
      <div class="hero-stat-card stat-creators">
        <div class="hsc-top-bar"></div>
        <div class="hsc-value stat-number">{{ store.visibleStats.creators }}</div>
        <div class="hsc-label">Creators</div>
        <div class="hsc-spark">
          <svg viewBox="0 0 60 20" class="sparkline">
            <polyline :points="sparkPoints.creators" fill="none" stroke="var(--cyan)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Watchlist -->
    <WatchlistWidget v-if="!store.loading" />

    <!-- Critical issues -->
    <div v-if="criticalIssues.length > 0" class="issues-alert-section">
      <div class="card issues-alert-card">
        <div class="card-title">Issues Needing Attention</div>
        <div class="issues-alert-list">
          <div v-for="issue in criticalIssues" :key="issue.model_id + issue.issue" class="issues-alert-row">
            <span class="ia-severity" :class="'ia-sev-' + issue.severity">{{ issue.severity }}</span>
            <span class="ia-model">{{ modelNameForId(issue.model_id) }}</span>
            <span class="ia-text">{{ issue.issue }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Router-only models alert -->
    <div v-if="store.routerOnlyModels && store.routerOnlyModels.count > 0" class="router-alert-section">
      <div class="card router-alert-card">
        <div class="card-title">Router-Only Models</div>
        <p class="router-alert-text">
          <strong>{{ store.routerOnlyModels.count }}</strong> free models are only accessible via routers — no direct inference provider exists.
          If a router's API key or quota is exhausted, these models become unreachable.
        </p>
        <div class="router-alert-models">
          <span v-for="m in store.routerOnlyModels.models.slice(0, 8)" :key="m.slug" class="router-model-chip">{{ m.name }}</span>
          <span v-if="store.routerOnlyModels.models.length > 8" class="router-model-chip more">+{{ store.routerOnlyModels.models.length - 8 }} more</span>
        </div>
      </div>
    </div>

    <!-- Fine-tune Stats -->
    <div class="finetune-section">
      <div class="card">
        <div class="card-title">Fine-tune Stats</div>
        <div class="ft-coverage-row">
          <span class="ft-subtitle">Family Coverage</span>
          <span class="ft-coverage-pct">{{ coveragePct }}%</span>
        </div>
        <div class="ft-coverage-bar-track">
          <div class="ft-coverage-bar-fill" :style="{ width: coveragePct + '%' }"></div>
        </div>
        <div class="ft-stats-row">
          <div class="ft-stat">
            <div class="ft-value">{{ foundationCount }}</div>
            <div class="ft-label">Foundation Models</div>
          </div>
          <div class="ft-stat">
            <div class="ft-value accent-val">{{ finetuneCount }}</div>
            <div class="ft-label">Fine-tuned Models</div>
          </div>
          <div class="ft-stat">
            <div class="ft-value muted-val">{{ uncategorizedCount }}</div>
            <div class="ft-label">Uncategorized</div>
          </div>
        </div>
        <div v-if="store.familyCoverage && store.familyCoverage.with_base_model_no_family > 0" class="ft-resolvable">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{{ store.familyCoverage.with_base_model_no_family }} models have base_model links but no family — run <code>inherit-families</code> to resolve</span>
        </div>
        <div v-if="derivationMethodEntries.length > 0" class="ft-derivation-breakdown">
          <div class="ft-subtitle">By Derivation Method</div>
          <div class="ft-deriv-chips">
            <router-link
              v-for="[method, count] in derivationMethodEntries"
              :key="method"
              :to="`/?deriv=${method}`"
              class="ft-deriv-chip dash-deriv-link"
            >{{ DERIV_LABELS[method] || method }}: {{ count }}</router-link>
          </div>
        </div>
        <div v-if="topDerived.length > 0" class="most-derived-section">
          <div class="ft-subtitle">Most Fine-tuned</div>
          <div class="ft-chips">
            <router-link
              v-for="[slug, children] in topDerived"
              :key="slug"
              :to="`/model/${slug}`"
              class="ft-chip"
            >
              <span class="ft-chip-name">{{ store.modelBySlug.get(slug)?.name ?? slug }}</span>
              <span class="ft-chip-count">{{ children.length }}</span>
            </router-link>
          </div>
        </div>
        <div v-if="deepestChains.length > 0" class="deepest-chains-section">
          <div class="ft-subtitle">Deepest Chains</div>
          <div class="chain-list">
            <div v-for="entry in deepestChains" :key="entry.model.super_id" class="chain-row">
              <router-link :to="`/model/${entry.model.slug}`" class="chain-model-link">{{ entry.model.name }}</router-link>
              <span class="chain-depth-badge">Depth {{ entry.depth }}</span>
              <span class="chain-path">{{ entry.path.join(' → ') }}</span>
            </div>
          </div>
        </div>
        <div v-if="treemapFamilies.length > 0" class="family-dist-section">
          <div class="ft-subtitle">Family Landscape</div>
          <div class="treemap-canvas">
            <router-link v-for="f in treemapFamilies" :key="f.name" :to="`/family/${encodeURIComponent(f.name)}`" class="treemap-cell" :style="{ background: f.color, gridColumn: f.span > 1 ? `span ${f.span}` : '' }">
              <span class="treemap-cell-name">{{ f.name }}</span>
              <span class="treemap-cell-count">{{ f.count }} models</span>
            </router-link>
          </div>
        </div>
        <div v-if="topFamilies.length > 0" class="family-dist-section">
          <div class="ft-subtitle">Top Families</div>
          <div class="family-bars">
            <div v-for="f in topFamilies" :key="f.name" class="family-bar-row">
              <span class="family-bar-label">{{ f.name }}</span>
              <div class="family-bar-track">
                <div class="family-bar-fill" :style="{ width: f.pct + '%' }"></div>
              </div>
              <span class="family-bar-count">{{ f.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Used-up providers -->
    <div v-if="store.usedUpProviders.length > 0" class="used-up-section">
      <div class="card">
        <div class="card-title">Monthly Quota Exhausted ({{ store.currentMonth }})</div>
        <div class="used-up-list">
          <span v-for="provider in store.usedUpProviders" :key="provider" class="used-up-tag">
            {{ provider }}
            <span class="used-up-reason">{{ store.providerUsage[provider]?.reason ?? '' }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Provider Ecosystem Timeline -->
    <div v-if="store.providerTimeline" class="timeline-section">
      <div class="card">
        <div class="card-title">Provider Ecosystem Growth</div>
        <p class="card-subtitle">{{ store.providerTimeline.total }} providers tracked across {{ store.providerTimeline.timeline.length }} milestones</p>
        <div class="tl-bar">
          <div
            v-for="entry in timelineBars"
            :key="entry.date"
            class="tl-bar-seg"
            :style="{ flex: entry.width, background: entry.color }"
            :title="entry.date + ': +' + entry.added.length + ' providers'"
          ></div>
        </div>
        <div class="tl-legend">
          <span v-for="entry in timelineLast5" :key="entry.date" class="tl-legend-item">
            <span class="tl-dot" :style="{ background: entry.color }"></span>
            {{ formatDate(entry.date) }}: +{{ entry.added.length }}
          </span>
        </div>
      </div>
    </div>

    <!-- Top Ranked + Top Scored -->
    <div class="insights-row">
      <div class="card">
        <div class="card-title">Top Ranked (Free)</div>
        <div class="top-ranked-list">
          <router-link
            v-for="entry in topPerRole"
            :key="entry.role"
            :to="'/model/' + entry.slug"
            class="top-ranked-row"
          >
            <span class="tr-role">{{ entry.roleLabel }}</span>
            <span class="tr-name">{{ entry.name }}</span>
          </router-link>
        </div>
      </div>

      <div class="card" v-if="topScored.length > 0">
        <div class="card-title">Top Scored (Intelligence)</div>
        <div class="top-ranked-list">
          <router-link
            v-for="entry in topScored"
            :key="entry.slug"
            :to="'/model/' + entry.slug"
            class="top-ranked-row"
          >
            <span class="tr-role">{{ entry.score }}</span>
            <span class="tr-name">{{ entry.name }}</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- New This Week -->
    <div v-if="newThisWeek.length > 0" class="recent-section">
      <div class="card">
        <div class="card-title">New This Week</div>
        <div class="recent-list">
          <router-link
            v-for="entry in newThisWeek"
            :key="entry.dp.full_id"
            :to="'/model/' + entry.model.slug"
            class="recent-row"
          >
            <span class="recent-model">{{ entry.model.name }}</span>
            <span class="recent-provider">via {{ entry.dp.provider }}</span>
            <span class="recent-time">{{ formatDate(entry.dp.created_at!) }}</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- Recently Active -->
    <div class="recent-section">
      <div class="card">
        <div class="card-title">Recently Active</div>
        <div class="recent-list">
          <router-link
            v-for="entry in recentlyActive"
            :key="entry.dp.full_id"
            :to="'/model/' + entry.model.slug"
            class="recent-row"
          >
            <span class="recent-model">{{ entry.model.name }}</span>
            <span class="recent-provider">via {{ entry.dp.provider }}</span>
            <span class="recent-time">{{ formatTimeAgo(entry.dp.last_success) }}</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- ── Provider speed leaderboard ── -->
    <div v-if="store.providerLatencies.length > 0" class="speed-section">
      <div class="card">
        <div class="card-title">Provider Speed Leaderboard</div>
        <div class="speed-list">
          <div v-for="(p, i) in store.providerLatencies.slice(0, 10)" :key="p.provider_slug" class="speed-row">
            <span class="speed-rank">#{{ i + 1 }}</span>
            <router-link :to="'/provider/' + p.provider_slug" class="speed-provider">{{ p.provider_name }}</router-link>
            <span class="speed-avg">{{ p.avg_latency_ms }}ms avg</span>
            <span class="speed-p95">p95: {{ p.p95_latency_ms }}ms</span>
            <span class="speed-samples" :title="p.last_measured">{{ p.sample_count }} samples</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Week-over-week validation trend ── -->
    <div v-if="store.testSummary && store.testSummaryPrevious" class="wow-section">
      <div class="card wow-card">
        <div class="card-title">Week-over-Week Trend</div>
        <p class="wow-summary">
          <span class="wow-date">{{ store.testSummaryPrevious.date }} → {{ store.testSummary.date }}:</span>
          <span v-if="workingDelta > 0" class="wow-chunk wow-up">↑{{ workingDelta }} working</span>
          <span v-else-if="workingDelta < 0" class="wow-chunk wow-down">↓{{ Math.abs(workingDelta) }} working</span>
          <span v-else class="wow-chunk wow-flat">working steady</span>
          <span v-if="brokenDelta !== 0" class="wow-sep">·</span>
          <span v-if="brokenDelta > 0" class="wow-chunk wow-down">↑{{ brokenDelta }} broken</span>
          <span v-else-if="brokenDelta < 0" class="wow-chunk wow-up">↓{{ Math.abs(brokenDelta) }} broken</span>
          <span v-if="limitedDelta !== 0" class="wow-sep">·</span>
          <span v-if="limitedDelta > 0" class="wow-chunk wow-warn">↑{{ limitedDelta }} rate-limited</span>
          <span v-else-if="limitedDelta < 0" class="wow-chunk wow-up">↓{{ Math.abs(limitedDelta) }} rate-limited</span>
        </p>
      </div>
    </div>

    <!-- ── Flakiest models ── -->
    <div v-if="store.flakiestModels.length > 0" class="flaky-section">
      <div class="card">
        <div class="card-title">Flakiest Models (7d failure rate)</div>
        <div class="flaky-list">
          <router-link
            v-for="f in store.flakiestModels.slice(0, 8)"
            :key="f.super_id"
            :to="'/model/' + f.slug"
            class="flaky-row"
          >
            <span class="flaky-name">{{ f.name }}</span>
            <span class="flaky-rate" :class="f.failure_rate_7d >= 50 ? 'rate-bad' : 'rate-warn'">
              {{ f.failure_rate_7d }}%
            </span>
            <span class="flaky-samples">{{ f.failures_7d }}/{{ f.samples_7d }} failed</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- ── Recently broken / fixed ── -->
    <div v-if="store.recentlyBroken.length > 0 || store.recentlyFixed.length > 0" class="recent-deltas">
      <div v-if="store.recentlyBroken.length > 0" class="card delta-card delta-broken">
        <div class="card-title">🔴 Newly Broken</div>
        <div class="delta-list">
          <router-link v-for="r in store.recentlyBroken" :key="r.full_id" :to="'/model/' + r.slug" class="delta-row">
            <span class="delta-name">{{ r.name }}</span>
            <span class="delta-provider">via {{ r.provider }}</span>
          </router-link>
        </div>
      </div>
      <div v-if="store.recentlyFixed.length > 0" class="card delta-card delta-fixed">
        <div class="card-title">🟢 Newly Fixed</div>
        <div class="delta-list">
          <router-link v-for="r in store.recentlyFixed" :key="r.full_id" :to="'/model/' + r.slug" class="delta-row">
            <span class="delta-name">{{ r.name }}</span>
            <span class="delta-provider">via {{ r.provider }}</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- ── Model of the Day ── -->
    <div v-if="store.modelOfTheDay.length > 0" class="motd-section">
      <div class="card motd-card">
        <div class="card-title">Spotlight Models</div>
        <p class="motd-subtitle">Top balance of intelligence, availability, and stability</p>
        <div class="motd-list">
          <router-link v-for="m in store.modelOfTheDay" :key="m.slug" :to="'/model/' + m.slug" class="motd-row">
            <span class="motd-name">{{ m.name }}</span>
            <span class="motd-meta">{{ m.creator || '' }} · {{ m.provCount }} providers · {{ m.intel }} intel{{ m.stable ? ' · all stable' : '' }}</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- ── Key health ── -->
    <div v-if="store.keyHealth && store.keyHealth.keys?.length > 0" class="keyhealth-section">
      <div class="card">
        <div class="card-title">🔑 API Key Health</div>
        <p class="card-subtitle">Checked {{ formatDate(store.keyHealth.checked_at) }}</p>
        <div class="kh-list">
          <div v-for="k in store.keyHealth.keys" :key="k.provider + k.key_name" class="kh-row">
            <span class="kh-provider">{{ k.provider }}</span>
            <span class="kh-name">{{ k.key_name }}</span>
            <span class="kh-status" :class="'kh-' + k.status">{{ k.status }}</span>
            <span v-if="k.detail" class="kh-detail">{{ k.detail }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Validation & activity -->
    <div v-if="store.testSummary" class="validation-section">
      <div class="card spotlight-card">
        <div class="card-title">Latest Validation (Free Instances)</div>
        <div class="val-body">
          <div class="val-date">
            <span class="pulse-dot"></span>
            {{ store.testSummary.date }}
            <span v-if="store.testSummaryPrevious" class="val-vs">
              vs {{ store.testSummaryPrevious.date }}
            </span>
          </div>
          <div class="val-counts">
            <span class="val-count working">
              {{ store.testSummary.results.working?.length ?? 0 }} working
              <template v-if="store.testSummaryPrevious">
                <span v-if="workingDelta > 0" class="val-delta val-delta-up">+{{ workingDelta }}</span>
                <span v-else-if="workingDelta < 0" class="val-delta val-delta-down">{{ workingDelta }}</span>
                <span v-else class="val-delta val-delta-flat">—</span>
              </template>
            </span>
            <span class="val-count broken">
              {{ store.testSummary.results.broken?.length ?? 0 }} broken
              <template v-if="store.testSummaryPrevious">
                <span v-if="brokenDelta > 0" class="val-delta val-delta-up">+{{ brokenDelta }}</span>
                <span v-else-if="brokenDelta < 0" class="val-delta val-delta-down">{{ brokenDelta }}</span>
                <span v-else class="val-delta val-delta-flat">—</span>
              </template>
            </span>
            <span class="val-count limited">
              {{ store.testSummary.results.rate_limited?.length ?? 0 }} limited
              <template v-if="store.testSummaryPrevious">
                <span v-if="limitedDelta > 0" class="val-delta val-delta-up">+{{ limitedDelta }}</span>
                <span v-else-if="limitedDelta < 0" class="val-delta val-delta-down">{{ limitedDelta }}</span>
                <span v-else class="val-delta val-delta-flat">—</span>
              </template>
            </span>
          </div>
          <p v-if="store.validationMethod" class="val-procedure">{{ store.validationMethod.procedure }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import type { ModelData } from '@/types';
import { useModelsStore } from '@/store/models';
import WatchlistWidget from '@/components/WatchlistWidget.vue';

const router = useRouter();

const store = useModelsStore();

// Generate synthetic sparkline points from stats ratios (deterministic decorative patterns)
const sparkPoints = computed(() => {
  try {
    const w = isFinite(store.visibleStats.workingRatio) ? store.visibleStats.workingRatio : 0.5;
    return {
      working: generateSparkPath(0.6 + w * 0.3, 5),
      models: generateSparkPath(0.55, 1),
      datapoints: generateSparkPath(0.5, 3),
      creators: generateSparkPath(0.65, 4),
      broken: generateSparkPath(0.3, 2),
    };
  } catch {
    return { working: '0,18 60,18', models: '0,18 60,18', datapoints: '0,18 60,18', creators: '0,18 60,18', broken: '0,18 60,18' };
  }
});

function generateSparkPath(base: number, seed: number): string {
  if (!isFinite(base)) return '0,18 60,18';
  const pts: string[] = [];
  for (let x = 0; x <= 60; x += 4) {
    const noise = Math.sin(x * 0.4 + seed) * 3 + Math.cos(x * 0.7 + seed * 2) * 2;
    const y = 18 - (base * 4) - noise;
    const clipped = Math.round(Math.max(1, Math.min(19, y)));
    if (!isFinite(clipped)) { pts.push(`${x},10`); continue; }
    pts.push(`${x},${clipped}`);
  }
  return pts.join(' ');
}

// Fine-tune statistics
const foundationCount = computed(() =>
  store.allModels.filter(m => !m.base_model).length,
);

const DERIV_LABELS: Record<string, string> = {
  finetune: 'Fine-tune', merge: 'Merge', distillation: 'Distillation', dpo: 'DPO',
  continued_pretraining: 'CPT', lora_adapter: 'LoRA', unknown: 'Unknown',
};

const finetuneCount = computed(() =>
  store.allModels.filter(m => m.base_model).length,
);

const derivationMethodEntries = computed(() => {
  const counts: Record<string, number> = {};
  for (const m of store.allModels) {
    if (!m.base_model) continue;
    const method = m.derivation_method || 'unknown';
    counts[method] = (counts[method] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
});

const uncategorizedCount = computed(() =>
  store.allModels.filter(m => !m.family || m.family === 'Uncategorized').length,
);

const modelsWithFamily = computed(() =>
  store.allModels.filter(m => m.family && m.family !== 'Uncategorized').length,
);

const coveragePct = computed(() =>
  Math.round((modelsWithFamily.value / Math.max(store.allModels.length, 1)) * 100),
);

const topDerived = computed(() => {
  const entries = Array.from(store.derivedModels.entries());
  entries.sort((a, b) => b[1].length - a[1].length);
  return entries.slice(0, 6);
});

const deepestChains = computed(() => {
  const chains: { model: ModelData; depth: number; path: string[] }[] = [];
  for (const model of store.allModels) {
    if (!model.base_model) continue;
    const path: string[] = [];
    let slug: string | null = model.base_model;
    while (slug) {
      const parent = store.modelBySlug.get(slug);
      if (parent) {
        path.push(parent.name);
        slug = parent.base_model;
      } else {
        path.push(slug);
        slug = null;
      }
    }
    if (path.length >= 2) {
      chains.push({ model, depth: path.length, path });
    }
  }
  chains.sort((a, b) => b.depth - a.depth);
  return chains.slice(0, 5);
});

const topFamilies = computed(() => {
  const famMap = new Map<string, number>();
  for (const model of store.allModels) {
    if (model.family && model.family !== 'Uncategorized') {
      famMap.set(model.family, (famMap.get(model.family) ?? 0) + 1);
    }
  }
  const sorted = Array.from(famMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = sorted[0]?.[1] ?? 1;
  return sorted.map(([name, count]) => ({
    name,
    count,
    pct: Math.round((count / max) * 100),
  }));
});

const FAMILY_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1',
];

const treemapFamilies = computed(() => {
  const entries = topFamilies.value.slice(0, 12);
  if (entries.length === 0) return [];
  const total = entries.reduce((s, f) => s + f.count, 0);
  const colors = FAMILY_COLORS;
  return entries.map((f, i) => ({
    name: f.name,
    count: f.count,
    color: colors[i % colors.length],
    span: Math.max(1, Math.round((f.count / total) * 6)),
  }));
});

// Top-scored by intelligence (artificial_analysis)
const topScored = computed(() => {
  const scores = store.modelScores;
  if (!scores) return [];
  const entries: { slug: string; name: string; score: number }[] = [];
  for (const [fullId, scoreList] of Object.entries(scores.scores)) {
    const intel = scoreList.find(s => s.source === 'artificial_analysis' && s.score_type === 'intelligence');
    if (!intel || intel.score_value == null) continue;
    const dp = store.datapointById.get(fullId);
    if (!dp) continue;
    entries.push({ slug: dp.model.slug, name: dp.model.name, score: intel.score_value });
  }
  // Dedupe by slug, keep highest score
  const best = new Map<string, { slug: string; name: string; score: number }>();
  for (const e of entries) {
    const existing = best.get(e.slug);
    if (!existing || e.score > existing.score) best.set(e.slug, e);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 5);
});

// Top-ranked free models: #1 per role
const roleLabels: Record<string, string> = {
  model: 'Model',
  build: 'Build',
  general: 'General',
  small_model: 'Small',
  explore: 'Explore',
};

const topPerRole = computed(() => {
  const rankings = store.roleRankings;
  const result: { role: string; roleLabel: string; slug: string; name: string }[] = [];
  for (const role of ['model', 'build', 'general', 'small_model', 'explore'] as const) {
    const slugs = rankings[role];
    if (!slugs || slugs.length === 0) continue;
    const top = slugs[0];
    const model = store.modelBySlug.get(top);
    result.push({
      role,
      roleLabel: roleLabels[role] || role,
      slug: top,
      name: model?.name ?? top,
    });
  }
  return result;
});

// Recently active: models with most recent last_success
// New This Week — models first discovered in the last 7 days
const newThisWeek = computed(() => {
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const items: { dp: { full_id: string; provider: string; created_at: string | null }; model: { slug: string; name: string } }[] = [];
  const seen = new Set<string>();
  for (const creator of store.visibleCreators) {
    for (const model of creator.models) {
      for (const dp of model.providers) {
        if (dp._removed || !dp.created_at) continue;
        const d = new Date(dp.created_at);
        if (isNaN(d.getTime()) || d < weekAgo) continue;
        const key = dp.full_id;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          dp: { full_id: dp.full_id, provider: dp.provider, created_at: dp.created_at },
          model: { slug: model.slug, name: model.name },
        });
      }
    }
  }
  items.sort((a, b) => new Date(b.dp.created_at!).getTime() - new Date(a.dp.created_at!).getTime());
  return items.slice(0, 15);
});

// Context Masters — best context-to-params ratio
const contextMasters = computed(() => {
  try {
    const entries: { slug: string; name: string; params: string; context: string; ratio: number; ratio_label: string }[] = [];
    for (const creator of store.visibleCreators) {
      for (const model of creator.models) {
        const ctx = model.best_context;
        if (!ctx || ctx < 128000) continue;
        const dps = model.providers.filter(p => !p._removed && p.param_count_b != null);
        if (dps.length === 0) continue;
        const minParams = Math.min(...dps.map(p => p.param_count_b!));
        if (!isFinite(minParams) || minParams === 0) continue;
        const ratio = ctx / minParams;
        if (ratio < 1000) continue;
        entries.push({
          slug: model.slug,
          name: model.name,
          params: fmtParams(minParams),
          context: fmtCtx(ctx),
          ratio,
          ratio_label: `${Math.round(ratio / 1000)}K ctx/B`,
        });
      }
    }
    return entries.sort((a, b) => b.ratio - a.ratio).slice(0, 8);
  } catch {
    return [];
  }
});

function fmtCtx(ctx: number): string {
  if (ctx >= 1_000_000) return (ctx / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M ctx';
  return Math.round(ctx / 1000) + 'K ctx';
}
function fmtParams(b: number): string {
  if (b >= 1000) return (b / 1000).toFixed(1).replace(/\.0$/, '') + 'T';
  return b + 'B';
}

const recentlyActive = computed(() => {
  const items: { dp: { full_id: string; provider: string; last_success: string | null }; model: { slug: string; name: string } }[] = [];
  for (const creator of store.visibleCreators) {
    for (const model of creator.models) {
      for (const dp of model.providers) {
        if (dp._removed || !dp.last_success) continue;
        items.push({
          dp: { full_id: dp.full_id, provider: dp.provider, last_success: dp.last_success },
          model: { slug: model.slug, name: model.name },
        });
      }
    }
  }
  items.sort((a, b) => { if (!a.dp.last_success || !b.dp.last_success) return 0; return new Date(b.dp.last_success).getTime() - new Date(a.dp.last_success).getTime(); });
  return items.slice(0, 5);
});

// Quick search
const searchQuery = ref('');

function goSearch() {
  const q = searchQuery.value.trim();
  if (q) {
    router.push({ path: '/', query: { q } });
  }
}

// Critical issues (high + critical severity)
const criticalIssues = computed(() => {
  try {
    const issues = store.knownIssues;
    if (!Array.isArray(issues)) return [];
    return issues.filter(i => i.severity === 'critical' || i.severity === 'high').slice(0, 6);
  } catch {
    return [];
  }
});

// Timeline visualization
const timelineBars = computed(() => {
  const tl = store.providerTimeline;
  if (!tl?.timeline.length) return [];
  const maxCumulative = Math.max(1, tl.timeline[tl.timeline.length - 1].cumulative);
  return tl.timeline.map((entry: { date: string; added: Array<{ slug: string }>; cumulative: number; color?: string }) => {
    const color = entry.added.some((a: { slug: string }) => a.slug === 'openrouter') ? '#A78BFA'
      : entry.added.length >= 3 ? '#60A5FA'
      : '#374151';
    return { ...entry, color, width: Math.max(0.5, (entry.added.length / maxCumulative) * 100) };
  });
});

const timelineLast5 = computed(() => {
  const tl = store.providerTimeline;
  if (!tl?.timeline.length) return [];
  return tl.timeline.slice(-5).reverse().map(e => ({
    ...e,
    color: (e.added as Array<{slug: string}>).some((a: {slug: string}) => a.slug === 'openrouter') ? '#A78BFA'
      : e.added.length >= 3 ? '#60A5FA'
      : '#374151',
  }));
});

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function modelNameForId(fullId: string): string {
  const entry = store.datapointById.get(fullId);
  return entry?.model.name ?? fullId.split('/').slice(1).join('/');
}

// Validation deltas vs previous run
const workingDelta = computed(() => {
  if (!store.testSummary || !store.testSummaryPrevious?.results) return 0;
  const cur = store.testSummary.results.working?.length ?? 0;
  const prev = store.testSummaryPrevious.results.working?.length ?? 0;
  return cur - prev;
});

const brokenDelta = computed(() => {
  if (!store.testSummary || !store.testSummaryPrevious?.results) return 0;
  const cur = store.testSummary.results.broken?.length ?? 0;
  const prev = store.testSummaryPrevious.results.broken?.length ?? 0;
  return cur - prev;
});

const limitedDelta = computed(() => {
  if (!store.testSummary || !store.testSummaryPrevious?.results) return 0;
  const cur = store.testSummary.results.rate_limited?.length ?? 0;
  const prev = store.testSummaryPrevious.results.rate_limited?.length ?? 0;
  return cur - prev;
});

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = diff / 3_600_000;
  if (hours < 1) return '<1h ago';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
</script>

<style scoped>
.new-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

/* Quick search */
.dash-search {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.dash-search-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 0.85rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.dash-search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.dash-search-input::placeholder {
  color: var(--text-muted);
}

.dash-search-btn {
  padding: 10px 18px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent-subtle);
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}

.dash-search-btn:hover {
  background: var(--accent);
  color: #fff;
}

/* Critical issues alert */
.issues-alert-section {
  margin-bottom: 24px;
}

.issues-alert-card {
  border-color: rgba(239, 68, 68, 0.3);
}

.issues-alert-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.issues-alert-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.75rem;
}

.ia-severity {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  border-radius: 3px;
  flex-shrink: 0;
}

.ia-sev-critical {
  background: rgba(239, 68, 68, 0.18);
  color: var(--red);
}

.ia-sev-high {
  background: rgba(251, 191, 36, 0.18);
  color: var(--orange);
}

.ia-model {
  font-weight: 600;
  color: var(--text);
  flex-shrink: 0;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ia-text {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Router-only alert */
.router-alert-section { margin-bottom: 20px; }
.router-alert-card { border-left: 3px solid #F59E0B; }
.router-alert-text { font-size: 0.75rem; color: var(--text-secondary); margin: 4px 0 8px; line-height: 1.4; }
.router-alert-models { display: flex; flex-wrap: wrap; gap: 4px; }
.router-model-chip {
  padding: 1px 6px; font-size: 0.6rem; border-radius: 999px;
  background: rgba(245,158,11,0.12); color: #F59E0B; white-space: nowrap;
}
.router-model-chip.more {
  background: var(--bg-hover); color: var(--text-dim);
}

/* Provider timeline */
.timeline-section { margin-bottom: 20px; }
.tl-bar { display: flex; height: 24px; border-radius: 4px; overflow: hidden; gap: 1px; margin: 12px 0 8px; }
.tl-bar-seg { min-width: 2px; border-radius: 2px; transition: opacity 0.2s; cursor: default; }
.tl-bar-seg:hover { opacity: 0.7; }
.tl-legend { display: flex; flex-wrap: wrap; gap: 10px; }
.tl-legend-item { display: flex; align-items: center; gap: 4px; font-size: 0.62rem; color: var(--text-dim); }
.tl-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.card-subtitle { font-size: 0.68rem; color: var(--text-dim); margin: 2px 0 0; }

/* Validation deltas */
.val-vs {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-weight: 400;
  margin-left: 4px;
}

.val-delta {
  font-size: 0.62rem;
  font-weight: 700;
  margin-left: 2px;
}

.val-delta-up { color: var(--green); }
.val-delta-down { color: var(--red); }
.val-delta-flat { color: var(--text-muted); }

/* Aurora header */
.aurora-header {
  position: relative;
  margin-bottom: 24px;
  padding: 32px 0 8px;
  overflow: hidden;
}

.aurora-mesh {
  position: absolute;
  inset: -40px -40px 0 -40px;
  background:
    radial-gradient(ellipse 60% 50% at 20% 40%, rgba(107,138,255,0.06) 0%, transparent 60%),
    radial-gradient(ellipse 50% 60% at 70% 30%, rgba(167,139,250,0.05) 0%, transparent 60%),
    radial-gradient(ellipse 40% 40% at 50% 70%, rgba(52,211,153,0.04) 0%, transparent 60%);
  filter: blur(20px);
  pointer-events: none;
}

.aurora-header .page-header {
  position: relative;
  margin-bottom: 0;
}

.aurora-header .page-header h2 {
  background: linear-gradient(135deg, var(--text) 40%, var(--accent-end, #a78bfa));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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

.filtered-note {
  color: var(--accent);
  font-weight: 600;
}

/* Stale banner */
.stale-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: rgba(251,191,36,0.1);
  border: 1px solid var(--orange);
  border-radius: 8px;
  font-size: 0.78rem;
  color: var(--orange);
}

.refresh-btn-sm {
  margin-left: auto;
  padding: 4px 10px;
  font-size: 0.68rem;
  border: 1px solid var(--orange-dim);
  border-radius: 6px;
  background: transparent;
  color: var(--orange);
  cursor: pointer;
  font-family: inherit;
}

/* Hero Stats */
.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 32px;
}

@media (max-width: 900px) {
  .hero-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 500px) {
  .hero-stats {
    grid-template-columns: 1fr;
  }
}

.hero-stat-card {
  position: relative;
  padding: 18px 20px 14px;
  border-radius: var(--radius-md);
  background: var(--depth-3, var(--bg-card));
  border: 1px solid var(--border);
  overflow: hidden;
  transition: all var(--dur-standard, 300ms) var(--ease-default);
}

.hero-stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-elevation-3);
  border-color: var(--border-depth-1, #1e2740);
}

.hsc-top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
}

.stat-accent .hsc-top-bar { background: var(--accent-gradient, linear-gradient(135deg, #6b8aff, #a78bfa)); }
.stat-green .hsc-top-bar { background: var(--green); }
.stat-purple .hsc-top-bar { background: var(--purple); }
.stat-creators .hsc-top-bar { background: var(--cyan); }
.stat-success .hsc-top-bar { background: var(--gradient-green, linear-gradient(135deg, #34d399, #22d3ee)); }
.stat-broken .hsc-top-bar { background: var(--red-dim); }

.hsc-value {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
  margin-bottom: 2px;
  position: relative;
}

.hsc-value.green-val { color: var(--green); }
.hsc-value.orange-val { color: var(--orange); }

.hsc-unit {
  font-size: 1.1rem;
  font-weight: 600;
  opacity: 0.7;
}

.hsc-label {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 8px;
  position: relative;
}

.hsc-spark {
  height: 20px;
  opacity: 0.5;
}

.hsc-spark .sparkline {
  width: 100%;
  height: 100%;
}

/* Donut for success card */
.hsc-donut {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
}

.hsc-donut svg {
  width: 100%;
  height: 100%;
}

.hsc-donut circle {
  transition: stroke-dasharray 0.6s var(--ease-emphasis);
}

/* Glass card variant */
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border-light);
}

/* Section header */
.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.section-header h3 {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.section-badge {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background: var(--accent-subtle);
  color: var(--accent);
}

/* Ecosystem provider grid */
.ecosystem-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.eco-provider-card {
  padding: 16px;
  transition: all var(--dur-standard, 300ms) var(--ease-default);
}

.eco-provider-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-elevation-3);
}

.eco-provider-card.prov-dimmed {
  opacity: 0.5;
}

.epc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.epc-name {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  flex: 1;
}

.epc-warn {
  color: var(--orange);
  font-size: 0.8rem;
  flex-shrink: 0;
}

.epc-ring-row {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}

.epc-donut {
  width: 56px;
  height: 56px;
}

.epc-donut-text {
  font-size: 8px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}

.epc-stats-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 0.72rem;
}

.epc-stat.working {
  font-weight: 700;
  color: var(--green);
  font-family: 'JetBrains Mono', monospace;
}

.epc-stat-div {
  color: var(--text-muted);
}

.epc-stat.total {
  font-weight: 600;
  color: var(--text-dim);
  font-family: 'JetBrains Mono', monospace;
}

.epc-bar-track {
  height: 3px;
  background: var(--depth-1, var(--bg-elevated));
  border-radius: 2px;
  overflow: hidden;
}

.epc-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s var(--ease-emphasis);
}

.epc-bar-fill.bar-healthy { background: var(--green); }
.epc-bar-fill.bar-degraded { background: var(--orange); }
.epc-bar-fill.bar-down { background: var(--red); }

/* Top Ranked + Top Scored row */
.insights-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
}

@media (max-width: 700px) {
  .insights-row {
    grid-template-columns: 1fr;
  }
}
.top-ranked-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.top-ranked-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  text-decoration: none;
  border-radius: 4px;
  transition: background 0.12s;
}

.top-ranked-row:hover {
  background: var(--bg-elevated, rgba(255,255,255,0.03));
}

.tr-role {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  width: 60px;
  flex-shrink: 0;
}
.tr-detail {
  font-size: 0.6rem;
  color: var(--text-muted);
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
}

.tr-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Recently Active */
.recent-section {
  margin-bottom: 24px;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.recent-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  text-decoration: none;
  border-radius: 4px;
  transition: background 0.12s;
}

.recent-row:hover {
  background: var(--bg-elevated, rgba(255,255,255,0.03));
}

.recent-model {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-provider {
  font-size: 0.65rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.recent-time {
  font-size: 0.62rem;
  color: var(--text-muted);
  margin-left: auto;
  flex-shrink: 0;
}

/* Used-up section */
.used-up-section {
  margin-bottom: 24px;
}

.used-up-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.used-up-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 600;
  background: var(--orange-subtle);
  color: var(--orange);
  border: 1px solid rgba(251,191,36,0.2);
}

.used-up-reason {
  font-size: 0.62rem;
  font-weight: 400;
  opacity: 0.7;
}

/* Validation section */
.validation-section {
  margin-bottom: 16px;
}

.val-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.val-date {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
}

.val-counts {
  display: flex;
  gap: 12px;
  font-size: 0.72rem;
}

.val-count {
  font-weight: 600;
}

.val-count.working { color: var(--green); }
.val-count.broken { color: var(--red); }
.val-count.limited { color: var(--orange); }

.val-procedure {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin: 0;
}

/* Card shared styles */
.card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}

.card-title {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 12px;
}

/* Fine-tune Stats */
.finetune-section {
  margin-bottom: 24px;
}

.ft-stats-row {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
}

.ft-stat {
  flex: 1;
}

.ft-value {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
  margin-bottom: 2px;
}

.ft-value.accent-val {
  color: var(--accent);
}

.ft-value.muted-val {
  color: var(--text-muted);
}

.ft-label {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.ft-derivation-breakdown {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.ft-deriv-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.ft-deriv-chip {
  font-size: 0.62rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
}
.dash-deriv-link {
  text-decoration: none;
  cursor: pointer;
  transition: background 0.12s;
}
.dash-deriv-link:hover {
  background: var(--accent-subtle-hover, rgba(107,138,255,0.18));
}
.most-derived-section {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.ft-subtitle {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.ft-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ft-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--accent-subtle, rgba(107,138,255,0.1));
  color: var(--accent);
  text-decoration: none;
  transition: all var(--dur-standard, 300ms) var(--ease-default);
  border: 1px solid transparent;
}

.ft-chip:hover {
  background: var(--accent-subtle-hover, rgba(107,138,255,0.18));
  border-color: var(--accent-dim, rgba(107,138,255,0.3));
  transform: translateY(-1px);
}

.ft-chip-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ft-chip-count {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: var(--radius-full);
  background: var(--bg-elevated, rgba(255,255,255,0.06));
  color: var(--text-dim);
  font-family: 'JetBrains Mono', monospace;
}

/* Deepest Chains */
.deepest-chains-section {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 12px;
}

.chain-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chain-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 0.72rem;
}

.chain-model-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}

.chain-model-link:hover {
  text-decoration: underline;
}

.chain-depth-badge {
  padding: 1px 6px;
  font-size: 0.58rem;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #a5b4fc;
  font-weight: 700;
  flex-shrink: 0;
}

.chain-path {
  color: var(--text-muted);
  font-size: 0.65rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ft-coverage-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.ft-coverage-pct {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--accent);
  font-family: 'JetBrains Mono', monospace;
}

.ft-coverage-bar-track {
  height: 4px;
  background: var(--depth-1, var(--bg-elevated));
  border-radius: 2px;
  margin-bottom: 16px;
  overflow: hidden;
}

.ft-coverage-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent-end, #a78bfa));
  transition: width 0.6s var(--ease-emphasis);
}

.ft-resolvable {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  margin-top: 4px;
  background: rgba(251,191,36,0.08);
  border-radius: 6px;
  font-size: 0.65rem;
  color: var(--orange);
}
.ft-resolvable code {
  font-size: 0.6rem;
  background: rgba(251,191,36,0.12);
  padding: 1px 4px;
  border-radius: 3px;
}

@media (max-width: 500px) {
  .ft-stats-row {
    flex-direction: column;
    gap: 12px;
  }
}

/* Family Distribution bars */
.family-dist-section {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 12px;
}

.family-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.family-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.family-bar-label {
  width: 80px;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-dim);
  text-align: right;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.family-bar-track {
  flex: 1;
  height: 6px;
  background: var(--depth-1, var(--bg-elevated));
  border-radius: 3px;
  overflow: hidden;
}

.family-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--accent), var(--accent-end, #a78bfa));
  transition: width 0.6s var(--ease-emphasis);
}

.family-bar-count {
  width: 32px;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  text-align: left;
  flex-shrink: 0;
}

/* ── Flakiest models ── */
.flaky-section { margin-bottom: 20px; }
.flaky-list { display: flex; flex-direction: column; gap: 2px; }
.flaky-row {
  display: flex; align-items: center; gap: 10px; padding: 5px 0;
  text-decoration: none; border-radius: 4px; transition: background 0.12s;
}
.flaky-row:hover { background: var(--bg-elevated); }
.flaky-name { font-size: 0.78rem; font-weight: 600; color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.flaky-rate { font-size: 0.72rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; white-space: nowrap; }
.flaky-rate.rate-bad { color: var(--red); }
.flaky-rate.rate-warn { color: var(--orange); }
.flaky-samples { font-size: 0.62rem; color: var(--text-muted); white-space: nowrap; }

/* ── Recently broken / fixed ── */
.recent-deltas { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.delta-card { border-left: 3px solid var(--border); }
.delta-card.delta-broken { border-left-color: var(--red); }
.delta-card.delta-fixed { border-left-color: var(--green); }
.delta-list { display: flex; flex-direction: column; gap: 2px; }
.delta-row {
  display: flex; align-items: center; gap: 8px; padding: 4px 0;
  text-decoration: none; border-radius: 4px; transition: background 0.12s;
}
.delta-row:hover { background: var(--bg-elevated); }
.delta-name { font-size: 0.75rem; font-weight: 600; color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.delta-provider { font-size: 0.62rem; color: var(--text-muted); flex-shrink: 0; }

/* ── Key health ── */
.keyhealth-section { margin-bottom: 20px; }
.kh-list { display: flex; flex-direction: column; gap: 4px; }
.kh-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 4px; background: var(--bg-elevated); font-size: 0.7rem; flex-wrap: wrap; }
.kh-provider { font-weight: 700; color: var(--text); min-width: 100px; }
.kh-name { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: var(--text-dim); }
.kh-status { padding: 1px 6px; font-size: 0.58rem; font-weight: 700; text-transform: uppercase; border-radius: 3px; }
.kh-status.kh-valid { background: rgba(52,211,153,0.12); color: var(--green); }
.kh-status.kh-rate_limited { background: rgba(245,158,11,0.12); color: var(--orange); }
.kh-status.kh-expired { background: rgba(239,68,68,0.12); color: var(--red); }
.kh-status.kh-unknown { background: rgba(156,163,175,0.12); color: #9ca3af; }
.kh-detail { font-size: 0.62rem; color: var(--text-muted); flex-basis: 100%; margin-top: 2px; }

/* ── Speed leaderboard ── */
.speed-section { margin-bottom: 20px; }
.speed-list { display: flex; flex-direction: column; gap: 3px; }
.speed-row { display: flex; align-items: center; gap: 10px; padding: 5px 0; font-size: 0.75rem; }
.speed-rank { width: 24px; font-size: 0.62rem; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }
.speed-provider { font-weight: 600; color: var(--accent); text-decoration: none; min-width: 100px; }
.speed-provider:hover { text-decoration: underline; }
.speed-avg { font-weight: 700; font-family: 'JetBrains Mono', monospace; color: var(--text); white-space: nowrap; }
.speed-p95 { font-size: 0.68rem; font-family: 'JetBrains Mono', monospace; color: var(--text-muted); white-space: nowrap; }
.speed-samples { font-size: 0.62rem; color: var(--text-dim); margin-left: auto; white-space: nowrap; }

/* ── Week-over-week trend ── */
.wow-section { margin-bottom: 20px; }
.wow-card { border-left: 3px solid var(--accent); }
.wow-summary { font-size: 0.75rem; line-height: 1.5; margin: 0; display: flex; flex-wrap: wrap; gap: 3px 6px; align-items: baseline; }
.wow-date { color: var(--text-dim); font-size: 0.68rem; }
.wow-chunk { font-weight: 700; white-space: nowrap; }
.wow-chunk.wow-up { color: var(--green); }
.wow-chunk.wow-down { color: var(--red); }
.wow-chunk.wow-warn { color: var(--orange); }
.wow-chunk.wow-flat { color: var(--text-muted); }
.wow-sep { color: var(--text-muted); }

/* ── Family treemap ── */
.treemap-section { margin-bottom: 20px; }
.treemap-canvas { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 4px; margin-top: 8px; }
.treemap-cell {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 8px 4px; border-radius: 6px; text-decoration: none; transition: transform 0.12s, filter 0.12s;
  min-height: 60px; cursor: pointer;
}
.treemap-cell:hover { transform: scale(1.03); filter: brightness(1.15); }
.treemap-cell-name { font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.95); text-align: center; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; }
.treemap-cell-count { font-size: 0.62rem; color: rgba(255,255,255,0.7); margin-top: 2px; }

@media (max-width: 768px) {
  .new-dashboard {
    padding: 12px;
  }
  .hero-stats {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .hsc-value {
    font-size: 1.5rem;
  }
  .ecosystem-grid {
    grid-template-columns: 1fr;
  }
  .hsc-donut {
    width: 36px;
    height: 36px;
    right: 8px;
  }
}
</style>
