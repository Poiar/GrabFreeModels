<template>
  <div v-if="model" class="smd-page">
    <div class="page-header">
      <router-link to="/supermodels" class="back-link">← Super Models</router-link>
      <div class="smd-header-row">
        <button
          class="smd-watch-btn"
          :class="{ watched: wl.isWatched(model.super_id) }"
          @click="wl.toggle(model)"
          :title="(wl.isWatched(model.super_id) ? 'Remove from' : 'Add to') + ' watch list'"
        >
          {{ wl.isWatched(model.super_id) ? '★' : '☆' }}
        </button>
        <h2>{{ model.name }}</h2>
      </div>
      <p class="smd-subtitle">
        <router-link :to="`/creator/${creatorSlug}`" class="smd-creator-link">{{
          model.creator || 'Unknown'
        }}</router-link>
        <template v-if="model.base_model">
          · derived from
          <router-link :to="`/supermodel/${model.base_model}`" class="smd-base-link">{{
            model.base_model
          }}</router-link>
          <span v-if="model.derivation_method" class="smd-deriv-method"
            >({{ formatDerivMethod(model.derivation_method) }})</span
          >
          <span v-if="model.derivation_source" class="smd-deriv-source" :class="sourceClass">{{
            sourceLabel(model.derivation_source)
          }}</span>
        </template>
        <template v-if="model.family">
          ·
          <router-link
            :to="`/family/${encodeURIComponent(model.family)}`"
            class="smd-family-link"
            >{{ formatFamilyName(model.family) }}</router-link
          >
        </template>
      </p>

      <!-- Unique-facts chip row -->
      <div class="smd-facts" v-if="modelFacts.length">
        <span v-for="f in modelFacts" :key="f.label" class="smd-fact-chip" :class="f.cls">{{
          f.label
        }}</span>
      </div>

      <p v-if="modelDescription" class="smd-description">{{ modelDescription }}</p>
    </div>

    <!-- Features row -->
    <div class="smd-features-row">
      <div class="smd-provider-icons" v-if="activeProviders.length">
        <ProviderIcon
          v-for="p in activeProviders"
          :key="p.slug"
          :slug="p.slug"
          :size="18"
          :alt="p.name"
          cls="smd-prov-icon"
        />
      </div>
      <div class="smd-caps">
        <span
          v-for="cap in capabilities"
          :key="cap.key"
          class="smd-cap-badge"
          :class="{ active: cap.has }"
          :title="cap.label"
          >{{ cap.label }}</span
        >
      </div>
      <div class="smd-bestfor-tags" v-if="model.best_for?.length">
        <span v-for="tag in model.best_for" :key="tag" class="smd-bestfor">{{ tag }}</span>
      </div>
      <div class="smd-input-types" v-if="allInputTypes.length">
        <span v-for="t in allInputTypes" :key="t" class="smd-input-type">{{ t }}</span>
      </div>
      <div class="smd-rank-highlights" v-if="rankEntries.length">
        <span class="smd-rank-label">Rankings:</span>
        <span
          v-for="[role, rank] in rankEntries"
          :key="role"
          class="smd-rank-tag"
          :class="rank <= 3 ? 'top' : 'mid'"
        >
          #{{ rank }} {{ formatRole(role) }}
        </span>
      </div>
    </div>

    <!-- Meta grid -->
    <div class="smd-meta-grid">
      <div class="smd-stat">
        <span class="smd-stat-value">{{ activeProviders.length }}</span>
        <span class="smd-stat-label">Providers</span>
      </div>
      <div class="smd-stat">
        <span class="smd-stat-value">{{ formatContext(model.best_context) }}</span>
        <span class="smd-stat-label">Best context</span>
      </div>
      <div class="smd-stat">
        <span class="smd-stat-value">{{ paramRange }}</span>
        <span class="smd-stat-label">Param range</span>
      </div>
      <div class="smd-stat">
        <span class="smd-stat-value">{{ quantizationSummary }}</span>
        <span class="smd-stat-label">Quantization</span>
      </div>
      <div class="smd-stat">
        <span class="smd-stat-value">{{ releaseInfo }}</span>
        <span class="smd-stat-label">Release</span>
      </div>
      <div class="smd-stat">
        <span class="smd-stat-value">{{ isFreeContext ? validationPct + '%' : '—' }}</span>
        <span class="smd-stat-label">{{ isFreeContext ? 'Validation' : 'Status' }}</span>
      </div>
    </div>

    <!-- Validation bar -->
    <div class="smd-validation-bar">
      <div
        class="val-segment working"
        :style="{ flex: valFlex.working }"
        :title="valCounts.working + ' working'"
      ></div>
      <div
        class="val-segment rate_limited"
        :style="{ flex: valFlex.rate_limited }"
        :title="valCounts.rate_limited + ' rate limited'"
      ></div>
      <div
        class="val-segment broken"
        :style="{ flex: valFlex.broken }"
        :title="valCounts.broken + ' broken'"
      ></div>
      <div
        class="val-segment not_found"
        :style="{ flex: valFlex.not_found }"
        :title="valCounts.not_found + ' not found'"
      ></div>
      <div
        class="val-segment untested"
        :style="{ flex: valFlex.untested }"
        :title="valCounts.untested + ' untested'"
      ></div>
    </div>
    <div class="smd-val-legend">
      <span v-if="valCounts.working" class="val-legend working"
        >{{ valCounts.working }} working</span
      >
      <span v-if="valCounts.rate_limited" class="val-legend rate_limited"
        >{{ valCounts.rate_limited }} rate limited</span
      >
      <span v-if="valCounts.broken" class="val-legend broken">{{ valCounts.broken }} broken</span>
      <span v-if="valCounts.not_found" class="val-legend not_found"
        >{{ valCounts.not_found }} not found</span
      >
      <span v-if="valCounts.untested" class="val-legend untested"
        >{{ valCounts.untested }} untested</span
      >
    </div>
    <div v-if="!isFreeContext" class="smd-paid-notice">
      Paid models are presumed working (not tested).
    </div>

    <!-- Health History -->
    <div v-if="healthEntries.length" class="health-section">
      <h3 class="section-title">Health History</h3>
      <div class="health-grid">
        <HealthSpark
          v-for="entry in healthEntries"
          :key="entry.fullId"
          :full-id="entry.fullId"
          :provider-slug="entry.providerSlug"
        />
      </div>
    </div>

    <!-- Provider datapoints table -->
    <h3 class="section-title">Provider Instances</h3>
    <div class="smd-provider-table">
      <div
        v-for="dp in sortedDatapoints"
        :key="dp.full_id"
        class="smd-dp-row"
        :class="{ removed: dp._removed }"
      >
        <div class="smd-dp-provider">
          <ProviderIcon :slug="dp.provider_slug" :size="16" :alt="dp.provider" cls="smd-dp-icon" />
          <span class="smd-dp-prov-name">{{ dp.provider }}</span>
          <span class="smd-dp-status" :class="dp.status.result">{{ dp.status.result }}</span>
        </div>
        <div class="smd-dp-details">
          <span v-if="dp.context_length" class="smd-dp-detail"
            >{{ formatContext(dp.context_length) }} ctx</span
          >
          <span v-if="dp.quantization" class="smd-dp-detail q">{{ dp.quantization }}</span>
          <span v-if="dp.param_count_b" class="smd-dp-detail">{{
            formatParams(dp.param_count_b)
          }}</span>
          <span v-if="dp.is_free" class="smd-dp-detail free">Free</span>
          <span v-if="dp.supports_tools" class="smd-dp-detail cap">Tools</span>
          <span v-if="dp.supports_reasoning" class="smd-dp-detail cap">Reasoning</span>
          <span v-if="dp.supports_attachment" class="smd-dp-detail cap">Vision</span>
          <span v-if="dp.open_weights" class="smd-dp-detail open">Open</span>
          <span v-if="dp.knowledge_cutoff" class="smd-dp-detail cutoff">{{
            dp.knowledge_cutoff
          }}</span>
        </div>
        <div class="smd-dp-limits" v-if="dp.max_rpm || dp.max_tpm || dp.max_daily_requests">
          <span v-if="dp.max_rpm" class="smd-dp-limit">{{ dp.max_rpm }} RPM</span>
          <span v-if="dp.max_tpm" class="smd-dp-limit"
            >{{
              dp.max_tpm >= 1000000
                ? (dp.max_tpm / 1000000).toFixed(1) + 'M'
                : dp.max_tpm?.toLocaleString()
            }}
            TPM</span
          >
          <span v-if="dp.max_daily_requests" class="smd-dp-limit"
            >{{ dp.max_daily_requests?.toLocaleString() }}/day</span
          >
        </div>
      </div>
    </div>

    <!-- Price / rate-limit comparison -->
    <div v-if="pricedProviders.length >= 3" class="smd-price-section">
      <h3 class="section-title">Rate Limits &amp; Pricing</h3>
      <div class="smd-price-table">
        <div v-for="pp in pricedProviders" :key="pp.slug" class="smd-price-row">
          <div class="smd-price-prov">
            <ProviderIcon :slug="pp.slug" :size="14" cls="smd-dp-icon" />
            <span>{{ pp.name }}</span>
          </div>
          <div class="smd-price-limits">
            <span v-if="pp.max_rpm" class="smd-price-chip">{{ pp.max_rpm }} RPM</span>
            <span v-if="pp.max_tpm" class="smd-price-chip"
              >{{
                pp.max_tpm >= 1000000
                  ? (pp.max_tpm / 1000000).toFixed(1) + 'M'
                  : pp.max_tpm?.toLocaleString()
              }}
              TPM</span
            >
            <span v-if="pp.max_daily_requests" class="smd-price-chip"
              >{{ pp.max_daily_requests?.toLocaleString() }}/day</span
            >
            <span v-if="pp.requires_card" class="smd-price-chip smd-price-warn">Card required</span>
            <span v-if="pp.requires_account_id" class="smd-price-chip smd-price-warn"
              >Account ID</span
            >
            <span
              v-if="!pp.max_rpm && !pp.max_tpm && !pp.max_daily_requests"
              class="smd-price-chip smd-price-none"
              >No rate limit data</span
            >
          </div>
          <!-- Latency sparkline for this provider -->
          <div class="smd-price-latency">
            <HealthSpark :full-id="pp.full_id" :provider-slug="pp.slug" />
          </div>
        </div>
      </div>
    </div>

    <!-- Derivatives section (if this model has derivatives) -->
    <div v-if="derivativeModels.length" class="smd-derivatives">
      <h3 class="section-title">Derivatives ({{ derivativeModels.length }})</h3>
      <div class="smd-models">
        <SuperModelCard
          v-for="dm in derivativeModels"
          :key="dm.slug"
          :model="dm"
          :creator-slug="creatorSlugFor(dm)"
          @click="openDetail(dm)"
          @creator-click="() => {}"
        />
      </div>
    </div>

    <!-- Failover suggestions for broken providers -->
    <div v-if="failoverItems.length > 0" class="smd-failover">
      <h3 class="section-title">Failover Alternatives</h3>
      <p class="smd-failover-note">
        These broken providers have working alternatives for the same model:
      </p>
      <div class="smd-failover-list">
        <div v-for="f in failoverItems" :key="f.broken" class="smd-failover-row">
          <span class="smd-fail-broken">❌ {{ f.brokenProv }}</span>
          <span class="smd-fail-arrow">→</span>
          <span class="smd-fail-working">
            <span v-for="w in f.working.slice(0, 4)" :key="w" class="smd-fail-chip">
              ✓ {{ extractProvider(w) }}
            </span>
            <span v-if="f.working.length > 4" class="smd-fail-chip more"
              >+{{ f.working.length - 4 }} more</span
            >
          </span>
        </div>
      </div>
    </div>

    <!-- Known issues -->
    <div v-if="modelIssues.length" class="smd-issues">
      <h3 class="section-title">Known Issues</h3>
      <div v-for="issue in modelIssues" :key="issue.model_id" class="smd-issue-card">
        <div class="smd-issue-header">
          <span class="smd-issue-severity" :class="issue.severity">{{ issue.severity }}</span>
          <span class="smd-issue-impact">{{ issue.impact }}</span>
        </div>
        <p class="smd-issue-desc">{{ issue.issue }}</p>
        <p v-if="issue.workaround" class="smd-issue-workaround">
          Workaround: {{ issue.workaround }}
        </p>
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
  <div v-else class="smd-not-found">
    <p>Super model not found.</p>
    <router-link to="/supermodels" class="back-link">← Back to super models</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import SuperModelCard from '@/components/SuperModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';
import ProviderIcon from '@/components/ProviderIcon.vue';
import HealthSpark from '@/components/HealthSpark.vue';
import { useModelsStore } from '@/store/models';
import { useWatchList } from '@/composables/useWatchList';
import type { CreatorData, ModelData } from '@/types';

const store = useModelsStore();
const route = useRoute();
const wl = useWatchList();

const modelSlug = computed(() => route.params.slug as string);
const model = computed(() => store.modelBySlug.get(modelSlug.value));

const detailModel = ref<ModelData | null>(null);
const detailCreator = ref<CreatorData | undefined>(undefined);

function openDetail(m: ModelData) {
  detailModel.value = m;
  detailCreator.value = store.creators.find((c) =>
    c.models.some((cm) => cm.super_id === m.super_id),
  );
}

function creatorSlugFor(m: ModelData): string {
  const c = store.creators.find((cr) => cr.models.some((cm) => cm.super_id === m.super_id));
  return c?.id || '';
}

// ── Creator slug for current model ──
const creatorSlug = computed(() => {
  if (!model.value) return '';
  const c = store.creators.find((cr) =>
    cr.models.some((m) => m.super_id === model.value!.super_id),
  );
  return c?.id || '';
});

// ── Active (non-removed) provider datapoints ──
const activeProviders = computed(() => {
  if (!model.value) return [];
  const provs = new Map<string, string>();
  for (const dp of model.value.providers) {
    if (!dp._removed) provs.set(dp.provider_slug, dp.provider);
  }
  return Array.from(provs.entries()).map(([slug, name]) => ({ slug, name }));
});

const activeDatapoints = computed(() => model.value?.providers.filter((dp) => !dp._removed) ?? []);

const isFreeContext = computed(() => activeDatapoints.value.every((dp) => dp.is_free));

const pricedProviders = computed(() => {
  if (!model.value) return [];
  return model.value.providers
    .filter((dp) => !dp._removed)
    .map((dp) => ({
      slug: dp.provider_slug,
      name: dp.provider,
      full_id: dp.full_id,
      max_rpm: dp.max_rpm,
      max_tpm: dp.max_tpm,
      max_daily_requests: dp.max_daily_requests,
      requires_card: dp.requires_card,
      requires_account_id: dp.requires_account_id,
    }));
});

const sortedDatapoints = computed(() => {
  const dps = [...(model.value?.providers ?? [])];
  // Sort: working first, then rate_limited, then broken, then removed last
  const order: Record<string, number> = {
    working: 0,
    rate_limited: 1,
    untested: 2,
    broken: 3,
    not_found: 4,
  };
  dps.sort((a, b) => {
    if (a._removed !== b._removed) return a._removed ? 1 : -1;
    return (order[a.status.result] ?? 5) - (order[b.status.result] ?? 5);
  });
  return dps;
});

// ── Model description (from first provider that has one) ──
const modelDescription = computed(() => {
  if (!model.value) return null;
  for (const dp of model.value.providers) {
    if (dp.description) return dp.description;
  }
  return null;
});

// ── Capability badges ──
const capabilities = computed(() => {
  if (!model.value) return [];
  const caps = [
    { key: 'supports_tools', label: 'tools' },
    { key: 'supports_reasoning', label: 'reasoning' },
    { key: 'supports_attachment', label: 'vision' },
    { key: 'supports_structured_output', label: 'structured JSON' },
    { key: 'open_weights', label: 'open weights' },
  ];
  return caps.map((cap) => {
    const has = model.value!.providers.some((dp) => !dp._removed && (dp as any)[cap.key] === true);
    return { ...cap, has };
  });
});

// ── Input types across all providers ──
const allInputTypes = computed(() => {
  if (!model.value) return [];
  const types = new Set<string>();
  for (const dp of model.value.providers) {
    if (dp._removed) continue;
    for (const t of dp.input_types || []) types.add(t);
  }
  return [...types].sort();
});

// ── Role rankings ──
const rankEntries = computed(() => {
  if (!model.value) return [];
  return Object.entries(model.value.role_rankings).sort((a, b) => a[1] - b[1]);
});

// ── Derivatives ──
const derivativeModels = computed(() => {
  if (!model.value) return [];
  return store.derivedModels.get(model.value.slug) ?? [];
});

// ── Failover suggestions for broken providers ──
const failoverItems = computed(() => {
  if (!model.value) return [];
  const fs = store.failoverSuggestions.forward;
  const items: { broken: string; brokenProv: string; working: string[] }[] = [];
  for (const dp of model.value.providers) {
    if (dp._removed) continue;
    if (dp.status.result !== 'broken' && dp.status.result !== 'not_found') continue;
    const alternatives = fs[dp.full_id];
    if (!alternatives?.length) continue;
    items.push({ broken: dp.full_id, brokenProv: dp.provider, working: alternatives });
  }
  return items;
});

function extractProvider(fullId: string): string {
  const dp = store.datapointById.get(fullId);
  return dp?.dp.provider || fullId.split('/')[0];
}

// ── Known issues for this model ──
const modelIssues = computed(() => {
  if (!model.value) return [];
  const issues = store.knownIssues;
  return issues.filter(
    (i: {
      model_id: string;
      issue: string;
      impact: string;
      workaround: string;
      severity: string;
    }) => {
      const slug = model.value!.slug;
      return i.model_id.includes(slug) || slug.includes(i.model_id.replace(/\//g, '-'));
    },
  );
});

// ── Validation counts ──
const valCounts = computed(() => {
  const counts = { working: 0, broken: 0, rate_limited: 0, untested: 0, not_found: 0 };
  if (!model.value) return counts;
  for (const dp of model.value.providers) {
    if (dp._removed) continue;
    const r = dp.status.result;
    if (r in counts) counts[r as keyof typeof counts]++;
    else counts.untested++;
  }
  return counts;
});

const valFlex = computed(() => {
  const c = valCounts.value;
  const total = c.working + c.broken + c.rate_limited + c.untested + c.not_found || 1;
  return {
    working: c.working / total,
    rate_limited: c.rate_limited / total,
    broken: c.broken / total,
    untested: c.untested / total,
    not_found: c.not_found / total,
  };
});

const validationPct = computed(() => {
  const c = valCounts.value;
  const total = c.working + c.broken + c.rate_limited + c.untested + c.not_found;
  return total ? Math.round((c.working / total) * 100) : 0;
});

// ── Health history entries ──
const healthEntries = computed(() => {
  if (!model.value) return [];
  return model.value.providers
    .filter((dp) => !dp._removed && store.getModelHealth(dp.full_id))
    .map((dp) => ({
      fullId: dp.full_id,
      providerSlug: dp.provider_slug,
      providerName: dp.provider,
    }));
});

// ── Param range ──
function formatParams(b: number): string {
  if (b >= 1000) return (b / 1000).toFixed(1).replace(/\.0$/, '') + 'T';
  if (b >= 1) return b.toFixed(1).replace(/\.0$/, '') + 'B';
  return (b * 1000).toFixed(0) + 'M';
}

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

const paramRange = computed(() => {
  if (!model.value) return '—';
  const sizes = model.value.providers
    .filter((dp) => !dp._removed && dp.param_count_b)
    .map((dp) => dp.param_count_b!)
    .sort((a, b) => a - b);
  if (!sizes.length) return '—';
  const min = formatParams(sizes[0]);
  const max = formatParams(sizes[sizes.length - 1]);
  return min === max ? min : `${min} – ${max}`;
});

// ── Quantization summary ──
const quantizationSummary = computed(() => {
  if (!model.value) return '—';
  const quants = new Set<string>();
  for (const dp of model.value.providers) {
    if (!dp._removed && dp.quantization) quants.add(dp.quantization);
  }
  if (!quants.size) return '—';
  return [...quants].sort().join(', ');
});

// ── Release info ──
const releaseInfo = computed(() => {
  if (!model.value) return '—';
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const dp of model.value.providers) {
    if (dp._removed) continue;
    if (dp.release_date) {
      if (!earliest || dp.release_date < earliest) earliest = dp.release_date;
      if (!latest || dp.release_date > latest) latest = dp.release_date;
    }
  }
  if (!earliest) return '—';
  return earliest.slice(0, 7);
});

// ── Fact chips ──
const modelFacts = computed(() => {
  const chips: { label: string; cls: string }[] = [];
  if (!model.value) return chips;

  // Parameter range
  const sizes = model.value.providers
    .filter((dp) => !dp._removed && dp.param_count_b)
    .map((dp) => dp.param_count_b!)
    .sort((a, b) => a - b);
  if (sizes.length) {
    const min = formatParams(sizes[0]);
    const max = formatParams(sizes[sizes.length - 1]);
    chips.push({
      label: min === max ? `${min} params` : `${min} – ${max} params`,
      cls: 'fact-param',
    });
  }

  // Context range
  const ctxs = model.value.providers
    .filter((dp) => !dp._removed && dp.context_length)
    .map((dp) => dp.context_length!)
    .sort((a, b) => a - b);
  if (ctxs.length) {
    const min = formatContext(ctxs[0]);
    const max = formatContext(ctxs[ctxs.length - 1]);
    chips.push({ label: min === max ? `${min} ctx` : `${min} – ${max} ctx`, cls: 'fact-ctx' });
  }

  // Derivation method
  if (model.value.derivation_method) {
    chips.push({ label: formatDerivMethod(model.value.derivation_method), cls: 'fact-deriv' });
  }

  // Open weights
  const openCount = model.value.providers.filter(
    (dp) => !dp._removed && dp.open_weights === true,
  ).length;
  const totalActive = activeDatapoints.value.length;
  if (openCount === totalActive && totalActive > 0) {
    chips.push({ label: 'Open weights', cls: 'fact-open' });
  } else if (openCount > 0) {
    chips.push({ label: `${openCount}/${totalActive} open`, cls: 'fact-partial' });
  }

  // Knowledge cutoff range
  const cutoffs = new Set<string>();
  for (const dp of model.value.providers) {
    if (!dp._removed && dp.knowledge_cutoff) cutoffs.add(dp.knowledge_cutoff);
  }
  if (cutoffs.size === 1) {
    chips.push({ label: `Knowledge: ${[...cutoffs][0]}`, cls: 'fact-cutoff' });
  } else if (cutoffs.size > 1) {
    const vals = [...cutoffs].sort();
    chips.push({ label: `Knowledge: ${vals[0]} – ${vals[vals.length - 1]}`, cls: 'fact-cutoff' });
  }

  return chips;
});

// ── Formatting helpers ──
function formatDerivMethod(method: string): string {
  const labels: Record<string, string> = {
    finetune: 'Fine-tune',
    merge: 'Merge',
    distillation: 'Distillation',
    dpo: 'DPO',
    continued_pretraining: 'Continued pre-training',
    lora_adapter: 'LoRA',
  };
  return labels[method] || method;
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    hf_card: 'HF card',
    hf_tag: 'HF tag',
    crfm: 'Stanford CRFM',
    fastchat: 'LMSYS FastChat',
    openrouter_desc: 'OpenRouter',
    version_chain: 'version chain',
    creator_match: 'creator match',
    sync_ingest: 'sync ingest',
    name_heuristic: 'name heuristic',
  };
  return labels[source] || source;
}

const HIGH_CONFIDENCE = new Set(['hf_card', 'hf_tag', 'crfm', 'version_chain']);
const LOW_CONFIDENCE = new Set(['name_heuristic']);

const sourceClass = computed(() => {
  const src = model.value?.derivation_source;
  if (!src) return 'smd-source-medium';
  if (HIGH_CONFIDENCE.has(src)) return 'smd-source-high';
  if (LOW_CONFIDENCE.has(src)) return 'smd-source-low';
  return 'smd-source-medium';
});

const FAMILY_NAME_OVERRIDES: Record<string, string> = {
  gpt: 'GPT',
  glm: 'GLM',
};

function formatFamilyName(raw: string): string {
  if (raw === 'Uncategorized') return raw;
  return raw
    .split('-')
    .map((w) => FAMILY_NAME_OVERRIDES[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatRole(role: string): string {
  const labels: Record<string, string> = {
    model: 'Coder',
    build: 'Build',
    general: 'General',
    small_model: 'Small',
    explore: 'Explore',
  };
  return labels[role] || role;
}
</script>

<style scoped>
.smd-header-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.smd-watch-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.95rem;
  padding: 0 3px;
  opacity: 0.5;
  transition: opacity 0.12s;
  line-height: 1;
}
.smd-watch-btn:hover {
  opacity: 1;
}
.smd-watch-btn.watched {
  opacity: 1;
  color: #f59e0b;
}
.smd-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.back-link {
  font-size: 0.78rem;
  color: var(--accent);
  text-decoration: none;
}
.back-link:hover {
  text-decoration: underline;
}
.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 8px 0 4px;
  line-height: 1.3;
  word-break: break-word;
}
.smd-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}
.smd-creator-link,
.smd-base-link,
.smd-family-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}
.smd-creator-link:hover,
.smd-base-link:hover,
.smd-family-link:hover {
  text-decoration: underline;
}
.smd-deriv-method {
  font-size: 0.68rem;
  color: var(--text-dim);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 4px;
}
.smd-deriv-source {
  font-size: 0.6rem;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.smd-source-high {
  color: #059669;
  background: rgba(5, 150, 105, 0.12);
}
.smd-source-medium {
  color: var(--text-dim);
  background: var(--bg-elevated);
}
.smd-source-low {
  color: var(--text-muted);
  background: transparent;
  opacity: 0.7;
}

/* ── Unique-facts chips ── */
.smd-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.smd-fact-chip {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
}
.smd-fact-chip.fact-param {
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
}
.smd-fact-chip.fact-ctx {
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
}
.smd-fact-chip.fact-deriv {
  background: rgba(236, 72, 153, 0.12);
  color: #ec4899;
}
.smd-fact-chip.fact-open {
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
}
.smd-fact-chip.fact-partial {
  background: rgba(251, 191, 36, 0.12);
  color: #eab308;
}
.smd-fact-chip.fact-cutoff {
  background: rgba(168, 85, 247, 0.12);
  color: #a855f7;
}

.smd-description {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 8px 0 0;
  max-width: 800px;
}

/* ── Features row ── */
.smd-features-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 14px 0 0;
}
.smd-provider-icons {
  display: flex;
  align-items: center;
  gap: 4px;
}
.smd-prov-icon {
  border-radius: 4px;
  opacity: 0.8;
  transition: opacity 0.12s;
}
.smd-prov-icon:hover {
  opacity: 1;
}

.smd-caps {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.smd-cap-badge {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--text-dim);
  background: var(--bg-elevated);
  border: 1px solid transparent;
  transition:
    color 0.12s,
    background 0.12s,
    border-color 0.12s;
}
.smd-cap-badge.active {
  color: var(--accent);
  background: var(--accent-subtle);
  border-color: var(--accent);
}

.smd-bestfor-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.smd-bestfor {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-subtle);
  color: var(--accent);
  font-weight: 500;
}

.smd-input-types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.smd-input-type {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--text-dim);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

.smd-rank-highlights {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.smd-rank-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-dim);
}
.smd-rank-tag {
  font-size: 0.62rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
}
.smd-rank-tag.top {
  color: var(--green);
  background: color-mix(in srgb, var(--green) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--green) 30%, transparent);
}
.smd-rank-tag.mid {
  color: var(--text-dim);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

/* ── Meta grid ── */
.smd-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin: 16px 0;
}
.smd-stat {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}
.smd-stat-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.smd-stat-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Validation bar ── */
.smd-validation-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
  gap: 1px;
}
.val-segment {
  min-width: 2px;
  transition: flex 0.3s;
}
.val-segment.working {
  background: var(--green);
}
.val-segment.rate_limited {
  background: var(--orange);
}
.val-segment.broken {
  background: var(--red);
}
.val-segment.untested {
  background: var(--accent);
}
.val-segment.not_found {
  background: var(--text-dim);
}

.smd-val-legend {
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
.val-legend.working {
  color: var(--green);
}
.val-legend.working::before {
  background: var(--green);
}
.val-legend.rate_limited {
  color: var(--orange);
}
.val-legend.rate_limited::before {
  background: var(--orange);
}
.val-legend.broken {
  color: var(--red);
}
.val-legend.broken::before {
  background: var(--red);
}
.val-legend.untested {
  color: var(--accent);
}
.val-legend.untested::before {
  background: var(--accent);
}
.val-legend.not_found {
  color: var(--text-dim);
}
.val-legend.not_found::before {
  background: var(--text-dim);
}

.smd-paid-notice {
  font-size: 0.68rem;
  color: var(--blue, #60a5fa);
  font-weight: 500;
  padding: 6px 10px;
  background: rgba(96, 165, 250, 0.08);
  border-radius: 6px;
  margin-bottom: 12px;
}

/* ── Health History ── */
.health-section {
  margin-top: 4px;
}
.health-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

/* ── Provider table ── */
.section-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 20px 0 12px;
}
.smd-provider-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.smd-dp-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  transition: background 0.12s;
}
.smd-dp-row:hover {
  background: var(--bg-elevated);
}
.smd-dp-row.removed {
  opacity: 0.45;
}

.smd-dp-provider {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 180px;
}
.smd-dp-icon {
  border-radius: 3px;
  flex-shrink: 0;
}
.smd-dp-prov-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text);
}
.smd-dp-status {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: auto;
}
.smd-dp-status.working {
  color: var(--green);
  background: color-mix(in srgb, var(--green) 10%, transparent);
}
.smd-dp-status.rate_limited {
  color: var(--orange);
  background: color-mix(in srgb, var(--orange) 10%, transparent);
}
.smd-dp-status.broken {
  color: var(--red);
  background: color-mix(in srgb, var(--red) 10%, transparent);
}
.smd-dp-status.not_found {
  color: var(--text-dim);
  background: var(--bg-elevated);
}
.smd-dp-status.untested {
  color: var(--accent);
  background: var(--accent-subtle);
}

.smd-dp-details {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
}
.smd-dp-detail {
  font-size: 0.62rem;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
  color: var(--text-dim);
  background: var(--bg-elevated);
}
.smd-dp-detail.q {
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent);
}
.smd-dp-detail.free {
  color: var(--green);
  background: color-mix(in srgb, var(--green) 8%, transparent);
}
.smd-dp-detail.cap {
  color: var(--accent);
  background: var(--accent-subtle);
}
.smd-dp-detail.open {
  color: #34d399;
  background: rgba(52, 211, 153, 0.1);
}
.smd-dp-detail.cutoff {
  color: #a855f7;
  background: rgba(168, 85, 247, 0.08);
}

.smd-dp-limits {
  display: flex;
  gap: 6px;
}
.smd-dp-limit {
  font-size: 0.6rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-dim);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 4px;
}

/* ── Derivatives ── */
.smd-derivatives {
  margin-top: 8px;
}
.smd-models {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Known issues ── */
.smd-issues {
  margin-top: 8px;
}
.smd-issue-card {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  margin-bottom: 8px;
}
.smd-issue-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.smd-issue-severity {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 4px;
}
.smd-issue-severity.critical {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}
.smd-issue-severity.high {
  color: #f97316;
  background: rgba(249, 115, 22, 0.12);
}
.smd-issue-severity.moderate {
  color: #eab308;
  background: rgba(234, 179, 8, 0.12);
}
.smd-issue-severity.low {
  color: var(--text-dim);
  background: var(--bg-elevated);
}
.smd-issue-impact {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text);
}
.smd-issue-desc {
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin: 4px 0;
}
.smd-issue-workaround {
  font-size: 0.68rem;
  color: var(--accent);
  margin: 2px 0 0;
}

.smd-not-found {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}

/* Price comparison */
.smd-price-section {
  margin: 20px 0 12px;
}
.smd-price-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.smd-price-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-elevated);
  flex-wrap: wrap;
}
.smd-price-prov {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text);
  min-width: 100px;
}
.smd-price-limits {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  flex: 1;
}
.smd-price-chip {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.12);
  color: #60a5fa;
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
}
.smd-price-chip.smd-price-warn {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.smd-price-chip.smd-price-none {
  background: var(--bg-hover);
  color: var(--text-muted);
  font-weight: 400;
}
.smd-price-latency {
  flex-shrink: 0;
}

/* Failover suggestions */
.smd-failover {
  margin: 20px 0 12px;
}
.smd-failover-note {
  font-size: 0.68rem;
  color: var(--text-muted);
  margin: 0 0 8px;
}
.smd-failover-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.smd-failover-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-elevated);
  flex-wrap: wrap;
  font-size: 0.72rem;
}
.smd-fail-broken {
  color: var(--red);
  font-weight: 600;
}
.smd-fail-arrow {
  color: var(--text-dim);
}
.smd-fail-working {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.smd-fail-chip {
  padding: 1px 6px;
  font-size: 0.62rem;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.12);
  color: var(--green);
  white-space: nowrap;
}
.smd-fail-chip.more {
  background: var(--bg-hover);
  color: var(--text-muted);
}

/* Model of the Day */
.motd-section {
  margin-bottom: 20px;
}
.motd-card {
  border-left: 3px solid var(--green);
}
.motd-subtitle {
  font-size: 0.68rem;
  color: var(--text-dim);
  margin: 2px 0 8px;
}
.motd-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.motd-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 0;
  text-decoration: none;
  border-radius: 4px;
  transition: background 0.12s;
}
.motd-row:hover {
  background: var(--bg-elevated);
}
.motd-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent);
}
.motd-meta {
  font-size: 0.62rem;
  color: var(--text-dim);
}

/* Cost efficiency badge */
.sm-eff-chip {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}

@media (max-width: 768px) {
  .smd-page {
    padding: 12px;
  }
  .smd-meta-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .smd-dp-row {
    flex-direction: column;
    align-items: flex-start;
  }
  .smd-dp-provider {
    min-width: auto;
    width: 100%;
  }
}
</style>
