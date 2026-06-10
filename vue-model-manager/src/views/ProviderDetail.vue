<template>
  <div v-if="provider" class="pd-page">
    <div class="page-header">
      <router-link to="/providers" class="back-link">← Providers</router-link>
      <h2>
        {{ provider.name }}
        <span
          class="cd-country"
          :style="{ color: getCountryForProvider(provider.slug).text, background: getCountryForProvider(provider.slug).color }"
        >{{ getCountryForProvider(provider.slug).name }}</span>
      </h2>
      <p class="pd-subtitle">
        {{ totalModels }} models ·
        <span class="pd-health" :class="provider.health_status">{{ provider.health_status }}</span>
      </p>
      <!-- Unique-facts chip row -->
      <div class="pd-facts" v-if="providerFacts.length">
        <span v-for="f in providerFacts" :key="f.label" class="pd-fact-chip" :class="f.cls">{{ f.label }}</span>
      </div>
      <p v-if="provider.description" class="pd-description">{{ provider.description }}</p>
    </div>

    <!-- Provider info -->
    <div class="pd-meta-grid">
      <div class="cd-stat">
        <span class="cd-stat-value">{{ totalModels }}</span>
        <span class="cd-stat-label">Total models</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ counts.working }}</span>
        <span class="cd-stat-label">Working</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ counts.rate_limited }}</span>
        <span class="cd-stat-label">Rate limited</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ counts.broken }}</span>
        <span class="cd-stat-label">Broken</span>
      </div>
      <div class="cd-stat" v-if="provider.base_url">
        <span class="cd-stat-value cd-stat-url">{{ provider.base_url }}</span>
        <span class="cd-stat-label">Base URL</span>
      </div>
      <div class="cd-stat" v-if="provider.npm_package">
        <span class="cd-stat-value cd-stat-pkg">{{ provider.npm_package }}</span>
        <span class="cd-stat-label">npm package</span>
      </div>
      <div class="cd-stat" v-if="provider.provider_type">
        <span class="cd-stat-value cd-stat-type" :class="provider.provider_type">{{ PROVIDER_TYPE_LABELS[provider.provider_type] || provider.provider_type }}</span>
        <span class="cd-stat-label">Type</span>
      </div>
      <div class="cd-stat" v-if="provider.provider_type === 'inference' && provider.serves_third_party !== null">
        <span class="cd-stat-value cd-stat-host" :class="provider.serves_third_party ? 'host' : 'firstparty'">{{ provider.serves_third_party ? 'Open-model host' : 'First-party only' }}</span>
        <span class="cd-stat-label">Model scope</span>
      </div>
      <div class="cd-stat" v-if="provider.hardware && provider.hardware !== 'unknown'">
        <span class="cd-stat-value cd-stat-hw" :class="provider.hardware">{{ HARDWARE_LABELS[provider.hardware] || provider.hardware }}</span>
        <span class="cd-stat-label">Hardware</span>
      </div>
      <div class="cd-stat" v-if="!provider.is_openai_compat">
        <span class="cd-stat-value cd-stat-flag warn">Non-standard API</span>
        <span class="cd-stat-label">Compatibility</span>
      </div>
      <!-- Rate limits -->
      <div class="cd-stat" v-if="provider.max_rpm || provider.max_tpm">
        <span class="cd-stat-value cd-stat-rate">{{ rateLimitText }}</span>
        <span class="cd-stat-label">Rate limit</span>
      </div>
      <div class="cd-stat" v-if="provider.max_daily_requests">
        <span class="cd-stat-value cd-stat-rate">{{ provider.max_daily_requests?.toLocaleString() }} req/day</span>
        <span class="cd-stat-label">Daily quota</span>
      </div>
      <!-- Routing info (for routers) -->
      <div class="cd-stat" v-if="provider.provider_type === 'router' && routerBackends.length > 0">
        <span class="cd-stat-value cd-stat-routers">{{ routerBackends.length }} backends</span>
        <span class="cd-stat-label">Routes to</span>
      </div>
      <!-- Router-only model count -->
      <div class="cd-stat" v-if="provider.provider_type === 'router' && store.routerOnlyModels">
        <span class="cd-stat-value cd-stat-flag warn">{{ routerOnlyForThis }}</span>
        <span class="cd-stat-label">Exclusive models</span>
      </div>
    </div>

    <!-- Health bar -->
    <div class="cd-validation-bar">
      <div class="val-segment working" :style="{ flex: hbFlex.working }" :title="counts.working + ' working'"></div>
      <div class="val-segment rate_limited" :style="{ flex: hbFlex.rate_limited }" :title="counts.rate_limited + ' rate limited'"></div>
      <div class="val-segment broken" :style="{ flex: hbFlex.broken }" :title="counts.broken + ' broken'"></div>
      <div class="val-segment untested" :style="{ flex: hbFlex.untested }" :title="counts.untested + ' untested'"></div>
    </div>
    <div class="cd-val-legend">
      <span v-if="counts.working" class="val-legend working">{{ counts.working }} working ({{ pctWorking }}%)</span>
      <span v-if="counts.rate_limited" class="val-legend rate_limited">{{ counts.rate_limited }} rate limited</span>
      <span v-if="counts.broken" class="val-legend broken">{{ counts.broken }} broken</span>
      <span v-if="counts.untested" class="val-legend untested">{{ counts.untested }} untested</span>
    </div>

    <!-- Quantization distribution (#7) -->
    <div v-if="quantEntries.length > 0" class="pd-quant-section">
      <h3 class="section-title">Quantization</h3>
      <div class="pd-quant-chips">
        <span v-for="[format, count] in quantEntries" :key="format" class="pd-quant-chip" :class="quantClass(format)">
          {{ format }}: <strong>{{ count }}</strong>
        </span>
      </div>
    </div>

    <!-- Failure category breakdown (#8) -->
    <div v-if="failureEntries.length > 0" class="pd-fail-section">
      <h3 class="section-title">Failure Reasons</h3>
      <div class="pd-fail-chips">
        <span v-for="[cat, count] in failureEntries" :key="cat" class="pd-fail-chip" :class="'fail-' + cat">
          {{ FAILURE_LABELS[cat] || cat }}: <strong>{{ count }}</strong>
        </span>
      </div>
    </div>

    <!-- Models grouped by creator -->
    <h3 class="section-title">Models</h3>
    <div v-if="providerCreators.length === 0" class="pd-empty">No models found for this provider.</div>
    <div v-for="{ creator, models } in providerCreators" :key="creator.id" class="pd-creator-group">
      <h4 class="pd-creator-name">
        <router-link :to="`/creator/${creator.id}`" class="pd-creator-link">{{ creator.name }}</router-link>
        <span class="pd-creator-count">{{ models.length }} model{{ models.length !== 1 ? 's' : '' }}</span>
      </h4>
      <div class="cd-models">
        <SuperModelCard
          v-for="model in models"
          :key="model.slug"
          :model="model"
          :creator-slug="creator.id"
          @click="openDetail(model, creator)"
          @creator-click="() => {}"
        />
      </div>
    </div>

    <ModelDetailPanel
      v-if="detailModel && detailCreator"
      :open="!!detailModel"
      :model="detailModel"
      :creator="detailCreator"
      @close="detailModel = null"
      @navigate-to="detailModel = $event.model"
    />
  </div>
  <div v-else class="cd-not-found">
    <p>Provider not found.</p>
    <router-link to="/providers" class="back-link">← Back to providers</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import SuperModelCard from '@/components/SuperModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';
import { useModelsStore } from '@/store/models';
import { getCountryForProvider } from '@/data/provider-countries';
import type { CreatorData, ModelData } from '@/types';

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  router: 'Router',
  inference: 'Inference',
  local: 'Local',
  discovery: 'Discovery',
};

const FAILURE_LABELS: Record<string, string> = {
  timeout: 'Timeout',
  not_found: 'Not found',
  auth_error: 'Auth error',
  rate_limited: 'Rate limited',
  server_error: 'Server error',
  network_error: 'Network error',
  unknown: 'Unknown',
};

const HARDWARE_LABELS: Record<string, string> = {
  gpu: 'GPU cluster',
  lpu: 'LPU (Groq)',
  wafer: 'Wafer-scale (Cerebras)',
  tpu: 'TPU (Google)',
  edge: 'Edge network',
  local: 'Local',
  unknown: 'Unknown',
};

const store = useModelsStore();
const route = useRoute();

const providerSlug = computed(() => route.params.slug as string);
const provider = computed(() => store.providerRefs.find((p: { slug: string }) => p.slug === providerSlug.value));

const detailModel = ref<ModelData | null>(null);
const detailCreator = ref<CreatorData | null>(null);
const rateLimitText = computed(() => {
  const p = provider.value;
  if (!p) return '';
  const parts: string[] = [];
  if (p.max_rpm) parts.push(`${p.max_rpm} RPM`);
  if (p.max_tpm) parts.push(p.max_tpm >= 1000000 ? `${(p.max_tpm / 1000000).toFixed(1)}M TPM` : `${p.max_tpm?.toLocaleString()} TPM`);
  return parts.join(' / ');
});

const routerBackends = computed(() => {
  const g = store.routingGraph;
  if (!g || !provider.value) return [];
  return g.routers?.[provider.value.slug] ?? [];
});

const routerOnlyForThis = computed(() => {
  const rom = store.routerOnlyModels;
  if (!rom || !provider.value) return 0;
  return rom.models.filter(m => m.provider_count >= 1).length;
});

function openDetail(model: ModelData, creator: CreatorData) {
  detailModel.value = model;
  detailCreator.value = creator;
}

const providerCreators = computed(() =>
  store.creators
    .map((creator) => ({
      creator,
      models: creator.models.filter((m) =>
        m.providers.some((p) => p.provider_slug === providerSlug.value && !p._removed),
      ),
    }))
    .filter((c) => c.models.length > 0),
);

const totalModels = computed(() =>
  providerCreators.value.reduce((sum, c) => sum + c.models.length, 0),
);

// ── Unique-facts chips ──
function formatParamSize(b: number): string {
  if (b >= 1000) return (b / 1000).toFixed(1).replace(/\.0$/, '') + 'T';
  if (b >= 1) return b.toFixed(1).replace(/\.0$/, '') + 'B';
  return (b * 1000).toFixed(0) + 'M';
}

const providerFacts = computed(() => {
  const chips: { label: string; cls: string }[] = [];
  if (!provider.value) return chips;

  // Collect all datapoints for this provider
  const dps: any[] = [];
  for (const { models } of providerCreators.value) {
    for (const m of models) {
      for (const dp of m.providers) {
        if (dp.provider_slug !== providerSlug.value || dp._removed) continue;
        dps.push(dp);
      }
    }
  }

  // Parameter range
  const paramSizes = [...new Set(dps.map(dp => dp.param_count_b).filter(Boolean))].sort((a, b) => a - b);
  if (paramSizes.length) {
    const min = formatParamSize(paramSizes[0]);
    const max = formatParamSize(paramSizes[paramSizes.length - 1]);
    chips.push({ label: min === max ? `${min} params` : `${min} – ${max} params`, cls: 'fact-param' });
  }

  // Number of families
  const families = new Set<string>();
  for (const { models } of providerCreators.value) {
    for (const m of models) {
      if (m.family) families.add(m.family);
    }
  }
  if (families.size > 0) {
    chips.push({ label: `${families.size} ${families.size === 1 ? 'family' : 'families'}`, cls: 'fact-family' });
  }

  // Number of creators
  const creators = providerCreators.value.length;
  if (creators > 0) {
    chips.push({ label: `${creators} ${creators === 1 ? 'creator' : 'creators'}`, cls: 'fact-creator' });
  }

  // Exclusive models (only available via this provider)
  const rom = store.routerOnlyModels;
  if (rom) {
    const exclusive = rom.models.filter(m => m.provider_count >= 1).length;
    if (exclusive > 0) {
      chips.push({ label: `${exclusive} exclusive`, cls: 'fact-exclusive' });
    }
  }

  // Hardware (if non-standard)
  if (provider.value.hardware && provider.value.hardware !== 'unknown' && provider.value.hardware !== 'gpu') {
    const hwLabel = provider.value.hardware === 'lpu' ? 'LPU' : provider.value.hardware === 'wafer' ? 'Wafer-scale' : provider.value.hardware === 'tpu' ? 'TPU' : provider.value.hardware.toUpperCase();
    chips.push({ label: hwLabel, cls: 'fact-hardware' });
  }

  // OpenAI compat
  if (provider.value.is_openai_compat === true) {
    chips.push({ label: 'OpenAI-compatible', cls: 'fact-compat' });
  }

  return chips;
});

const counts = computed(() => {
  let working = 0, broken = 0, rate_limited = 0, untested = 0;
  for (const { models } of providerCreators.value) {
    for (const m of models) {
      for (const dp of m.providers) {
        if (dp.provider_slug !== providerSlug.value || dp._removed) continue;
        const r = dp.status.result;
        if (r === 'working') working++;
        else if (r === 'broken' || r === 'not_found') broken++;
        else if (r === 'rate_limited') rate_limited++;
        else untested++;
      }
    }
  }
  return { working, broken, rate_limited, untested, total: working + broken + rate_limited + untested };
});

const hbFlex = computed(() => {
  const c = counts.value;
  const total = c.total || 1;
  return {
    working: c.working / total,
    rate_limited: c.rate_limited / total,
    broken: c.broken / total,
    untested: c.untested / total,
  };
});

const pctWorking = computed(() => {
  const c = counts.value;
  return c.total ? Math.round((c.working / c.total) * 100) : 0;
});

// ── Quantization distribution (#7) ──
const quantEntries = computed(() => {
  const dist = new Map<string, number>();
  for (const { models } of providerCreators.value) {
    for (const m of models) {
      for (const dp of m.providers) {
        if (dp.provider_slug !== providerSlug.value || dp._removed) continue;
        const q = dp.quantization || 'unknown';
        dist.set(q, (dist.get(q) || 0) + 1);
      }
    }
  }
  return [...dist.entries()].sort((a, b) => b[1] - a[1]);
});

function quantClass(format: string): string {
  if (format === 'fp16' || format === 'bf16') return 'qt-full';
  if (format === 'fp8' || format === 'int8') return 'qt-mid';
  if (format === 'fp4' || format === 'int4' || format === 'gguf' || format === 'awq' || format === 'gptq' || format === 'bnb') return 'qt-low';
  if (format === 'unknown') return 'qt-unk';
  return 'qt-other';
}

// ── Failure category breakdown (#8) ──
const failureEntries = computed(() => {
  const dist = new Map<string, number>();
  for (const { models } of providerCreators.value) {
    for (const m of models) {
      for (const dp of m.providers) {
        if (dp.provider_slug !== providerSlug.value || dp._removed) continue;
        if (dp.status.result === 'working' || dp.status.result === 'untested') continue;
        const cat = dp.failure_category || 'unknown';
        dist.set(cat, (dist.get(cat) || 0) + 1);
      }
    }
  }
  return [...dist.entries()].sort((a, b) => b[1] - a[1]);
});
</script>

<style scoped>
.pd-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.back-link {
  font-size: 0.78rem;
  color: var(--accent);
  text-decoration: none;
}
.back-link:hover { text-decoration: underline; }
.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 8px 0 4px;
}
.cd-country {
  font-size: 0.55rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.04em;
  vertical-align: middle;
  margin-left: 4px;
}
.pd-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}
.pd-health {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 4px;
}
.pd-health.healthy { color: var(--green); background: color-mix(in srgb, var(--green) 12%, transparent); }
.pd-health.degraded { color: var(--orange); background: color-mix(in srgb, var(--orange) 12%, transparent); }
.pd-health.down { color: var(--red); background: color-mix(in srgb, var(--red) 12%, transparent); }

/* ── Unique-facts chips ── */
.pd-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.pd-fact-chip {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
}
.pd-fact-chip.fact-param { background: rgba(99,102,241,0.12); color: #818cf8; }
.pd-fact-chip.fact-family { background: rgba(52,211,153,0.12); color: #34d399; }
.pd-fact-chip.fact-creator { background: rgba(236,72,153,0.12); color: #ec4899; }
.pd-fact-chip.fact-exclusive { background: rgba(245,158,11,0.12); color: #f59e0b; }
.pd-fact-chip.fact-hardware { background: rgba(168,85,247,0.12); color: #a855f7; }
.pd-fact-chip.fact-compat { background: rgba(59,130,246,0.12); color: #60a5fa; }

.pd-description {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 8px 0 0;
  max-width: 800px;
}

.pd-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin: 16px 0;
}
.cd-stat {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}
.cd-stat-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--accent);
}
.cd-stat-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cd-stat-url {
  font-size: 0.65rem;
  font-family: monospace;
  word-break: break-all;
}
.cd-stat-pkg {
  font-size: 0.72rem;
  font-family: monospace;
  color: var(--green);
}
.cd-stat-type {
  font-size: 0.78rem;
  font-weight: 700;
}
.cd-stat-type.router { color: #A78BFA; }
.cd-stat-type.inference { color: #60A5FA; }
.cd-stat-type.local { color: #34D399; }
.cd-stat-type.discovery { color: #FBBF24; }
.cd-stat-host {
  font-size: 0.72rem;
  font-weight: 600;
}
.cd-stat-host.host { color: #34D399; }
.cd-stat-host.firstparty { color: #F59E0B; }
.cd-stat-hw {
  font-size: 0.72rem;
  font-weight: 600;
}
.cd-stat-hw.gpu { color: #F59E0B; }
.cd-stat-hw.lpu { color: #A78BFA; }
.cd-stat-hw.wafer { color: #F472B6; }
.cd-stat-hw.tpu { color: #60A5FA; }
.cd-stat-hw.edge { color: #34D399; }
.cd-stat-hw.local { color: #34D399; }
.cd-stat-flag {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
}
.cd-stat-flag.warn { color: #F59E0B; }
.cd-stat-rate {
  font-size: 0.72rem;
  font-family: monospace;
  color: var(--text);
}
.cd-stat-routers {
  font-size: 0.72rem;
  font-weight: 600;
  color: #A78BFA;
}

.cd-validation-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
  gap: 1px;
}
.val-segment { min-width: 2px; transition: flex 0.3s; }
.val-segment.working { background: var(--green); }
.val-segment.rate_limited { background: var(--orange); }
.val-segment.broken { background: var(--red); }
.val-segment.untested { background: var(--accent); }

.cd-val-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-top: 6px;
}
.val-legend {
  font-size: 0.62rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}
.val-legend::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.val-legend.working { color: var(--green); }
.val-legend.working::before { background: var(--green); }
.val-legend.rate_limited { color: var(--orange); }
.val-legend.rate_limited::before { background: var(--orange); }
.val-legend.broken { color: var(--red); }
.val-legend.broken::before { background: var(--red); }
.val-legend.untested { color: var(--accent); }
.val-legend.untested::before { background: var(--accent); }

.pd-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* Quantization chips (#7) */
.pd-quant-section { margin: 16px 0 8px; }
.pd-quant-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pd-quant-chip {
  padding: 3px 10px;
  font-size: 0.65rem;
  font-weight: 600;
  border-radius: 999px;
}
.pd-quant-chip strong { font-family: 'JetBrains Mono', monospace; }
.pd-quant-chip.qt-full { background: rgba(52,211,153,0.12); color: #34D399; }
.pd-quant-chip.qt-mid { background: rgba(251,191,36,0.12); color: #FBBF24; }
.pd-quant-chip.qt-low { background: rgba(239,68,68,0.12); color: #F87171; }
.pd-quant-chip.qt-unk { background: rgba(156,163,175,0.12); color: #9CA3AF; }
.pd-quant-chip.qt-other { background: rgba(59,130,246,0.12); color: #60A5FA; }

/* Failure category chips (#8) */
.pd-fail-section { margin: 16px 0 8px; }
.pd-fail-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pd-fail-chip {
  padding: 3px 10px;
  font-size: 0.65rem;
  font-weight: 600;
  border-radius: 999px;
}
.pd-fail-chip strong { font-family: 'JetBrains Mono', monospace; }
.pd-fail-chip.fail-timeout { background: rgba(251,191,36,0.12); color: #FBBF24; }
.pd-fail-chip.fail-not_found { background: rgba(156,163,175,0.12); color: #9CA3AF; }
.pd-fail-chip.fail-auth_error { background: rgba(239,68,68,0.15); color: #F87171; }
.pd-fail-chip.fail-rate_limited { background: rgba(245,158,11,0.12); color: #F59E0B; }
.pd-fail-chip.fail-server_error { background: rgba(239,68,68,0.12); color: #EF4444; }
.pd-fail-chip.fail-network_error { background: rgba(59,130,246,0.12); color: #60A5FA; }
.pd-fail-chip.fail-unknown { background: rgba(156,163,175,0.12); color: #9CA3AF; }

.pd-creator-group {
  margin-bottom: 20px;
}
.pd-creator-name {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text-secondary);
}
.pd-creator-link {
  color: var(--accent);
  text-decoration: none;
}
.pd-creator-link:hover { text-decoration: underline; }
.pd-creator-count {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-weight: 400;
}

.section-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 20px 0 12px;
}
.cd-models {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cd-not-found {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .pd-page { padding: 12px; }
  .pd-meta-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
