<template>
  <div class="rankings-page">
    <div class="page-header">
      <h2>{{ title }}</h2>
      <p v-if="subtitle">{{ subtitle }}</p>
      <div v-if="variantOptions.length > 1" class="variant-selector">
        <label for="ranking-source">Benchmark source:</label>
        <select id="ranking-source" :value="selectedVariant" @change="onVariantChange">
          <option v-for="v in variantOptions" :key="v" :value="v">{{ variantLabels[v] ?? v }}</option>
        </select>
      </div>
    </div>

    <div v-if="roles.length === 0" class="rankings-empty">
      <p>No ranking data available yet. Run the ranking pipeline to populate data.</p>
    </div>

    <div v-else class="rankings-grid">
    <div v-for="role in roles" :key="role.key" class="role-section" :style="{ borderColor: roleColors[role.key]?.border ?? 'var(--border)' }">
      <div class="role-header" :style="{ background: roleColors[role.key]?.soft ?? 'transparent' }">
        <div class="role-header-left">
          <span class="role-dot" :style="{ background: roleColors[role.key]?.accent }"></span>
          <h3 class="role-title">{{ role.label }}</h3>
          <span class="role-badge" :style="{ background: roleColors[role.key]?.soft, color: roleColors[role.key]?.accent }">{{ role.models.length }} models</span>
        </div>
      </div>

      <div class="role-body">
        <div class="role-desc" v-if="role.meta">
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
                <svg class="rr-provider-icon" :viewBox="getProviderIcon(modelEntry.providerSlug).viewBox" v-html="getProviderIcon(modelEntry.providerSlug).body"></svg>
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
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useModelsStore } from '@/store/models';
import type { RoleScore, RoleMeta, ProviderDatapoint, ModelData, CreatorData } from '@/types';
import { resolveCreatorSlug, getProviderIcon } from '@/data/provider-icons';

const props = defineProps<{
  rankings?: Record<string, string[]>;
  scores?: Record<string, RoleScore[]>;
  meta?: Record<string, RoleMeta>;
  title?: string;
  subtitle?: string;
  datapointByIdFn?: (id: string) => { dp: ProviderDatapoint; model: ModelData; creator: CreatorData } | undefined;
  selectedVariant?: string;
  variantOptions?: string[];
}>();

const emit = defineEmits<{
  'update:selectedVariant': [val: string];
}>();

const store = useModelsStore();

const variantLabels: Record<string, string> = {
  combined: 'Combined (AA + Models.dev)',
  artificial_analysis: 'Artificial Analysis',
  modelsdev: 'Models.dev',
  _benchmarks: 'Benchmarks Only (no context/tags)',
};

function onVariantChange(ev: Event) {
  emit('update:selectedVariant', (ev.target as HTMLSelectElement).value);
}

const title = computed(() => props.title ?? 'Role Rankings (Free)');
const subtitle = computed(() => props.subtitle ?? 'See how models rank for each role and explore their score breakdowns');
const variantOptions = computed(() => props.variantOptions ?? ['combined']);

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

.variant-selector {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.variant-selector label {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.variant-selector select {
  appearance: auto;
  background: var(--bg-card, #1a1a2e);
  color: var(--text-primary, #e2e8f0);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.78rem;
  cursor: pointer;
}

.variant-selector select:focus {
  outline: none;
  border-color: var(--accent, #818cf8);
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
  padding: 8px 10px;
  user-select: none;
}

.role-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.role-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.role-title {
  font-size: 0.82rem;
  font-weight: 700;
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
