<template>
  <div
    class="sm-card"
    :class="`card-${status}`"
    @click="handleClick"
    role="button"
    tabindex="0"
  >
    <!-- Row 1: Model name (primary identity) + ranking badges -->
    <div class="sm-name-row">
      <span class="sm-model-name">
        <button class="watch-btn" :class="{ watched: wl.isWatched(model.super_id) }" @click.stop="wl.toggle(model)" :title="(wl.isWatched(model.super_id) ? 'Remove from' : 'Add to') + ' watch list'">{{ wl.isWatched(model.super_id) ? '★' : '☆' }}</button>
        <span class="sm-model-icon-fb">{{ model.name[0] }}</span>
        <span :class="{ 'sm-deprecated-name': isDeprecated }">{{ model.name }}</span>
        <span v-if="isDeprecated" class="sm-deprecated-tag" title="This model has been deprecated">Deprecated</span>
        <span v-if="isDegraded" class="sm-degraded-warning" title="Stability degraded — was stable, now broken">!</span>
        <button class="copy-btn-badge" title="Copy name" @click.stop="copyText(model.name)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <router-link v-if="model.base_model || model.derivation_method" :to="model.base_model ? `/model/${model.base_model}` : ''" class="sm-finetune-badge" :class="derivationBadgeClass" :title="derivationTitle" @click.stop>
          {{ derivationLabel }}
        </router-link>
      </span>
      <div class="sm-header-right">
        <span v-for="r in topRoles" :key="r.role" class="sm-ranking-badge" :title="r.role + ' rank #' + r.rank">
          #{{ r.rank }} {{ r.label }}
        </span>
      </div>
    </div>

    <!-- Row 2: Creator / Family (lineage) -->
    <div class="sm-meta-row">
      <span
        class="sm-badge sm-badge-creator"
        :class="{ 'is-link': !!model.creator }"
        @click.stop="model.creator ? emit('creator-click', model.creator!) : null"
      >
        <ProviderIcon v-if="creatorSlug" :slug="creatorSlug" :size="18" cls="sm-icon" />
        <span v-else class="sm-icon-fb">{{ (model.creator || '?')[0] }}</span>
        {{ model.creator || '—' }}
        <button v-if="model.creator" class="copy-btn-badge" title="Copy creator" @click.stop="copyText(model.creator!)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </span>
      <span class="sm-badge-sep">/</span>
      <span v-if="model.family" class="sm-badge sm-badge-family">
        <span class="sm-icon-fb">{{ formatFamily(model.family)[0] }}</span>
        {{ formatFamily(model.family) }}
      </span>
    </div>

    <!-- Row 3: Role tags — best_for + context + capabilities + key-derived pills -->
    <div class="sm-tags-row">
      <span v-if="model.best_for.length" class="sm-tags-group">
        <span v-for="tag in model.best_for" :key="tag" class="sm-best-for-chip">{{ tag }}</span>
      </span>
      <span v-if="contextChip" class="sm-ctx-chip">{{ contextChip }}</span>
      <span v-for="tier in uniqueTiers" :key="'tier-'+tier" class="sm-tier-chip">{{ formatTier(tier) }}</span>
      <span v-if="uniqueVariant" class="sm-variant-chip">{{ formatVariant(uniqueVariant) }}</span>
      <span v-if="sizeLabel" class="sm-size-chip">{{ sizeLabel }}</span>
      <span v-if="efficiencyBadge" class="sm-eff-chip" :title="efficiencyBadge.title">{{ efficiencyBadge.label }}</span>
      <span v-if="anyThinking" class="sm-thinking-chip">Thinking</span>
      <span v-if="uniqueStage" class="sm-stage-chip" :class="'stage-'+uniqueStage">{{ formatStage(uniqueStage) }}</span>
      <span v-if="anyCoding" class="sm-coder-chip">Coder</span>
      <span v-if="anyOpenWeights" class="sm-cap-chip sm-cap-open">Open</span>
      <span v-if="anyTools" class="sm-cap-chip sm-cap-tools">Tools</span>
      <span v-if="anyReasoning" class="sm-cap-chip sm-cap-reasoning">Reasoning</span>
    </div>

    <!-- Row 4: Provider stats -->
    <div class="sm-stats">
      <span class="sm-stat">{{ datapointsCount }} provider{{ datapointsCount !== 1 ? 's' : '' }}</span>
      <template v-if="workingCount > 0">
        <span class="sm-stat-divider">|</span>
        <span class="sm-stat sm-stat-working">{{ workingCount }} working</span>
      </template>
      <template v-if="rateLimitedCount > 0">
        <span class="sm-stat-divider">|</span>
        <span class="sm-stat sm-stat-limited">
          {{ workingCount === 0 && brokenCount === 0 ? 'all limited' : rateLimitedCount + ' limited' }}
        </span>
      </template>
      <template v-if="brokenCount > 0">
        <span class="sm-stat-divider">|</span>
        <span class="sm-stat sm-stat-broken">{{ brokenCount }} down</span>
      </template>
      <template v-if="releaseDate">
        <span class="sm-stat-divider">|</span>
        <span class="sm-stat" :title="releaseDate">v{{ formatDateShort(releaseDate) }}</span>
      </template>
    </div>

    <!-- Health sparkline -->
    <div v-if="healthSpark" class="sm-health-spark" :title="healthSpark.stability + '% stable · ' + healthSpark.streak + 'd streak'">
      <svg viewBox="0 0 60 14" class="sm-spark-svg">
        <polyline
          :points="healthSpark.points.map(p => p.x + ',' + p.y).join(' ')"
          fill="none"
          :stroke="healthSpark.stability >= 80 ? 'var(--green)' : healthSpark.stability >= 50 ? 'var(--orange)' : 'var(--red)'"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="sm-spark-label">{{ healthSpark.stability }}% ({{ healthSpark.streak }}d)</span>
    </div>

    <!-- Row 5: Footer — provider tags + source badges -->
    <div class="sm-footer">
      <div class="sm-providers">
        <span v-for="p in providerTags.slice(0, 6)" :key="p.slug" class="provider-tag" :style="{ background: getProviderColorMuted(p.slug), color: getProviderColor(p.slug) }">
          <ProviderIcon :slug="p.slug" :size="14" :cls="'sm-provider-logo'" />
          {{ p.name }}
        </span>
        <span v-if="providerTags.length > 6" class="provider-tag more">+{{ providerTags.length - 6 }}</span>
      </div>
      <span v-if="sourceBadges.length" class="sm-sources">
        <span v-for="b in sourceBadges" :key="b.key" class="sm-source-badge" :class="b.cssClass" :title="b.title">{{ b.label }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ModelData, ProviderDatapoint } from '@/types';
import { useModelsStore } from '@/store/models';
import { useToast } from '@/composables/useToast';
import { useWatchList } from '@/composables/useWatchList';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { getProviderColor, getProviderColorMuted } from '@/data/provider-colors';

const ROLES = ['model', 'build', 'general', 'small_model', 'explore'] as const;
const ROLE_SHORT: Record<string, string> = { model: 'Mod', build: 'Bld', general: 'Gen', small_model: 'Sml', explore: 'Exp' };

const props = defineProps<{
  model: ModelData;
  creatorSlug?: string;
}>();

const emit = defineEmits<{
  click: [];
  'creator-click': [creatorName: string];
}>();

const store = useModelsStore();
const { success: toastSuccess } = useToast();
const wl = useWatchList();

const DERIVATION_META: Record<string, { label: string; cssClass: string }> = {
  finetune: { label: 'FT', cssClass: 'deriv-ft' },
  merge: { label: 'Merge', cssClass: 'deriv-merge' },
  distillation: { label: 'Distill', cssClass: 'deriv-distill' },
  dpo: { label: 'DPO', cssClass: 'deriv-dpo' },
  continued_pretraining: { label: 'CPT', cssClass: 'deriv-cpt' },
  lora_adapter: { label: 'LoRA', cssClass: 'deriv-lora' },
  unknown: { label: 'Derived', cssClass: 'deriv-unknown' },
};

const baseModelName = computed(() => {
  if (!props.model.base_model) return null;
  const parent = store.modelBySlug.get(props.model.base_model);
  return parent ? parent.name : props.model.base_model;
});

const derivationMeta = computed(() => {
  const method = props.model.derivation_method;
  if (method && DERIVATION_META[method]) return DERIVATION_META[method];
  return DERIVATION_META.unknown;
});

const derivationLabel = computed(() => {
  const name = baseModelName.value;
  if (!name) return 'Derived';
  return `Derived from: ${name}`;
});

const derivationBadgeClass = computed(() => derivationMeta.value.cssClass);

const derivationTitle = computed(() => {
  const method = props.model.derivation_method || 'derived';
  const name = baseModelName.value;
  if (!name) return `${method} model`;
  return `${method} of ${name} — click to see base model`;
});

const activeDps = computed(() => props.model.providers.filter((p: ProviderDatapoint) => !p._removed));
const working = computed(() => activeDps.value.filter((d) => d.status.result === 'working'));
const broken = computed(() => activeDps.value.filter((d) => d.status.result === 'broken' || d.status.result === 'not_found'));
const rateLimited = computed(() => activeDps.value.filter((d) => d.status.result === 'rate_limited'));
const datapointsCount = computed(() => activeDps.value.length);
const workingCount = computed(() => working.value.length);
const brokenCount = computed(() => broken.value.length);
const rateLimitedCount = computed(() => rateLimited.value.length);
const anyTools = computed(() => activeDps.value.some((d) => d.supports_tools));
const anyReasoning = computed(() => activeDps.value.some((d) => d.supports_reasoning));
const anyOpenWeights = computed(() => activeDps.value.some((d) => d.open_weights));

// ── Key-derived feature aggregates ──
const uniqueTiers = computed(() => {
  const set = new Set<string>();
  for (const d of activeDps.value) for (const t of (d.model_tier || [])) set.add(t);
  return [...set];
});
const uniqueVariant = computed(() => {
  for (const d of activeDps.value) if (d.model_variant) return d.model_variant;
  return null;
});
const sizeLabel = computed(() => {
  let minB = Infinity; let maxB = 0; let activeB: number | null = null;
  for (const d of activeDps.value) {
    if (d.param_count_b) {
      if (d.param_count_b < minB) minB = d.param_count_b;
      if (d.param_count_b > maxB) maxB = d.param_count_b;
    }
    if (d.active_param_count_b) activeB = d.active_param_count_b;
  }
  if (!isFinite(minB)) return null;
  const range = minB === maxB ? `${maxB}B` : `${minB}B–${maxB}B`;
  return activeB ? `${range} (${activeB}B active)` : range;
});
const efficiencyBadge = computed(() => {
  const eff = store.costEfficiency.get(props.model.super_id);
  if (!eff || eff < 10) return null;
  return { label: `Eff ${eff}`, title: `Cost efficiency: ${eff} (intelligence ÷ provider count). Higher = better quality per provider.` };
});
const anyThinking = computed(() => activeDps.value.some((d) => d.thinking_variant));
const anyCoding = computed(() => activeDps.value.some((d) => d.coding_specialized));
const uniqueStage = computed(() => {
  for (const d of activeDps.value) if (d.release_stage) return d.release_stage;
  return null;
});

const isDegraded = computed(() =>
  activeDps.value.some((d) => store.degradedModels.has(d.full_id)),
);

const isDeprecated = computed(() =>
  activeDps.value.some((d) => store.deprecatedFullIds.has(d.full_id)),
);

// Health sparkline data
const healthSpark = computed(() => {
  const mh = store.modelHealthBySuperId.get(props.model.super_id);
  if (!mh?.snapshots?.length) return null;
  const recent = mh.snapshots.slice(0, 14).reverse(); // last 14 days, chronological
  const points: { x: number; y: number; status: string }[] = [];
  const w = 60;
  for (let i = 0; i < recent.length; i++) {
    points.push({
      x: (i / Math.max(recent.length - 1, 1)) * w,
      y: recent[i].status === 'working' ? 3 : recent[i].status === 'rate_limited' ? 7 : 11,
      status: recent[i].status,
    });
  }
  return { points, stability: mh.stability, streak: mh.streak, count: recent.length };
});

const status = computed(() => {
  const total = activeDps.value.length;
  if (!total) return 'down';
  if (isDeprecated.value) return 'deprecated';
  if (working.value.length === total) return 'working';
  if (working.value.length > 0) return 'mixed';
  if (broken.value.length > 0) return 'broken';
  if (rateLimited.value.length > 0) return 'limited';
  return 'untested';
});

const contextLabel = computed(() => {
  const maxCtx = props.model.best_context;
  const minCtx = props.model.min_context;
  if (!maxCtx && !minCtx) return null;
  if (!minCtx || minCtx === maxCtx) return formatContext(maxCtx!);
  return `${formatContext(minCtx)}–${formatContext(maxCtx!)}`;
});

const contextChip = computed(() => {
  const label = contextLabel.value;
  return label ? `${label} ctx` : null;
});

const providerTags = computed(() => {
  const set = new Map<string, string>();
  for (const p of props.model.providers) set.set(p.provider_slug, p.provider);
  return [...set.entries()].map(([slug, name]) => ({ slug, name }));
});

const releaseDate = computed(() => {
  let earliest: string | null = null;
  for (const dp of activeDps.value) {
    if (dp.release_date && (!earliest || dp.release_date < earliest)) {
      earliest = dp.release_date;
    }
  }
  return earliest;
});

const topRoles = computed(() => {
  const result: { role: string; label: string; rank: number }[] = [];
  for (const role of ROLES) {
    const arr = store.roleRankings[role] ?? [];
    let bestRank = Infinity;
    for (const dp of activeDps.value) {
      const idx = arr.indexOf(dp.full_id);
      if (idx !== -1 && idx + 1 < bestRank) bestRank = idx + 1;
    }
    if (bestRank < Infinity) result.push({ role, label: ROLE_SHORT[role] ?? role, rank: bestRank });
  }
  result.sort((a, b) => a.rank - b.rank);
  return result.slice(0, 3);
});

const sourceBadges = computed(() => {
  const idCounts = new Map<number, number>();
  for (const dp of activeDps.value) {
    for (const id of (dp.source_ids || [])) {
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
  }
  if (idCounts.size === 0) return [];
  const sourceById: Record<number, { slug: string; name: string; source_type: string }> = {};
  for (const s of store.sources) {
    sourceById[s.id] = { slug: s.slug, name: s.name, source_type: s.source_type };
  }
  const ABBR: Record<string, { label: string; cssClass: string }> = {
    'huggingface-hub': { label: 'HF', cssClass: 'src-hf' },
    modelsdev: { label: 'MD', cssClass: 'src-md' },
    mastra: { label: 'MS', cssClass: 'src-ms' },
    'openllm-leaderboard': { label: 'LL', cssClass: 'src-ll' },
    'free-llm-api-resources': { label: 'FR', cssClass: 'src-fr' },
  };
  return [...idCounts.entries()]
    .map(([id, count]) => {
      const s = sourceById[id];
      if (!s) return null;
      const abbr = ABBR[s.slug];
      const base = abbr ?? { label: s.source_type === 'api_provider' ? 'API' : s.name.slice(0, 12), cssClass: 'src-api' };
      const label = count > 1 ? `${base.label}×${count}` : base.label;
      return { key: s.slug, label, title: `${s.name} (${count} provider${count > 1 ? 's' : ''})`, cssClass: base.cssClass };
    })
    .filter(Boolean) as { key: string; label: string; title: string; cssClass: string }[];
});

const creatorSlug = computed(() => {
  return props.creatorSlug || props.model.creator || null;
});

const FAMILY_OVERRIDES: Record<string, string> = { gpt: 'GPT', glm: 'GLM', llm: 'LLM' };

function formatFamily(raw: string): string {
  return raw.split('-').map(w => FAMILY_OVERRIDES[w] ?? (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

function formatContext(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(n);
}

function formatDateShort(date: string): string {
  return date.slice(2);
}

function formatTier(t: string): string {
  return t === 'omni' ? 'Omni' : t.charAt(0).toUpperCase() + t.slice(1);
}

function formatVariant(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function formatStage(s: string): string {
  if (s === 'experimental') return 'Exp';
  if (s === 'preview') return 'Preview';
  if (s === 'dev') return 'Dev';
  if (s === 'beta') return 'Beta';
  if (s === 'alpha') return 'Alpha';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest('.copy-btn-badge')) return;
  emit('click');
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toastSuccess(`"${text}" copied`); } catch { /* noop */ }
}
</script>

<style scoped>
.sm-card {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s, border-left-color 0.3s, box-shadow 0.15s;
}

.sm-card.card-working { border-left-color: var(--green); }
.sm-card.card-mixed { border-left-color: var(--orange); }
.sm-card.card-deprecated { opacity: 0.55; }
.sm-card.card-deprecated .sm-deprecated-name { text-decoration: line-through; text-decoration-color: var(--text-muted); }
.sm-card.card-down { border-left-color: var(--border); }
.sm-card.card-untested { border-left-color: var(--text-muted); }
.sm-card.card-limited { border-left-color: var(--orange); }

.sm-card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
}

/* Row 1: Model name + ranking badges */
.sm-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}

.sm-model-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
}

.sm-model-icon-fb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  font-size: 0.55rem;
  font-weight: 800;
  text-transform: uppercase;
  flex-shrink: 0;
  color: var(--accent);
}

.sm-degraded-warning {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--red);
  color: #fff;
  font-size: 0.6rem;
  font-weight: 800;
  line-height: 1;
  flex-shrink: 0;
  cursor: help;
}

.sm-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.sm-ranking-badge {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.15);
  color: var(--green);
  white-space: nowrap;
}


/* Row 2: Creator / Family */
.sm-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.sm-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px;
  font-size: 0.68rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
}

.sm-badge-creator {
  background: var(--accent-subtle);
  color: var(--accent);
}

.sm-badge-creator.is-link {
  cursor: pointer;
}

.sm-badge-creator.is-link:hover {
  filter: brightness(1.2);
}

.sm-badge-family {
  background: rgba(167, 139, 250, 0.12);
  color: var(--purple);
}

.sm-finetune-badge {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: var(--deriv-ft);
  flex-shrink: 0;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s;
}
.sm-finetune-badge.deriv-ft { background: rgba(99, 102, 241, 0.12); color: var(--deriv-ft); }
.sm-finetune-badge.deriv-merge { background: rgba(168, 85, 247, 0.12); color: var(--deriv-merge); }
.sm-finetune-badge.deriv-distill { background: rgba(236, 72, 153, 0.12); color: var(--deriv-distill); }
.sm-finetune-badge.deriv-dpo { background: rgba(34, 211, 238, 0.12); color: var(--deriv-dpo); }
.sm-finetune-badge.deriv-cpt { background: rgba(250, 204, 21, 0.12); color: var(--deriv-cpt); }
.sm-finetune-badge.deriv-lora { background: rgba(52, 211, 153, 0.12); color: var(--deriv-lora); }
.sm-finetune-badge.deriv-unknown { background: rgba(156, 163, 175, 0.12); color: #9ca3af; }

.sm-badge-sep {
  font-size: 0.6rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* Row 3: best_for chips + context + capability chips */
.sm-tags-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.sm-tags-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
}

.sm-best-for-chip {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 600;
  border-radius: 999px;
  white-space: nowrap;
  background: rgba(96, 165, 250, 0.12);
  color: #60a5fa;
}

.sm-ctx-chip {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 600;
  border-radius: 999px;
  white-space: nowrap;
  background: rgba(167, 139, 250, 0.1);
  color: var(--purple, #a78bfa);
}

.sm-cap-chip {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
}

.sm-cap-open { background: rgba(52, 211, 153, 0.12); color: var(--green); }
.sm-cap-tools { background: rgba(96, 165, 250, 0.12); color: #60a5fa; }
.sm-cap-reasoning { background: rgba(251, 146, 60, 0.12); color: #fb923c; }

/* Key-derived pills */
.sm-tier-chip {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.sm-variant-chip {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
  background: rgba(20, 184, 166, 0.12);
  color: #14b8a6;
}
.sm-size-chip {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 600;
  border-radius: 999px;
  white-space: nowrap;
  background: rgba(167, 139, 250, 0.1);
  color: var(--purple, #a78bfa);
}
.sm-eff-chip {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 600;
  border-radius: 999px;
  white-space: nowrap;
  background: rgba(52, 211, 153, 0.1);
  color: var(--deriv-lora);
}
.sm-thinking-chip {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
  background: rgba(244, 114, 182, 0.12);
  color: #f472b6;
}
.sm-stage-chip {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
}
.sm-stage-chip.stage-preview,
.sm-stage-chip.stage-experimental,
.sm-stage-chip.stage-exp,
.sm-stage-chip.stage-dev,
.sm-stage-chip.stage-beta,
.sm-stage-chip.stage-alpha {
  background: rgba(250, 204, 21, 0.15);
  color: #ca8a04;
}
.sm-stage-chip.stage-stable {
  background: rgba(52, 211, 153, 0.12);
  color: var(--green);
}
.sm-stage-chip.stage-latest {
  background: rgba(96, 165, 250, 0.12);
  color: #60a5fa;
}
.sm-coder-chip {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}

.sm-icon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
}

.sm-icon-fb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 0.48rem;
  font-weight: 800;
  text-transform: uppercase;
  flex-shrink: 0;
}

/* Row 4: Provider stats */
.sm-stats {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-bottom: 3px;
}

.sm-stat-divider {
  color: var(--border);
  font-size: 0.6rem;
}

.sm-stat-working { color: var(--green); font-weight: 600; }
.sm-stat-limited { color: var(--orange); font-weight: 600; }
.sm-stat-broken { color: var(--red); }
.sm-stat-none { color: var(--text-muted); }

/* Row 5: Footer */
.sm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sm-providers {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.provider-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 5px 2px 4px;
  border-radius: 4px;
  font-size: 0.6rem;
  font-weight: 500;
  white-space: nowrap;
}

.sm-provider-logo {
  border-radius: 2px;
}

.provider-tag.more {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.sm-sources {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.sm-source-badge {
  padding: 0 4px;
  font-size: 0.55rem;
  font-weight: 700;
  border-radius: 3px;
  line-height: 1.4;
}

.sm-source-badge.src-api { background: var(--accent-subtle); color: var(--accent); }
.sm-source-badge.src-hf { background: var(--badge-hf-bg); color: var(--badge-hf-text); }
.sm-source-badge.src-md { background: var(--badge-md-bg); color: var(--badge-md-text); }
.sm-source-badge.src-ms { background: var(--badge-ms-bg); color: var(--badge-ms-text); }
.sm-source-badge.src-ll { background: var(--badge-ll-bg); color: var(--badge-ll-text); }
.sm-source-badge.src-fr { background: var(--badge-fr-bg); color: var(--badge-fr-text); }

.copy-btn-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.12s;
}

.sm-model-name:hover .copy-btn-badge,
.sm-badge:hover .copy-btn-badge,
.copy-btn-badge:focus-visible {
  opacity: 1;
}

/* Health sparkline */
.sm-health-spark {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
  opacity: 0.7;
}
.sm-spark-svg { width: 60px; height: 14px; flex-shrink: 0; }
.sm-spark-label { font-size: 0.55rem; color: var(--text-muted); font-weight: 600; white-space: nowrap; }

/* Deprecated tag */
.sm-deprecated-tag {
  padding: 0 4px;
  font-size: 0.55rem;
  font-weight: 700;
  border-radius: 3px;
  background: rgba(239,68,68,0.15);
  color: var(--red);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .sm-card { padding: 8px 10px; }
  .sm-model-name { font-size: 0.78rem; }
  .sm-header-right { display: none; }
}

.watch-btn { background: none; border: none; cursor: pointer; font-size: 0.75rem; padding: 0 3px; opacity: 0.5; transition: opacity 0.12s; line-height: 1; }
.watch-btn:hover { opacity: 1; }
.watch-btn.watched { opacity: 1; color: #f59e0b; }
</style>
