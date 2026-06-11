<template>
  <div v-if="model" class="md-page">
    <!-- Header -->
    <div class="page-header">
      <router-link to="/" class="back-link">← Models</router-link>
      <div class="md-header-row">
        <button class="md-watch-btn" :class="{ watched: wl.isWatched(model.super_id) }" @click="wl.toggle(model)" :title="(wl.isWatched(model.super_id) ? 'Remove from' : 'Add to') + ' watch list'">{{ wl.isWatched(model.super_id) ? '★' : '☆' }}</button>
        <h2>{{ model.name }}</h2>
        <div class="md-header-actions">
          <button class="md-copy-btn" @click="copyAsMarkdown" title="Copy as Markdown">↓ MD</button>
          <button class="md-copy-btn" @click="copyAsJson" title="Copy as JSON">↓ JSON</button>
          <span v-if="copied" class="md-copied-toast">Copied!</span>
        </div>
      </div>
      <p class="md-subtitle">
        <router-link :to="`/creator/${creatorSlug}`" class="md-link">{{ model.creator || 'Unknown' }}</router-link>
        <template v-if="model.base_model">
          · derived from
          <router-link :to="`/supermodel/${model.base_model}`" class="md-link">{{ model.base_model }}</router-link>
          <span v-if="model.derivation_method" class="md-deriv-badge">{{ formatDerivMethod(model.derivation_method) }}</span>
        </template>
        <template v-if="model.family">
          · <router-link :to="`/family/${encodeURIComponent(model.family)}`" class="md-link">{{ formatFamilyName(model.family) }}</router-link>
        </template>
        <template v-if="model.base_model">
          · <router-link :to="`/base-model/${model.base_model}`" class="md-link">base model</router-link>
        </template>
      </p>
      <!-- Facts -->
      <div class="md-facts" v-if="modelFacts.length">
        <span v-for="f in modelFacts" :key="f.label" class="md-fact-chip" :class="f.cls">{{ f.label }}</span>
      </div>
      <p v-if="modelDescription" class="md-description">{{ modelDescription }}</p>
    </div>

    <!-- Features row -->
    <div class="md-features-row">
      <div class="md-provider-icons" v-if="activeProviders.length">
        <ProviderIcon v-for="p in activeProviders" :key="p.slug" :slug="p.slug" :size="18" :alt="p.name" cls="md-prov-icon" />
      </div>
      <div class="md-caps">
        <span v-for="cap in capabilities" :key="cap.key" class="md-cap-badge" :class="{ active: cap.has }" :title="cap.label">{{ cap.label }}</span>
      </div>
      <div class="md-bestfor-tags" v-if="model.best_for?.length">
        <span v-for="tag in model.best_for" :key="tag" class="md-bestfor">{{ tag }}</span>
      </div>
      <div class="md-input-types" v-if="allInputTypes.length">
        <span v-for="t in allInputTypes" :key="t" class="md-input-type">{{ t }}</span>
      </div>
      <div class="md-rank-highlights" v-if="rankEntries.length">
        <span class="md-rank-label">Rankings:</span>
        <span v-for="[role, rank] in rankEntries" :key="role" class="md-rank-tag" :class="rank <= 3 ? 'top' : 'mid'">#{{ rank }} {{ formatRole(role) }}</span>
      </div>
    </div>

    <!-- Meta grid -->
    <div class="md-meta-grid">
      <div class="md-stat">
        <span class="md-stat-value">{{ activeDatapoints.length }}</span>
        <span class="md-stat-label">Providers</span>
      </div>
      <div class="md-stat">
        <span class="md-stat-value">{{ formatContext(model.best_context) }}</span>
        <span class="md-stat-label">Best context</span>
      </div>
      <div class="md-stat">
        <span class="md-stat-value">{{ minContext }}</span>
        <span class="md-stat-label">Min context</span>
      </div>
      <div class="md-stat">
        <span class="md-stat-value">{{ paramRange }}</span>
        <span class="md-stat-label">Param range</span>
      </div>
      <div class="md-stat">
        <span class="md-stat-value">{{ quantSummary }}</span>
        <span class="md-stat-label">Quantization</span>
      </div>
      <div class="md-stat">
        <span class="md-stat-value">{{ validationPct }}%</span>
        <span class="md-stat-label">Validation</span>
      </div>
      <div class="md-stat" v-if="releaseDate">
        <span class="md-stat-value">{{ releaseDate }}</span>
        <span class="md-stat-label">Released</span>
      </div>
      <div class="md-stat" v-if="knowledgeCutoff">
        <span class="md-stat-value">{{ knowledgeCutoff }}</span>
        <span class="md-stat-label">Knowledge cutoff</span>
      </div>
      <div class="md-stat" v-if="derivativeModels.length">
        <span class="md-stat-value">{{ derivativeModels.length }}</span>
        <span class="md-stat-label">Derivatives</span>
      </div>
    </div>

    <!-- Validation bar -->
    <div class="md-validation-bar">
      <div class="val-segment working" :style="{ flex: valFlex.working }" :title="valCounts.working + ' working'"></div>
      <div class="val-segment rate_limited" :style="{ flex: valFlex.rate_limited }" :title="valCounts.rate_limited + ' rate limited'"></div>
      <div class="val-segment broken" :style="{ flex: valFlex.broken }" :title="valCounts.broken + ' broken'"></div>
      <div class="val-segment not_found" :style="{ flex: valFlex.not_found }" :title="valCounts.not_found + ' not found'"></div>
      <div class="val-segment untested" :style="{ flex: valFlex.untested }" :title="valCounts.untested + ' untested'"></div>
    </div>
    <div class="md-val-legend">
      <span v-if="valCounts.working" class="val-legend working">{{ valCounts.working }} working</span>
      <span v-if="valCounts.rate_limited" class="val-legend rate_limited">{{ valCounts.rate_limited }} rate limited</span>
      <span v-if="valCounts.broken" class="val-legend broken">{{ valCounts.broken }} broken</span>
      <span v-if="valCounts.not_found" class="val-legend not_found">{{ valCounts.not_found }} not found</span>
      <span v-if="valCounts.untested" class="val-legend untested">{{ valCounts.untested }} untested</span>
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

    <!-- Role Rankings with scores -->
    <div v-if="rankEntries.length" class="md-rankings-section">
      <h3 class="section-title">Role Rankings</h3>
      <div class="md-rankings-grid">
        <div v-for="[role, rank] in rankEntries" :key="role" class="md-rank-card" :class="rank <= 3 ? 'top-rank' : ''">
          <span class="md-rank-role">{{ formatRole(role) }}</span>
          <span class="md-rank-pos">#{{ rank }}</span>
          <div v-if="roleScores[role]" class="md-rank-score-details">
            <span v-if="roleScores[role].qualityBonus" class="md-score-chip">Quality: {{ roleScores[role].qualityBonus?.toFixed(1) }}</span>
            <span v-if="roleScores[role].freshness !== undefined" class="md-score-chip">Fresh: {{ (roleScores[role].freshness * 100).toFixed(0) }}%</span>
            <span v-if="roleScores[role].score !== undefined" class="md-score-chip score">Score: {{ roleScores[role].score?.toFixed(1) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Provider Datapoints Table -->
    <h3 class="section-title">Provider Instances</h3>
    <div class="md-provider-table">
      <div v-for="dp in sortedDatapoints" :key="dp.full_id" class="md-dp-row" :class="{ removed: dp._removed }">
        <div class="md-dp-provider">
          <ProviderIcon :slug="dp.provider_slug" :size="16" :alt="dp.provider" cls="md-dp-icon" />
          <span class="md-dp-prov-name">{{ dp.provider }}</span>
          <span class="md-dp-status" :class="dp.status.result">{{ dp.status.result }}</span>
        </div>
        <div class="md-dp-details">
          <span v-if="dp.context_length" class="md-dp-detail">{{ formatContext(dp.context_length) }} ctx</span>
          <span v-if="dp.quantization" class="md-dp-detail q">{{ dp.quantization }}</span>
          <span v-if="dp.param_count_b" class="md-dp-detail">{{ formatParams(dp.param_count_b) }}</span>
          <span v-if="dp.is_free" class="md-dp-detail free">Free</span>
          <span v-if="dp.supports_tools" class="md-dp-detail cap">Tools</span>
          <span v-if="dp.supports_reasoning" class="md-dp-detail cap">Reasoning</span>
          <span v-if="dp.supports_attachment" class="md-dp-detail cap">Vision</span>
          <span v-if="dp.supports_structured_output" class="md-dp-detail cap">Structured</span>
          <span v-if="dp.open_weights" class="md-dp-detail open">Open</span>
          <span v-if="dp.knowledge_cutoff" class="md-dp-detail cutoff">{{ dp.knowledge_cutoff }}</span>
          <span v-if="dp.hardware && dp.hardware !== 'unknown'" class="md-dp-detail hw">{{ dp.hardware }}</span>
        </div>
        <div class="md-dp-limits" v-if="dp.max_rpm || dp.max_tpm || dp.max_daily_requests">
          <span v-if="dp.max_rpm" class="md-dp-limit">{{ dp.max_rpm }} RPM</span>
          <span v-if="dp.max_tpm" class="md-dp-limit">{{ formatTpm(dp.max_tpm) }} TPM</span>
          <span v-if="dp.max_daily_requests" class="md-dp-limit">{{ dp.max_daily_requests?.toLocaleString() }}/day</span>
        </div>
        <div class="md-dp-extra" v-if="dp.status.detail">
          <span class="md-dp-detail-text" :title="dp.status.detail">{{ dp.status.detail }}</span>
          <span v-if="dp.failure_category" class="md-dp-failcat">{{ dp.failure_category }}</span>
        </div>
      </div>
    </div>

    <!-- Benchmark scores -->
    <div v-if="benchmarkScores.length" class="md-benchmarks">
      <h3 class="section-title">Benchmarks</h3>
      <div class="md-bench-grid">
        <div v-for="bs in benchmarkScores" :key="bs.source" class="md-bench-card">
          <span class="md-bench-source">{{ bs.source }}</span>
          <span class="md-bench-type">{{ bs.score_type }}</span>
          <span class="md-bench-value">{{ bs.score_value?.toFixed(1) ?? '—' }}</span>
        </div>
      </div>
    </div>

    <!-- Derivatives -->
    <div v-if="derivativeModels.length" class="md-derivatives">
      <h3 class="section-title">Derivatives ({{ derivativeModels.length }})</h3>
      <div class="md-models">
        <SuperModelCard v-for="dm in derivativeModels" :key="dm.slug" :model="dm" :creator-slug="creatorSlugFor(dm)" @click="openPanel(dm)" @creator-click="() => {}" />
      </div>
    </div>

    <!-- Known issues -->
    <div v-if="modelIssues.length" class="md-issues">
      <h3 class="section-title">Known Issues</h3>
      <div v-for="issue in modelIssues" :key="issue.model_id" class="md-issue-card">
        <div class="md-issue-header">
          <span class="md-issue-severity" :class="issue.severity">{{ issue.severity }}</span>
          <span class="md-issue-impact">{{ issue.impact }}</span>
        </div>
        <p class="md-issue-desc">{{ issue.issue }}</p>
        <p v-if="issue.workaround" class="md-issue-workaround">Workaround: {{ issue.workaround }}</p>
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
  <div v-else class="md-not-found">
    <p>Model not found.</p>
    <router-link to="/" class="back-link">← Back to models</router-link>
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
const copied = ref(false);

function openPanel(m: ModelData) {
  detailModel.value = m;
  detailCreator.value = store.creators.find(c => c.models.some(cm => cm.super_id === m.super_id));
}

function creatorSlugFor(m: ModelData): string {
  const c = store.creators.find(cr => cr.models.some(cm => cm.super_id === m.super_id));
  return c?.id || '';
}

const creatorSlug = computed(() => {
  if (!model.value) return '';
  const c = store.creators.find(cr => cr.models.some(m => m.super_id === model.value!.super_id));
  return c?.id || '';
});

// ── Active providers ──
const activeProviders = computed(() => {
  if (!model.value) return [];
  const provs = new Map<string, string>();
  for (const dp of model.value.providers) {
    if (!dp._removed) provs.set(dp.provider_slug, dp.provider);
  }
  return Array.from(provs.entries()).map(([slug, name]) => ({ slug, name }));
});

const activeDatapoints = computed(() => model.value?.providers.filter(dp => !dp._removed) ?? []);

const sortedDatapoints = computed(() => {
  const dps = [...(model.value?.providers ?? [])];
  const order: Record<string, number> = { working: 0, rate_limited: 1, untested: 2, broken: 3, not_found: 4 };
  dps.sort((a, b) => {
    if (a._removed !== b._removed) return a._removed ? 1 : -1;
    return (order[a.status.result] ?? 5) - (order[b.status.result] ?? 5);
  });
  return dps;
});

// ── Description ──
const modelDescription = computed(() => {
  if (!model.value) return null;
  for (const dp of model.value.providers) {
    if (dp.description) return dp.description;
  }
  return null;
});

// ── Capabilities ──
const capabilities = computed(() => {
  if (!model.value) return [];
  const caps = [
    { key: 'supports_tools', label: 'tools' },
    { key: 'supports_reasoning', label: 'reasoning' },
    { key: 'supports_attachment', label: 'vision' },
    { key: 'supports_structured_output', label: 'structured JSON' },
    { key: 'open_weights', label: 'open weights' },
  ];
  return caps.map(cap => {
    const has = model.value!.providers.some(dp => !dp._removed && (dp as any)[cap.key] === true);
    return { ...cap, has };
  });
});

const allInputTypes = computed(() => {
  if (!model.value) return [];
  const types = new Set<string>();
  for (const dp of model.value.providers) {
    if (dp._removed) continue;
    for (const t of dp.input_types || []) types.add(t);
  }
  return [...types].sort();
});

const rankEntries = computed(() => {
  if (!model.value) return [];
  return Object.entries(model.value.role_rankings).sort((a, b) => a[1] - b[1]);
});

// ── Role scores ──
const roleScores = computed(() => {
  if (!model.value) return {} as Record<string, { score?: number; qualityBonus?: number; freshness?: number }>;
  const result: Record<string, { score?: number; qualityBonus?: number; freshness?: number }> = {};
  const scores = store.modelScores;
  if (!scores?.scores) return result;
  const roleScoreData = scores.scores[model.value.slug];
  if (!roleScoreData) return result;
  // Aggregate: for each role, find matching score entries
  for (const [role] of Object.entries(model.value.role_rankings)) {
    const entry = roleScoreData.find(s => s.score_type === role || s.source === role);
    if (entry) {
      result[role] = { score: entry.score_value ?? undefined };
    }
  }
  return result;
});

const benchmarkScores = computed(() => {
  if (!model.value) return [];
  const scores = store.modelScores;
  if (!scores?.scores) return [];
  return scores.scores[model.value.slug]?.filter(s => s.score_value != null) ?? [];
});

const releaseDate = computed(() => {
  if (!model.value) return null;
  for (const dp of model.value.providers) {
    if (dp.release_date) return dp.release_date.slice(0, 10);
  }
  return null;
});

const knowledgeCutoff = computed(() => {
  if (!model.value) return null;
  for (const dp of model.value.providers) {
    if (dp.knowledge_cutoff) return dp.knowledge_cutoff;
  }
  return null;
});

const derivativeModels = computed(() => {
  if (!model.value) return [];
  return store.derivedModels.get(model.value.slug) ?? [];
});

const modelIssues = computed(() => {
  if (!model.value) return [];
  return store.knownIssues.filter((i: { model_id: string; issue: string; impact: string; workaround: string; severity: string }) => {
    const slug = model.value!.slug;
    return i.model_id.includes(slug) || slug.includes(i.model_id.replace(/\//g, '-'));
  });
});

// ── Validation ──
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
    .filter(dp => !dp._removed && store.getModelHealth(dp.full_id))
    .map(dp => ({ fullId: dp.full_id, providerSlug: dp.provider_slug, providerName: dp.provider }));
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
function formatTpm(tpm: number | null): string {
  if (!tpm) return '—';
  return tpm >= 1000000 ? `${(tpm / 1000000).toFixed(1)}M` : tpm.toLocaleString();
}

const minContext = computed(() => {
  if (!model.value) return '—';
  const ctxs = model.value.providers.filter(dp => !dp._removed && dp.context_length).map(dp => dp.context_length!);
  if (!ctxs.length) return '—';
  return formatContext(Math.min(...ctxs));
});

const paramRange = computed(() => {
  if (!model.value) return '—';
  const sizes = model.value.providers.filter(dp => !dp._removed && dp.param_count_b).map(dp => dp.param_count_b!).sort((a, b) => a - b);
  if (!sizes.length) return '—';
  const min = formatParams(sizes[0]);
  const max = formatParams(sizes[sizes.length - 1]);
  return min === max ? min : `${min} – ${max}`;
});

const quantSummary = computed(() => {
  if (!model.value) return '—';
  const quants = new Set<string>();
  for (const dp of model.value.providers) {
    if (!dp._removed && dp.quantization) quants.add(dp.quantization);
  }
  return quants.size ? [...quants].sort().join(', ') : '—';
});

// ── Facts chips ──
const modelFacts = computed(() => {
  const chips: { label: string; cls: string }[] = [];
  if (!model.value) return chips;
  const dp = model.value.providers.find(p => !p._removed);
  if (dp?.param_count_b) chips.push({ label: formatParams(dp.param_count_b) + ' params', cls: 'fact-param' });
  if (model.value.best_context) chips.push({ label: formatContext(model.value.best_context) + ' ctx', cls: 'fact-ctx' });
  if (model.value.derivation_method) chips.push({ label: formatDerivMethod(model.value.derivation_method), cls: 'fact-deriv' });
  const openCount = activeDatapoints.value.filter(p => p.open_weights === true).length;
  if (openCount === activeDatapoints.value.length && openCount > 0) chips.push({ label: 'Open weights', cls: 'fact-open' });
  else if (openCount > 0) chips.push({ label: `${openCount}/${activeDatapoints.value.length} open`, cls: 'fact-partial' });
  if (dp?.knowledge_cutoff) chips.push({ label: 'Knowledge: ' + dp.knowledge_cutoff, cls: 'fact-cutoff' });
  if (dp?.thinking_variant) chips.push({ label: 'Thinking', cls: 'fact-thinking' });
  return chips;
});

// ── Copy helpers ──
function flashCopied() { copied.value = true; setTimeout(() => copied.value = false, 1500); }

function copyAsMarkdown() {
  if (!model.value) return;
  const m = model.value;
  const dps = sortedDatapoints.value;
  let md = `## ${m.name}\n\n`;
  if (m.creator) md += `**Creator:** ${m.creator}  \n`;
  if (m.family) md += `**Family:** ${m.family}  \n`;
  if (m.base_model) md += `**Base model:** ${m.base_model}  \n`;
  if (m.derivation_method) md += `**Derivation:** ${m.derivation_method}  \n`;
  md += `**Context:** ${formatContext(m.best_context)}  \n`;
  md += `**Providers:** ${dps.length} (${dps.filter(d => d.status.result === 'working').length} working)  \n\n`;
  md += `| Provider | Status | Context | Params | Quant | Free |\n`;
  md += `|----------|--------|---------|--------|-------|------|\n`;
  for (const d of dps.slice(0, 10)) {
    md += `| ${d.provider} | ${d.status.result} | ${formatContext(d.context_length)} | ${d.param_count_b ? formatParams(d.param_count_b) : '—'} | ${d.quantization || '—'} | ${d.is_free ? '✓' : ''} |\n`;
  }
  navigator.clipboard.writeText(md);
  flashCopied();
}

function copyAsJson() {
  if (!model.value) return;
  navigator.clipboard.writeText(JSON.stringify(model.value, null, 2));
  flashCopied();
}

// ── Formatting ──
function formatDerivMethod(method: string): string {
  const labels: Record<string, string> = { finetune: 'Fine-tune', merge: 'Merge', distillation: 'Distillation', dpo: 'DPO', continued_pretraining: 'CPT', lora_adapter: 'LoRA' };
  return labels[method] || method;
}
const FAMILY_OVERRIDES: Record<string, string> = { gpt: 'GPT', glm: 'GLM' };
function formatFamilyName(r: string): string {
  if (r === 'Uncategorized') return r;
  return r.split('-').map(w => FAMILY_OVERRIDES[w] ?? (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}
function formatRole(role: string): string {
  const labels: Record<string, string> = { model: 'Coder', build: 'Build', general: 'General', small_model: 'Small', explore: 'Explore' };
  return labels[role] || role;
}
</script>

<style scoped>
.md-page { max-width: 1200px; margin: 0 auto; padding: 20px; }
.back-link { font-size: 0.78rem; color: var(--accent); text-decoration: none; }
.back-link:hover { text-decoration: underline; }
.md-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.md-header-row h2 { font-size: 1.3rem; font-weight: 700; margin: 8px 0 4px; line-height: 1.3; word-break: break-word; }
.md-header-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.md-copy-btn {
  font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border);
  background: var(--bg-elevated); color: var(--text-dim); cursor: pointer; font-family: inherit;
  transition: all 0.12s;
}
.md-copy-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-subtle); }
.md-copied-toast { font-size: 0.65rem; font-weight: 600; color: var(--green); }
.md-subtitle { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.md-link { color: var(--accent); text-decoration: none; font-weight: 500; }
.md-link:hover { text-decoration: underline; }
.md-deriv-badge { font-size: 0.65rem; color: var(--text-dim); background: var(--bg-elevated); padding: 1px 6px; border-radius: 4px; margin-left: 4px; }

/* Facts */
.md-facts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.md-fact-chip { font-size: 0.65rem; font-weight: 600; padding: 2px 10px; border-radius: 999px; }
.md-fact-chip.fact-param { background: rgba(99,102,241,0.12); color: #818cf8; }
.md-fact-chip.fact-ctx { background: rgba(52,211,153,0.12); color: #34d399; }
.md-fact-chip.fact-deriv { background: rgba(236,72,153,0.12); color: #ec4899; }
.md-fact-chip.fact-open { background: rgba(52,211,153,0.12); color: #34d399; }
.md-fact-chip.fact-partial { background: rgba(251,191,36,0.12); color: #eab308; }
.md-fact-chip.fact-cutoff { background: rgba(168,85,247,0.12); color: #a855f7; }
.md-fact-chip.fact-thinking { background: rgba(245,158,11,0.12); color: #f59e0b; }
.md-description { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; margin: 8px 0 0; max-width: 800px; }

/* Features row */
.md-features-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 14px 0 0; }
.md-provider-icons { display: flex; align-items: center; gap: 4px; }
.md-prov-icon { border-radius: 4px; opacity: 0.8; }
.md-caps { display: flex; flex-wrap: wrap; gap: 5px; }
.md-cap-badge { font-size: 0.62rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 7px; border-radius: 4px; color: var(--text-dim); background: var(--bg-elevated); border: 1px solid transparent; }
.md-cap-badge.active { color: var(--accent); background: var(--accent-subtle); border-color: var(--accent); }
.md-bestfor-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.md-bestfor { font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; background: var(--accent-subtle); color: var(--accent); font-weight: 500; }
.md-input-types { display: flex; flex-wrap: wrap; gap: 4px; }
.md-input-type { font-size: 0.62rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 7px; border-radius: 4px; color: var(--text-dim); background: var(--bg-elevated); border: 1px solid var(--border); }
.md-rank-highlights { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.md-rank-label { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim); }
.md-rank-tag { font-size: 0.62rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; }
.md-rank-tag.top { color: var(--green); background: color-mix(in srgb, var(--green) 12%, transparent); border: 1px solid color-mix(in srgb, var(--green) 30%, transparent); }
.md-rank-tag.mid { color: var(--text-dim); background: var(--bg-elevated); border: 1px solid var(--border); }

/* Meta grid */
.md-meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; }
.md-stat { display: flex; flex-direction: column; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); }
.md-stat-value { font-size: 1.05rem; font-weight: 700; color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-stat-label { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }

/* Validation bar */
.md-validation-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 4px; gap: 1px; }
.val-segment { min-width: 2px; transition: flex 0.3s; }
.val-segment.working { background: var(--green); }
.val-segment.rate_limited { background: var(--orange); }
.val-segment.broken { background: var(--red); }
.val-segment.untested { background: var(--accent); }
.val-segment.not_found { background: var(--text-dim); }
.md-val-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; padding-top: 6px; }
.val-legend { font-size: 0.62rem; font-weight: 600; display: flex; align-items: center; gap: 4px; }
.val-legend::before { content: ''; width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.val-legend.working { color: var(--green); }
.val-legend.working::before { background: var(--green); }
.val-legend.rate_limited { color: var(--orange); }
.val-legend.rate_limited::before { background: var(--orange); }
.val-legend.broken { color: var(--red); }
.val-legend.broken::before { background: var(--red); }
.val-legend.untested { color: var(--accent); }
.val-legend.untested::before { background: var(--accent); }
.val-legend.not_found { color: var(--text-dim); }
.val-legend.not_found::before { background: var(--text-dim); }

/* Health */
.health-section { margin-top: 4px; }
.health-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }

/* Rankings */
.md-rankings-section { margin-top: 4px; }
.md-rankings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
.md-rank-card { padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.md-rank-card.top-rank { border-color: color-mix(in srgb, var(--green) 30%, transparent); }
.md-rank-role { font-size: 0.78rem; font-weight: 700; color: var(--text); }
.md-rank-pos { font-size: 0.72rem; font-weight: 700; color: var(--accent); margin-left: auto; }
.md-rank-score-details { display: flex; flex-wrap: wrap; gap: 4px; width: 100%; margin-top: 2px; }
.md-score-chip { font-size: 0.58rem; padding: 1px 6px; border-radius: 4px; color: var(--text-dim); background: var(--bg-elevated); }
.md-score-chip.score { color: var(--accent); font-weight: 600; }

/* Provider table */
.section-title { font-size: 1rem; font-weight: 700; margin: 20px 0 12px; }
.md-provider-table { display: flex; flex-direction: column; gap: 6px; }
.md-dp-row { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 12px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); }
.md-dp-row.removed { opacity: 0.45; }
.md-dp-provider { display: flex; align-items: center; gap: 6px; min-width: 180px; }
.md-dp-icon { border-radius: 3px; flex-shrink: 0; }
.md-dp-prov-name { font-size: 0.78rem; font-weight: 600; }
.md-dp-status { font-size: 0.58rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 4px; margin-left: auto; }
.md-dp-status.working { color: var(--green); background: color-mix(in srgb, var(--green) 10%, transparent); }
.md-dp-status.rate_limited { color: var(--orange); background: color-mix(in srgb, var(--orange) 10%, transparent); }
.md-dp-status.broken { color: var(--red); background: color-mix(in srgb, var(--red) 10%, transparent); }
.md-dp-status.not_found { color: var(--text-dim); background: var(--bg-elevated); }
.md-dp-status.untested { color: var(--accent); background: var(--accent-subtle); }
.md-dp-details { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
.md-dp-detail { font-size: 0.62rem; font-weight: 600; padding: 1px 7px; border-radius: 4px; color: var(--text-dim); background: var(--bg-elevated); }
.md-dp-detail.q { font-family: 'JetBrains Mono', monospace; color: var(--accent); }
.md-dp-detail.free { color: var(--green); background: color-mix(in srgb, var(--green) 8%, transparent); }
.md-dp-detail.cap { color: var(--accent); background: var(--accent-subtle); }
.md-dp-detail.open { color: #34d399; background: rgba(52,211,153,0.1); }
.md-dp-detail.cutoff { color: #a855f7; background: rgba(168,85,247,0.08); }
.md-dp-detail.hw { color: #f59e0b; background: rgba(245,158,11,0.08); }
.md-dp-limits { display: flex; gap: 6px; }
.md-dp-limit { font-size: 0.6rem; font-family: 'JetBrains Mono', monospace; color: var(--text-dim); background: var(--bg-elevated); padding: 1px 6px; border-radius: 4px; }
.md-dp-extra { width: 100%; display: flex; gap: 8px; align-items: center; }
.md-dp-detail-text { font-size: 0.65rem; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 400px; }
.md-dp-failcat { font-size: 0.58rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; color: #f87171; background: rgba(239,68,68,0.08); }

/* Benchmarks */
.md-bench-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.md-bench-card { padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); display: flex; flex-direction: column; gap: 2px; }
.md-bench-source { font-size: 0.62rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.md-bench-type { font-size: 0.7rem; color: var(--text); font-weight: 600; }
.md-bench-value { font-size: 1rem; font-weight: 700; color: var(--accent); font-family: 'JetBrains Mono', monospace; }

/* Derivatives / Issues */
.md-models { display: flex; flex-direction: column; gap: 8px; }
.md-issue-card { padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); margin-bottom: 8px; }
.md-issue-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.md-issue-severity { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 4px; }
.md-issue-severity.critical { color: #ef4444; background: rgba(239,68,68,0.12); }
.md-issue-severity.high { color: #f97316; background: rgba(249,115,22,0.12); }
.md-issue-severity.moderate { color: #eab308; background: rgba(234,179,8,0.12); }
.md-issue-severity.low { color: var(--text-dim); background: var(--bg-elevated); }
.md-issue-impact { font-size: 0.72rem; font-weight: 600; }
.md-issue-desc { font-size: 0.72rem; color: var(--text-secondary); margin: 4px 0; }
.md-issue-workaround { font-size: 0.68rem; color: var(--accent); margin: 2px 0 0; }
.md-not-found { padding: 40px 20px; text-align: center; color: var(--text-muted); }
.md-watch-btn { background: none; border: none; cursor: pointer; font-size: 0.95rem; padding: 0 6px 0 0; opacity: 0.5; transition: opacity 0.12s; line-height: 1; }
.md-watch-btn:hover { opacity: 1; }
.md-watch-btn.watched { opacity: 1; color: #f59e0b; }

@media (max-width: 768px) {
  .md-page { padding: 12px; }
  .md-meta-grid { grid-template-columns: repeat(2, 1fr); }
  .md-dp-row { flex-direction: column; }
  .md-dp-provider { min-width: auto; width: 100%; }
}
</style>
