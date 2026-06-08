<template>
  <div class="new-dashboard">
    <!-- Aurora header -->
    <div class="aurora-header">
      <div class="aurora-mesh"></div>
      <div class="page-header">
        <h2>Dashboard</h2>
        <p>
          {{ store.visibleStats.creators }} creators, {{ store.visibleStats.providers }} providers,
          {{ store.visibleStats.models }} models tracked<template v-if="store.isSourceFilterActive"> <span class="filtered-note">(filtered)</span></template>
        </p>
      </div>
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

    <!-- Provider Health Waveform -->
    <ProviderPulseWave class="pulse-wave-section" />

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

    <!-- Ecosystem ambient graph -->
    <EcosystemGraph class="eco-graph-section" />

    <!-- Validation & activity -->
    <div v-if="store.testSummary" class="validation-section">
      <div class="card spotlight-card">
        <div class="card-title">Latest Validation</div>
        <div class="val-body">
          <div class="val-date">
            <span class="pulse-dot"></span>
            {{ store.testSummary.date }}
          </div>
          <div class="val-counts">
            <span class="val-count working">{{ store.testSummary.results.working?.length ?? 0 }} working</span>
            <span class="val-count broken">{{ store.testSummary.results.broken?.length ?? 0 }} broken</span>
            <span class="val-count limited">{{ store.testSummary.results.rate_limited?.length ?? 0 }} limited</span>
          </div>
          <p v-if="store.validationMethod" class="val-procedure">{{ store.validationMethod.procedure }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ModelData } from '@/types';
import { useModelsStore } from '@/store/models';
import EcosystemGraph from '@/components/EcosystemGraph.vue';
import ProviderPulseWave from '@/components/ProviderPulseWave.vue';

const store = useModelsStore();

// Generate synthetic sparkline points from stats ratios (deterministic decorative patterns)
const sparkPoints = computed(() => {
  const w = store.visibleStats.workingRatio;
  return {
    working: generateSparkPath(0.6 + w * 0.3, 5),
    models: generateSparkPath(0.55, 1),
    datapoints: generateSparkPath(0.5, 3),
    creators: generateSparkPath(0.65, 4),
    broken: generateSparkPath(0.3, 2),
  };
});

function generateSparkPath(base: number, seed: number): string {
  const pts: string[] = [];
  for (let x = 0; x <= 60; x += 4) {
    const noise = Math.sin(x * 0.4 + seed) * 3 + Math.cos(x * 0.7 + seed * 2) * 2;
    const y = 18 - (base * 4) - noise;
    pts.push(`${x},${Math.round(Math.max(1, Math.min(19, y)))}`);
  }
  return pts.join(' ');
}

// Fine-tune statistics
const foundationCount = computed(() =>
  store.allModels.filter(m => !m.base_model).length,
);

const finetuneCount = computed(() =>
  store.allModels.filter(m => m.base_model).length,
);

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
</script>

<style scoped>
.new-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

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

/* Ecosystem graph section */
.eco-graph-section {
  margin-bottom: 24px;
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

.pulse-wave-section {
  margin-bottom: 28px;
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
