<template>
  <div class="rankings-page">
    <div class="page-header">
      <h2>{{ title }}</h2>
      <p v-if="subtitle">{{ subtitle }}</p>
      <div v-if="allVariantKeys.length > 1" class="master-toggle">
        <span class="toggle-label">All roles</span>
        <div class="variant-dots">
          <div
            v-for="v in masterOptions"
            :key="v"
            class="vd-option"
            :class="{ active: masterVariant === v }"
            @click="onMasterDotClick(v)"
          >
            <span class="vd-dot"></span>
            <span class="vd-label">{{ compactVariantLabels[v] ?? v }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="roles.length === 0" class="rankings-empty">
      <p>No ranking data available yet. Run the ranking pipeline to populate data.</p>
    </div>

    <template v-else>
      <div class="rankings-grid">
      <div v-for="role in roles" :key="role.key" class="role-section" :style="{ borderColor: roleColors[role.key]?.border ?? 'var(--border)' }">
      <div class="role-header" :style="{ background: roleColors[role.key]?.soft ?? 'transparent' }">
        <div class="role-header-left">
          <span class="role-dot" :style="{ background: roleColors[role.key]?.accent }"></span>
          <h3 class="role-title">{{ role.label }}</h3>
          <span class="role-badge" :style="{ background: roleColors[role.key]?.soft, color: roleColors[role.key]?.accent }" :title="`${role.models.length} models`">{{ role.models.length }}</span>
        </div>
        <div
          v-if="roleVariantOpts(role.key).length > 1"
          class="role-variant-dots"
          :title="`Scoring: ${compactVariantLabels[roleVariants[role.key] ?? '_benchmarks'] ?? roleVariants[role.key]}`"
        >
          <div
            v-for="v in roleVariantOpts(role.key)"
            :key="v"
            class="rvd-option"
            :class="{ active: (roleVariants[role.key] ?? '_benchmarks') === v }"
            :title="compactVariantLabels[v] ?? v"
            @click="onRoleVariantChange(role.key, v)"
          >
            <span class="rvd-dot"></span>
            <span class="rvd-label">{{ compactVariantLabels[v] ?? v }}</span>
          </div>
        </div>
      </div>

      <div class="role-body">
        <div class="role-desc" v-if="role.meta">
          <div class="role-desc-source" v-if="roleVariantLabel(role.key)">
            {{ roleVariantLabel(role.key) }}
          </div>
          <p class="role-desc-text">{{ role.meta.description }}</p>
          <div class="role-desc-factors">
            <span class="role-desc-factor" v-if="role.meta.ctxWeight > 0">
              <span class="factor-icon">&#9702;</span> Context weight: {{ (role.meta.ctxWeight * 100).toFixed(0) }}%
            </span>
            <span class="role-desc-factor" v-if="role.meta.needsTools">
              <span class="factor-icon">&#9702;</span> Requires tool calling
            </span>
            <span class="role-desc-factor" v-if="role.meta.tagKeywords?.length">
              <span class="factor-icon positive">+</span> Boosts: {{ role.meta.tagKeywords.slice(0, 4).join(', ') }}
            </span>
            <span class="role-desc-factor" v-if="role.meta.tagPenaltyKeywords?.length">
              <span class="factor-icon negative">&#8722;</span> Penalizes: {{ role.meta.tagPenaltyKeywords.slice(0, 4).join(', ') }}
            </span>
            <span class="role-desc-factor" v-if="role.meta.nameSizePenalty">
              <span class="factor-icon negative">&#8722;</span> Name length penalty applied
            </span>
            <span class="role-desc-factor" v-if="role.meta.maxCtx">
              <span class="factor-icon">&#9702;</span> Context cap: {{ (role.meta.maxCtx / 1000).toFixed(0) }}K tokens
            </span>
          </div>
        </div>
        <div
          v-for="(modelEntry, idx) in role.models"
          :key="modelEntry.id"
          class="ranking-row"
        >
          <div class="rr-main" :class="{ 'rr-podium': idx < 3 }" :style="idx < 3 ? { background: medalBg(idx), borderLeftColor: medalBorder(idx) } : {}" @click="toggleModel(role.key, modelEntry.id)">
            <div class="rr-rank" :class="{ 'rr-medal': idx < 3 }">{{ idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '#' + (idx + 1) }}</div>
            <div class="rr-info">
              <div class="rr-name-row">
                <ProviderIcon :slug="modelEntry.providerSlug" :size="14" cls="rr-provider-icon" />
                <span class="rr-name">{{ modelEntry.displayName }}</span>
                <span class="rr-creator">{{ modelEntry.creatorName }}</span>
              </div>
              <div class="rr-key-row">
                <span class="rr-key">{{ modelEntry.id }}</span>
                <span class="rr-provider-tag">{{ modelEntry.providerName }}</span>
              </div>
              <div class="rr-bar-track">
                <div
                  class="rr-bar-fill"
                  :style="{ width: `${Math.max(2, modelEntry.scorePct)}%`, background: roleColors[role.key]?.accent }"
                ></div>
              </div>
            </div>
            <div class="rr-score stat-number">{{ modelEntry.score ? modelEntry.scorePct + '%' : '—' }}</div>
            <svg
              class="rr-chevron"
              :class="{ open: expandedModels.has(`${role.key}/${modelEntry.id}`) }"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          <!-- Score breakdown -->
          <div v-if="expandedModels.has(`${role.key}/${modelEntry.id}`)" class="rr-breakdown">
            <!-- Non-Combined variants: show benchmark scores -->
            <template v-if="isNonCombinedVariant()">
              <div class="rrb-section" v-if="modelEntry.scoreDetail && (modelEntry.scoreDetail.qualityBonus ?? 0) > 0">
                <div class="rrb-label">Quality Score Components</div>
                <div class="rrb-bars">
                  <div class="rrb-row" v-if="(modelEntry.scoreDetail.qualityIntel ?? 0) > 0">
                    <span class="rrb-tag">Intelligence</span>
                    <div class="rrb-track">
                      <div class="rrb-fill quality" :style="{ width: `${Math.max(1, ((modelEntry.scoreDetail.qualityIntel ?? 0) / Math.max(modelEntry.scoreDetail.qualityBonus ?? 1, 0.01)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val">{{ (modelEntry.scoreDetail.qualityIntel ?? 0).toFixed(2) }}</span>
                  </div>
                  <div class="rrb-row" v-if="(modelEntry.scoreDetail.qualityCoding ?? 0) > 0">
                    <span class="rrb-tag">Coding</span>
                    <div class="rrb-track">
                      <div class="rrb-fill quality" :style="{ width: `${Math.max(1, ((modelEntry.scoreDetail.qualityCoding ?? 0) / Math.max(modelEntry.scoreDetail.qualityBonus ?? 1, 0.01)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val">{{ (modelEntry.scoreDetail.qualityCoding ?? 0).toFixed(2) }}</span>
                  </div>
                  <div class="rrb-row" v-if="(modelEntry.scoreDetail.qualitySpeed ?? 0) > 0">
                    <span class="rrb-tag">Speed</span>
                    <div class="rrb-track">
                      <div class="rrb-fill quality" :style="{ width: `${Math.max(1, ((modelEntry.scoreDetail.qualitySpeed ?? 0) / Math.max(modelEntry.scoreDetail.qualityBonus ?? 1, 0.01)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val">{{ (modelEntry.scoreDetail.qualitySpeed ?? 0).toFixed(2) }}</span>
                  </div>
                  <div class="rrb-row" v-if="(modelEntry.scoreDetail.qualityLatency ?? 0) > 0">
                    <span class="rrb-tag">Latency</span>
                    <div class="rrb-track">
                      <div class="rrb-fill quality penalty" :style="{ width: `${Math.max(1, ((modelEntry.scoreDetail.qualityLatency ?? 0) / Math.max(modelEntry.scoreDetail.qualityBonus ?? 1, 0.01)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val penalty-val">-{{ (modelEntry.scoreDetail.qualityLatency ?? 0).toFixed(2) }}</span>
                  </div>
                </div>
              </div>
              <div class="rrb-section">
                <div class="rrb-label">Benchmark Scores</div>
                <div v-if="benchmarkScoresForModel(modelEntry.id).length === 0" class="rrb-empty">
                  No benchmark scores available for this model.
                </div>
                <div v-else class="benchmark-grid">
                  <div
                    v-for="score in benchmarkScoresForModel(modelEntry.id)"
                    :key="score.score_type"
                    class="benchmark-row"
                  >
                    <span class="benchmark-label">{{ scoreTypeLabels[score.score_type] ?? score.score_type }}</span>
                    <span class="benchmark-source-tag">{{ score.source === 'artificial_analysis' ? 'AA' : 'MD' }}</span>
                    <span class="benchmark-value" :class="{ 'lower-better': scoreTypesLowerBetter.has(score.score_type) }">
                      {{ score.score_value != null ? score.score_value.toLocaleString() : '—' }}
                    </span>
                  </div>
                </div>
              </div>
            </template>

            <!-- Combined variant: show homebrewed methodology -->
            <template v-else>
              <div class="rrb-section">
                <div class="rrb-label">Score Components</div>
                <div class="rrb-bars">
                  <div class="rrb-row" v-if="modelEntry.scoreDetail">
                    <span class="rrb-tag">Total Score</span>
                    <div class="rrb-track">
                      <div class="rrb-fill total" :style="{ width: `${modelEntry.scorePct}%` }"></div>
                    </div>
                    <span class="rrb-val">{{ modelEntry.score?.toFixed(1) }}</span>
                  </div>
                  <div class="rrb-row" v-if="modelEntry.scoreDetail">
                    <span class="rrb-tag">Context</span>
                    <div class="rrb-track">
                      <div class="rrb-fill ctx" :style="{ width: `${Math.max(1, (modelEntry.scoreDetail.ctxContrib / (modelEntry.score || 1)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val">{{ modelEntry.scoreDetail.ctxContrib?.toFixed(1) ?? '0' }}</span>
                  </div>
                  <div class="rrb-row" v-if="modelEntry.scoreDetail">
                    <span class="rrb-tag">Tag Bonus</span>
                    <div class="rrb-track">
                      <div class="rrb-fill bonus" :style="{ width: `${Math.max(1, (modelEntry.scoreDetail.tagBonus / (modelEntry.score || 1)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val">+{{ modelEntry.scoreDetail.tagBonus?.toFixed(1) ?? '0' }}</span>
                  </div>
                  <div class="rrb-row" v-if="modelEntry.scoreDetail && (modelEntry.scoreDetail.qualityBonus ?? 0) > 0">
                    <span class="rrb-tag">Quality</span>
                    <div class="rrb-track">
                      <div class="rrb-fill quality" :style="{ width: `${Math.max(1, ((modelEntry.scoreDetail.qualityBonus ?? 0) / (modelEntry.score || 1)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val">+{{ (modelEntry.scoreDetail.qualityBonus ?? 0).toFixed(1) }}</span>
                  </div>
                  <div class="rrb-row" v-if="modelEntry.scoreDetail && (modelEntry.scoreDetail.qualityIntel ?? 0) > 0">
                    <span class="rrb-tag qsub">Intelligence</span>
                    <div class="rrb-track">
                      <div class="rrb-fill quality-sub" :style="{ width: `${Math.max(1, ((modelEntry.scoreDetail.qualityIntel ?? 0) / (modelEntry.score || 1)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val qsub-val">{{ (modelEntry.scoreDetail.qualityIntel ?? 0).toFixed(2) }}</span>
                  </div>
                  <div class="rrb-row" v-if="modelEntry.scoreDetail && (modelEntry.scoreDetail.qualityCoding ?? 0) > 0">
                    <span class="rrb-tag qsub">Coding</span>
                    <div class="rrb-track">
                      <div class="rrb-fill quality-sub" :style="{ width: `${Math.max(1, ((modelEntry.scoreDetail.qualityCoding ?? 0) / (modelEntry.score || 1)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val qsub-val">{{ (modelEntry.scoreDetail.qualityCoding ?? 0).toFixed(2) }}</span>
                  </div>
                  <div class="rrb-row" v-if="modelEntry.scoreDetail && (modelEntry.scoreDetail.qualitySpeed ?? 0) > 0">
                    <span class="rrb-tag qsub">Speed</span>
                    <div class="rrb-track">
                      <div class="rrb-fill quality-sub" :style="{ width: `${Math.max(1, ((modelEntry.scoreDetail.qualitySpeed ?? 0) / (modelEntry.score || 1)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val qsub-val">{{ (modelEntry.scoreDetail.qualitySpeed ?? 0).toFixed(2) }}</span>
                  </div>
                  <div class="rrb-row" v-if="modelEntry.scoreDetail && (modelEntry.scoreDetail.qualityLatency ?? 0) > 0">
                    <span class="rrb-tag qsub">Latency</span>
                    <div class="rrb-track">
                      <div class="rrb-fill quality-sub penalty" :style="{ width: `${Math.max(1, ((modelEntry.scoreDetail.qualityLatency ?? 0) / (modelEntry.score || 1)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val qsub-val penalty">-{{ (modelEntry.scoreDetail.qualityLatency ?? 0).toFixed(2) }}</span>
                  </div>
                  <div class="rrb-row" v-if="modelEntry.scoreDetail && modelEntry.scoreDetail.tagPenalty > 0">
                    <span class="rrb-tag">Tag Penalty</span>
                    <div class="rrb-track">
                      <div class="rrb-fill penalty" :style="{ width: `${Math.max(1, (modelEntry.scoreDetail.tagPenalty / (modelEntry.score || 1)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val penalty-val">-{{ modelEntry.scoreDetail.tagPenalty?.toFixed(1) }}</span>
                  </div>
                  <div class="rrb-row" v-if="modelEntry.scoreDetail && modelEntry.scoreDetail.nameSizePenalty > 0">
                    <span class="rrb-tag">Name Penalty</span>
                    <div class="rrb-track">
                      <div class="rrb-fill penalty" :style="{ width: `${Math.max(1, (modelEntry.scoreDetail.nameSizePenalty / (modelEntry.score || 1)) * 100)}%` }"></div>
                    </div>
                    <span class="rrb-val penalty-val">-{{ modelEntry.scoreDetail.nameSizePenalty?.toFixed(1) }}</span>
                  </div>
                </div>
              </div>
              <div v-if="modelEntry.matchedTags?.length" class="rrb-section">
                <div class="rrb-label">Matched Tags</div>
                <div class="rrb-tags">
                  <span v-for="tag in modelEntry.matchedTags" :key="tag" class="rrb-tag-pill positive">{{ tag }}</span>
                </div>
              </div>
              <div v-if="modelEntry.penaltyTags?.length" class="rrb-section">
                <div class="rrb-label">Penalty Tags</div>
                <div class="rrb-tags">
                  <span v-for="tag in modelEntry.penaltyTags" :key="tag" class="rrb-tag-pill negative">{{ tag }}</span>
                </div>
              </div>
              <!-- Waterfall Bridge Chart -->
              <div v-if="modelEntry.scoreDetail" class="rrb-section">
                <div class="rrb-label">Score Waterfall</div>
                <div class="waterfall-chart">
                  <div class="wf-row">
                    <span class="wf-label">Context</span>
                    <div class="wf-track">
                      <div class="wf-bar wf-positive" :style="{ width: wfPct(modelEntry.scoreDetail.ctxContrib, modelEntry) + '%' }">
                        <span class="wf-val">+{{ modelEntry.scoreDetail.ctxContrib.toFixed(1) }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="wf-row">
                    <span class="wf-label">Tag Bonus</span>
                    <div class="wf-track">
                      <div class="wf-bar wf-positive" :style="{ width: wfPct(modelEntry.scoreDetail.tagBonus, modelEntry) + '%', marginLeft: wfPct(modelEntry.scoreDetail.ctxContrib, modelEntry) + '%' }">
                        <span class="wf-val">+{{ modelEntry.scoreDetail.tagBonus.toFixed(1) }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="wf-row" v-if="modelEntry.scoreDetail.tagPenalty > 0">
                    <span class="wf-label">Tag Penalty</span>
                    <div class="wf-track">
                      <div class="wf-bar wf-negative" :style="{ width: wfPct(modelEntry.scoreDetail.tagPenalty, modelEntry) + '%', marginLeft: wfPenaltyOffset(modelEntry, 'tagPenalty') + '%' }">
                        <span class="wf-val">&#8722;{{ modelEntry.scoreDetail.tagPenalty.toFixed(1) }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="wf-row" v-if="modelEntry.scoreDetail.nameSizePenalty > 0">
                    <span class="wf-label">Name Penalty</span>
                    <div class="wf-track">
                      <div class="wf-bar wf-negative" :style="{ width: wfPct(modelEntry.scoreDetail.nameSizePenalty, modelEntry) + '%', marginLeft: wfPenaltyOffset(modelEntry, 'nameSizePenalty') + '%' }">
                        <span class="wf-val">&#8722;{{ modelEntry.scoreDetail.nameSizePenalty.toFixed(1) }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="wf-row wf-final-row">
                    <span class="wf-label">Final Score</span>
                    <div class="wf-track">
                      <div class="wf-marker" :style="{ left: wfFinalPct(modelEntry) + '%' }"></div>
                    </div>
                    <span class="wf-final-val">{{ (modelEntry.score ?? 0).toFixed(1) }}</span>
                  </div>
                </div>
              </div>
              <!-- Tag Match Heatmap Grid -->
              <div v-if="modelEntry.scoreDetail && (modelEntry.scoreDetail.matchedTags?.length || modelEntry.scoreDetail.matchedPenaltyTags?.length)" class="rrb-section">
                <div class="rrb-label">Tag Match Breakdown</div>
                <div class="tag-heatmap">
                  <div class="thm-column">
                    <span class="thm-col-label positive">Matched ({{ modelEntry.scoreDetail.matchedTags?.length ?? 0 }})</span>
                    <span v-for="tag in modelEntry.scoreDetail.matchedTags" :key="'m-'+tag" class="thm-pill positive">{{ tag }}</span>
                  </div>
                  <div class="thm-column">
                    <span class="thm-col-label negative">Penalty ({{ modelEntry.scoreDetail.matchedPenaltyTags?.length ?? 0 }})</span>
                    <span v-for="tag in modelEntry.scoreDetail.matchedPenaltyTags" :key="'p-'+tag" class="thm-pill negative">{{ tag }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useModelsStore } from '@/store/models';
import type { RoleScore, RoleMeta, ProviderDatapoint, ModelData, CreatorData, ModelScoresData, ModelScore } from '@/types';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { resolveCreatorSlug } from '@/data/provider-icons';

const props = defineProps<{
  rankings?: Record<string, string[]>;
  scores?: Record<string, RoleScore[]>;
  meta?: Record<string, RoleMeta>;
  title?: string;
  subtitle?: string;
  datapointByIdFn?: (id: string) => { dp: ProviderDatapoint; model: ModelData; creator: CreatorData } | undefined;
  selectedVariant?: string;
  variantOptions?: string[];
  modelScores?: ModelScoresData | null;
  // Per-role variant state (new)
  roleVariants?: Record<string, string>;
  masterVariant?: string;
  variantKeys?: string[];
}>();

const emit = defineEmits<{
  'update:selectedVariant': [val: string];
  'update:roleVariant': [role: string, variant: string];
  'update:masterVariant': [variant: string];
}>();

const store = useModelsStore();

const variantLabels: Record<string, string> = {
  combined: 'Combined (our blend)',
  artificial_analysis: 'Artificial Analysis',
  modelsdev: 'Models.dev',
  _benchmarks: 'Benchmarks Only (our blend)',
};

// Compact labels for per-role selectors (shorter to fit narrow columns)
const compactVariantLabels: Record<string, string> = {
  combined: 'Combined',
  artificial_analysis: 'AA',
  modelsdev: 'Models.dev',
  _benchmarks: 'Benchmarks',
};

const title = computed(() => props.title ?? 'Role Rankings (Free)');
const subtitle = computed(() => props.subtitle ?? 'See how models rank for each role and explore their score breakdowns');
// Per-role variant state — use props if provided, else derive from single variant
const roleVariants = computed(() => props.roleVariants ?? {});
const allVariantKeys = computed(() => props.variantKeys ?? (props.variantOptions ?? ['combined']));
const masterVariant = computed(() => props.masterVariant ?? props.selectedVariant ?? 'combined');

const ROLE_VARIANT_OPTIONS: Record<string, string[]> = {
  model:    ['artificial_analysis', '_benchmarks'],
  build:    ['artificial_analysis', 'modelsdev', '_benchmarks'],
  general:  ['artificial_analysis', '_benchmarks'],
  small_model: ['artificial_analysis', '_benchmarks'],
  explore:  ['artificial_analysis', '_benchmarks'],
};

function roleVariantOpts(role: string): string[] {
  const base = ROLE_VARIANT_OPTIONS[role] ?? ['combined'];
  return base.filter(v => v === 'combined' || allVariantKeys.value.includes(v));
}

// Master options: intersection of what all roles support.
// Appends "Custom" when roles differ.
const commonVariantKeys = computed(() => {
  const roleKeys = Object.keys(roleVariants.value);
  if (roleKeys.length === 0) return ['_benchmarks'];
  let common = new Set(roleVariantOpts(roleKeys[0]));
  for (let i = 1; i < roleKeys.length; i++) {
    const roleOpts = new Set(roleVariantOpts(roleKeys[i]));
    common = new Set([...common].filter(v => roleOpts.has(v)));
  }
  return [...common];
});

const masterOptions = computed(() => {
  const opts = [...commonVariantKeys.value];
  if (masterVariant.value === 'custom') opts.push('custom');
  return opts;
});

function onMasterDotClick(variant: string) {
  if (variant === 'custom') return;
  emit('update:masterVariant', variant);
}

function onRoleVariantChange(role: string, variant: string) {
  emit('update:roleVariant', role, variant);
}

function roleVariantLabel(role: string): string {
  const v = roleVariants.value[role];
  if (!v) return '';
  return variantLabels[v] ?? '';
}

const scoreTypeLabels: Record<string, string> = {
  intelligence: 'Intelligence Index',
  output_speed: 'Output Speed (toks/s)',
  latency_total: 'Total Latency (s)',
  latency_ttft: 'TTFT Latency (s)',
  context_window: 'Context Window',
  price_blended: 'Blended Price ($/M)',
  'aider-polyglot': 'Aider Polyglot',
  'swe-bench-verified': 'SWE-Bench Verified',
  'swe-bench-pro': 'SWE-Bench Pro',
  'swe-atlas-codebase-qna': 'SWE-Atlas Codebase Q&A',
  'swe-atlas-refactoring': 'SWE-Atlas Refactoring',
  'swe-atlas-test-writing': 'SWE-Atlas Test Writing',
  scicode: 'SciCode',
  'terminal-bench': 'Terminal-Bench',
  'terminal-bench-2.0': 'Terminal-Bench 2.0',
  'terminal-bench-hard': 'Terminal-Bench Hard',
  'artificial-analysis-coding': 'AA Coding',
  'artificial-analysis-coding-agent': 'AA Coding Agent',
};

const scoreTypesLowerBetter = new Set([
  'latency_total', 'latency_ttft', 'price_blended',
]);

function benchmarkScoresForModel(modelId: string): ModelScore[] {
  const scores = props.modelScores?.scores?.[modelId];
  if (!scores || scores.length === 0) return [];
  const variant = props.selectedVariant ?? 'combined';
  if (variant === 'combined') return [];
  const sourceFilter: string | null =
    variant === 'modelsdev' ? 'modelsdev' :
    variant === 'artificial_analysis' ? 'artificial_analysis' :
    null; // _benchmarks: all sources
  let filtered = sourceFilter
    ? scores.filter((s) => s.source === sourceFilter)
    : scores;
  // Sort: higher-is-better first, then lower-is-better
  const higher = filtered.filter((s) => !scoreTypesLowerBetter.has(s.score_type));
  const lower = filtered.filter((s) => scoreTypesLowerBetter.has(s.score_type));
  return [...higher, ...lower];
}

function isNonCombinedVariant(): boolean {
  const v = props.selectedVariant ?? 'combined';
  return v !== 'combined';
}

function resolveDatapoint(id: string): { dp: ProviderDatapoint; model: ModelData; creator: CreatorData } | undefined {
  if (props.datapointByIdFn) return props.datapointByIdFn(id);
  return store.datapointById.get(id);
}

interface ModelEntry {
  id: string;
  name: string;
  displayName: string;
  creatorName: string;
  providerSlug: string;
  providerName: string;
  score: number | null;
  scorePct: number;
  scoreDetail?: {
    ctxScore: number;
    ctxWeight: number;
    ctxContrib: number;
    tagBonus: number;
    tagPenalty: number;
    penaltyContrib: number;
    nameSizePenalty: number;
    matchedTags: string[];
    matchedPenaltyTags: string[];
    qualityBonus: number;
    qualityIntel: number;
    qualityCoding: number;
    qualitySpeed: number;
    qualityLatency: number;
  };
  matchedTags?: string[];
  penaltyTags?: string[];
}

interface RoleSection {
  key: string;
  label: string;
  models: ModelEntry[];
  meta?: { description: string; needsTools: boolean; ctxWeight: number; tagKeywords: string[]; tagPenaltyKeywords: string[]; nameSizePenalty: boolean; maxCtx: number | null };
}

const roleLabels: Record<string, string> = {
  model: 'Model Role',
  build: 'Build Role',
  general: 'General Role',
  small_model: 'Small Model Role',
  explore: 'Explore Role',
};

const roleColors: Record<string, { accent: string; soft: string; border: string }> = {
  model:    { accent: '#6380f7', soft: 'rgba(99,128,247,0.08)',  border: 'rgba(99,128,247,0.25)' },
  build:    { accent: '#f59e0b', soft: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)' },
  general:  { accent: '#34d399', soft: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)' },
  small_model: { accent: '#22d3ee', soft: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.25)' },
  explore:  { accent: '#a78bfa', soft: 'rgba(167,139,250,0.08)',  border: 'rgba(167,139,250,0.25)' },
};

const roleFallbackMeta: Record<string, { description: string; ctxWeight: number; tagKeywords: string[]; tagPenaltyKeywords: string[]; needsTools: boolean; nameSizePenalty: boolean; maxCtx: number | null }> = {
  model: {
    description: 'Best all-round models for general assistant and chat use. Favors large context windows, tool calling, and broad capability tags.',
    ctxWeight: 0.4, tagKeywords: ['chat', 'assistant', 'general-purpose'], tagPenaltyKeywords: [], needsTools: true, nameSizePenalty: false, maxCtx: null,
  },
  build: {
    description: 'Models optimized for coding, reasoning, and structured output. Prioritizes tool calling, reasoning capabilities, and code-related tags.',
    ctxWeight: 0.3, tagKeywords: ['coding', 'reasoning', 'tools', 'structured'], tagPenaltyKeywords: ['chat'], needsTools: true, nameSizePenalty: false, maxCtx: null,
  },
  general: {
    description: 'Balanced ranking for everyday tasks. Rewards general-purpose models with solid context and reliable output across diverse use cases.',
    ctxWeight: 0.35, tagKeywords: ['general-purpose', 'multimodal', 'chat'], tagPenaltyKeywords: [], needsTools: false, nameSizePenalty: false, maxCtx: null,
  },
  small_model: {
    description: 'Efficient, compact models ideal for edge devices, fast inference, and cost-sensitive deployments. Name length penalized to favor concise model IDs.',
    ctxWeight: 0.2, tagKeywords: ['small', 'efficient', 'edge', 'fast'], tagPenaltyKeywords: [], needsTools: false, nameSizePenalty: true, maxCtx: 32000,
  },
  explore: {
    description: 'Discovery-oriented ranking for experimental and niche models. Rewards novelty, unique capabilities, and research-oriented tags.',
    ctxWeight: 0.25, tagKeywords: ['research', 'experimental', 'creative', 'reasoning'], tagPenaltyKeywords: [], needsTools: false, nameSizePenalty: false, maxCtx: null,
  },
};

const expandedModels = ref(new Set<string>());

const roles = computed((): RoleSection[] => {
  const rankings = props.rankings ?? store.roleRankings;
  const scores = props.scores ?? store.roleScores;
  const meta = props.meta ?? store.roleMeta;

  return Object.entries(rankings).map(([key, modelIds]) => {
    const roleScores = scores[key] ?? [];
    const maxScore = roleScores.length > 0 ? Math.max(...roleScores.map((s) => s.score)) : 1;

    const models: ModelEntry[] = modelIds.slice(0, 30).map((id) => {
      const detail = roleScores.find((s) => s.id === id);
      const score = detail?.score ?? null;
      const resolved = resolveDatapoint(id);
      const providerSlug = resolveCreatorSlug(id);
      const displayName = resolved?.model.name ?? humanizeId(id);
      const creatorName = resolved?.creator.name ?? '';
      const providerName = resolved?.dp.provider ?? providerSlug;
      return {
        id,
        name: id,
        displayName,
        creatorName,
        providerSlug,
        providerName,
        score,
        scorePct: score ? Math.round((score / maxScore) * 100) : 0,
        scoreDetail: detail
          ? {
              ctxScore: detail.ctxScore,
              ctxWeight: detail.ctxWeight,
              ctxContrib: detail.ctxContrib,
              tagBonus: detail.tagBonus,
              tagPenalty: detail.tagPenalty,
              penaltyContrib: detail.penaltyContrib,
              nameSizePenalty: detail.nameSizePenalty,
              matchedTags: detail.matchedTags,
              matchedPenaltyTags: detail.matchedPenaltyTags,
              qualityBonus: detail.qualityBonus ?? 0,
              qualityIntel: detail.qualityIntel ?? 0,
              qualityCoding: detail.qualityCoding ?? 0,
              qualitySpeed: detail.qualitySpeed ?? 0,
              qualityLatency: detail.qualityLatency ?? 0,
            }
          : undefined,
        matchedTags: detail?.matchedTags,
        penaltyTags: detail?.matchedPenaltyTags,
      };
    });

    return {
      key,
      label: roleLabels[key] ?? key,
      models,
      meta: { ...roleFallbackMeta[key], ...meta[key] } as RoleSection['meta'],
    };
  });
});

function humanizeId(fullId: string): string {
  // Take the last meaningful segment, strip provider prefixes and :free suffix
  const parts = fullId.split('/');
  // Use last segment that looks like a model name (skip short segments like :free)
  let name = parts[parts.length - 1];
  // Remove :free suffix
  name = name.replace(/:free$/i, '');
  // If it's just a version tag, use the second-to-last
  if (name.length < 4 && parts.length > 1) {
    name = parts[parts.length - 2] + '-' + name;
  }
  // Convert kebab/snake to Title Case
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function medalBg(idx: number): string {
  const colors = [
    'rgba(255,215,0,0.13)',   // gold
    'rgba(192,192,192,0.11)', // silver
    'rgba(205,133,63,0.10)',  // bronze
  ];
  return colors[idx] ?? 'transparent';
}

function medalBorder(idx: number): string {
  const colors = [
    'rgba(255,215,0,0.45)',
    'rgba(192,192,192,0.35)',
    'rgba(205,133,63,0.35)',
  ];
  return colors[idx] ?? 'transparent';
}

function toggleModel(roleKey: string, modelId: string) {
  const key = `${roleKey}/${modelId}`;
  if (expandedModels.value.has(key)) {
    expandedModels.value.delete(key);
  } else {
    expandedModels.value.add(key);
  }
}

function getMaxComponent(entry: ModelEntry): number {
  if (!entry.scoreDetail) return 1;
  const d = entry.scoreDetail;
  return Math.max(d.ctxContrib + d.tagBonus + d.tagPenalty + d.nameSizePenalty, 1);
}

function wfPct(value: number, entry: ModelEntry): number {
  return Math.max(1, (value / getMaxComponent(entry)) * 100);
}

function wfPenaltyOffset(entry: ModelEntry, penaltyType: 'tagPenalty' | 'nameSizePenalty'): number {
  if (!entry.scoreDetail) return 0;
  const d = entry.scoreDetail;
  const posTotal = d.ctxContrib + d.tagBonus;
  if (penaltyType === 'tagPenalty') return wfPct(posTotal, entry);
  return wfPct(posTotal - d.tagPenalty, entry);
}

function wfFinalPct(entry: ModelEntry): number {
  const score = entry.score ?? 0;
  return Math.max(0, Math.min(100, (score / getMaxComponent(entry)) * 100));
}
</script>

<style scoped>
.rankings-page {
  max-width: none;
  margin: 0;
  padding: 20px 16px;
}

.rankings-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  align-items: start;
}

.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0 0 4px;
}

.page-header p {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0 0 24px;
}

/* ── Master dot toggle (page header) ── */
.master-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.toggle-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.variant-dots {
  display: flex;
  align-items: center;
  gap: 2px;
}

.vd-option {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px 4px 6px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
  position: relative;
}

.vd-option:hover {
  background: rgba(255,255,255,0.04);
}

/* Connecting line between dots */
.vd-option + .vd-option::before {
  content: '';
  position: absolute;
  left: -3px;
  top: 50%;
  width: 8px;
  height: 1px;
  background: rgba(255,255,255,0.18);
}

.vd-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.06);
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
}

.vd-option:hover .vd-dot {
  border-color: rgba(255,255,255,0.45);
}

.vd-option.active .vd-dot {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow, rgba(99,128,247,0.4));
}

.vd-label {
  font-size: 0.65rem;
  color: var(--text-dim);
  white-space: nowrap;
  transition: color 0.2s;
}

.vd-option.active .vd-label {
  color: var(--text);
  font-weight: 600;
}

.role-desc-source {
  font-size: 0.55rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent);
  margin-bottom: 4px;
}

.rankings-empty {
  text-align: center;
  padding: 60px 24px;
  color: var(--text-muted);
}

/* Role sections */
.role-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--depth-3, var(--bg-card));
  overflow: hidden;
  min-width: 0;
}

.role-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 8px 10px;
  user-select: none;
  min-height: 38px;
}

.role-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* ── Per-role dot toggle (role header) ── */
.role-variant-dots {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}

.rvd-option {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.rvd-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.06);
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
  position: relative;
}

.rvd-option:hover .rvd-dot {
  border-color: rgba(255,255,255,0.45);
}

.rvd-option.active .rvd-dot {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 5px var(--accent-glow, rgba(99,128,247,0.4));
}

/* Horizontal connecting line to the right of each dot except the last */
.rvd-option:not(:last-child) .rvd-dot::after {
  content: '';
  position: absolute;
  left: 11px;
  top: 50%;
  width: 8px;
  height: 1px;
  margin-top: -0.5px;
  background: rgba(255,255,255,0.18);
}

.rvd-label {
  display: none;
}

.role-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.role-title {
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
  margin: 0;
  white-space: nowrap;
  color: var(--text);
}

.role-badge {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  color: var(--text-dim);
}

/* Role description panel */
.role-desc {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-light);
  height: 130px;
  overflow-y: auto;
}

.role-desc-text {
  font-size: 0.67rem;
  color: var(--text-dim);
  margin: 0 0 5px;
  line-height: 1.45;
}

.role-desc-factors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.role-desc-factor {
  font-size: 0.6rem;
  color: var(--text-dim);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: rgba(255,255,255,0.08);
}

.factor-icon {
  font-weight: 700;
  font-size: 0.58rem;
}

.factor-icon.positive { color: var(--green); }
.factor-icon.negative { color: var(--red); }

/* Ranking rows */
.role-body {
  border-top: 1px solid var(--border-light);
}

.ranking-row {
  border-bottom: 1px solid var(--border-light);
}

.ranking-row:last-child {
  border-bottom: none;
}

.rr-main {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px;
  cursor: pointer;
  transition: background 0.1s;
}

.rr-main:hover {
  background: var(--bg-hover);
}

.rr-podium {
  border-left: 3px solid;
}

.rr-rank {
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--text-dim);
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
  width: 22px;
  text-align: right;
}

.rr-medal {
  font-size: 1rem;
  font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
  font-weight: 400;
  width: 26px;
  text-align: center;
}

.rr-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rr-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rr-name-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.rr-provider-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--text-dim);
}

.rr-creator {
  display: none;
}

.rr-key-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.rr-key {
  font-size: 0.58rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.6;
}

.rr-provider-tag {
  font-size: 0.55rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  background: rgba(255,255,255,0.1);
  color: var(--text-dim);
  flex-shrink: 0;
}

.rr-bar-track {
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}

.rr-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s var(--ease-emphasis);
}

.rr-score {
  font-size: 0.7rem;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-dim);
  flex-shrink: 0;
  width: 32px;
  text-align: right;
}

.rr-chevron {
  flex-shrink: 0;
  color: var(--text-dim);
  transition: transform 0.2s;
  width: 10px;
  height: 10px;
}

.rr-chevron.open {
  transform: rotate(180deg);
}

/* Breakdown */
.rr-breakdown {
  padding: 6px 8px 8px 30px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rrb-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rrb-label {
  font-size: 0.56rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.rrb-bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rrb-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.rrb-tag {
  width: 64px;
  font-size: 0.6rem;
  color: var(--text-dim);
  flex-shrink: 0;
}

.rrb-track {
  flex: 1;
  height: 5px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}

.rrb-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s var(--ease-emphasis);
}

.rrb-fill.total { background: var(--accent-gradient); }
.rrb-fill.ctx { background: var(--viz-hue-3, #48dbfb); }
.rrb-fill.bonus { background: var(--green); }
.rrb-fill.quality { background: var(--viz-hue-5, #a78bfa); }
.rrb-fill.quality-sub { background: color-mix(in srgb, var(--viz-hue-5, #a78bfa) 50%, transparent); }
.rrb-fill.penalty { background: var(--red); }

.rrb-val {
  width: 34px;
  font-size: 0.6rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-dim);
  text-align: right;
  flex-shrink: 0;
}

.rrb-tag.qsub {
  padding-left: 12px;
  font-size: 0.55rem;
}

.rrb-val.qsub-val {
  font-size: 0.55rem;
  color: var(--text-muted);
}

.rrb-val.qsub-val.penalty {
  color: var(--red);
}

.penalty-val {
  color: var(--red);
}

.rrb-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.rrb-tag-pill {
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-size: 0.53rem;
  font-weight: 600;
}

.rrb-tag-pill.positive {
  background: var(--green-subtle);
  color: var(--green);
}

.rrb-tag-pill.negative {
  background: var(--red-subtle);
  color: var(--red);
}

/* Benchmark scores grid (non-combined variants) */
.benchmark-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.benchmark-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.benchmark-label {
  flex: 1;
  font-size: 0.6rem;
  color: var(--text-dim);
  min-width: 0;
}

.benchmark-source-tag {
  font-size: 0.48rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: var(--radius-full);
  background: rgba(255,255,255,0.08);
  color: var(--text-muted);
  flex-shrink: 0;
}

.benchmark-value {
  font-size: 0.6rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-dim);
  width: 52px;
  text-align: right;
  flex-shrink: 0;
}

.benchmark-value.lower-better {
  color: var(--text-muted);
}

.rrb-empty {
  font-size: 0.58rem;
  color: var(--text-muted);
  font-style: italic;
  padding: 4px 0;
}

/* Waterfall chart */
.waterfall-chart {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.wf-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 14px;
}

.wf-label {
  width: 55px;
  font-size: 0.5rem;
  color: var(--text-muted);
  flex-shrink: 0;
  text-align: right;
}

.wf-track {
  flex: 1;
  height: 10px;
  position: relative;
  background: var(--depth-2, rgba(17, 21, 32, 0.6));
  border-radius: 2px;
  overflow: visible;
}

.wf-bar {
  height: 100%;
  border-radius: 2px;
  position: relative;
  transition: width 0.4s var(--ease-emphasis, ease);
  min-width: 16px;
}

.wf-positive {
  background: linear-gradient(90deg, var(--green), color-mix(in srgb, var(--green) 70%, var(--accent)));
}

.wf-negative {
  background: linear-gradient(90deg, var(--red-dim, #c44), var(--red));
}

.wf-val {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.45rem;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: var(--depth-0, #080a10);
  white-space: nowrap;
}

.wf-negative .wf-val {
  color: var(--text, #e8ecf4);
}

.wf-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%) rotate(45deg);
  width: 7px;
  height: 7px;
  background: var(--accent-gradient, linear-gradient(135deg, #6b8aff, #a78bfa));
  border-radius: 1.5px;
  box-shadow: 0 0 4px var(--accent-glow, rgba(99,128,247,0.4));
}

.wf-final-row {
  border-top: 1px solid var(--border-light);
  padding-top: 4px;
  margin-top: 1px;
}

.wf-final-val {
  font-size: 0.58rem;
  font-weight: 800;
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent);
  width: 36px;
  text-align: right;
  flex-shrink: 0;
}

/* Tag Heatmap Grid */
.tag-heatmap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.thm-column {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.thm-col-label {
  font-size: 0.5rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 1px;
}

.thm-col-label.positive { color: var(--green); }
.thm-col-label.negative { color: var(--red); }

.thm-pill {
  padding: 1px 5px;
  border-radius: var(--radius-full);
  font-size: 0.5rem;
  font-weight: 600;
  display: inline-block;
  width: fit-content;
}

.thm-pill.positive {
  background: var(--green-subtle, rgba(52,211,153,0.15));
  color: var(--green);
}

.thm-pill.negative {
  background: var(--red-subtle, rgba(248,113,113,0.15));
  color: var(--red);
}

@media (max-width: 1600px) {
  .rankings-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1100px) {
  .rankings-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 700px) {
  .rankings-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .rankings-page {
    padding: 8px;
  }
  .rr-breakdown {
    padding: 0 6px 6px 24px;
  }
}
</style>
