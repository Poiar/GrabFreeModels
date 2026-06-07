<template>
  <div class="rankings-page">
    <div class="page-header">
      <h2>Role Rankings Explorer</h2>
      <p>See how models rank for each role and explore their score breakdowns</p>
    </div>

    <div v-if="roles.length === 0" class="rankings-empty">
      <p>No ranking data available yet. Run the ranking pipeline to populate data.</p>
    </div>

    <div v-for="role in roles" :key="role.key" class="role-section">
      <div class="role-header" @click="toggleRole(role.key)">
        <div class="role-header-left">
          <h3 class="role-title">{{ role.label }}</h3>
          <span class="role-badge">{{ role.models.length }} models</span>
          <span v-if="role.meta" class="role-meta">{{ role.meta.description }}</span>
        </div>
        <svg
          class="role-chevron"
          :class="{ open: expandedRoles.has(role.key) }"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      <div v-if="expandedRoles.has(role.key)" class="role-body">
        <div
          v-for="(modelEntry, idx) in role.models"
          :key="modelEntry.id"
          class="ranking-row"
        >
          <div class="rr-main" @click="toggleModel(role.key, modelEntry.id)">
            <div class="rr-rank">#{{ idx + 1 }}</div>
            <div class="rr-info">
              <span class="rr-name">{{ modelEntry.name }}</span>
              <div class="rr-bar-track">
                <div
                  class="rr-bar-fill"
                  :style="{ width: `${Math.max(2, modelEntry.scorePct)}%`, background: barColor(idx) }"
                ></div>
              </div>
            </div>
            <div class="rr-score stat-number">{{ modelEntry.score?.toFixed(0) ?? '—' }}</div>
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
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useModelsStore } from '@/store/models';

const store = useModelsStore();

interface ModelEntry {
  id: string;
  name: string;
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
  meta?: { description: string; needsTools: boolean; ctxWeight: number };
}

const roleLabels: Record<string, string> = {
  model: 'Model Role',
  build: 'Build Role',
  general: 'General Role',
  small_model: 'Small Model Role',
  explore: 'Explore Role',
};

const expandedRoles = ref(new Set<string>(['model']));
const expandedModels = ref(new Set<string>());

const roles = computed((): RoleSection[] => {
  const rankings = store.roleRankings;
  const scores = store.roleScores;
  const meta = store.roleMeta;

  return Object.entries(rankings).map(([key, modelIds]) => {
    const roleScores = scores[key] ?? [];
    const maxScore = roleScores.length > 0 ? Math.max(...roleScores.map((s) => s.score)) : 1;

    const models: ModelEntry[] = modelIds.slice(0, 30).map((id) => {
      const detail = roleScores.find((s) => s.id === id);
      const score = detail?.score ?? null;
      return {
        id,
        name: id,
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
      meta: meta[key],
    };
  });
});

function barColor(idx: number): string {
  const colors = ['#6380f7', '#a78bfa', '#34d399', '#22d3ee', '#fbbf24', '#f87171'];
  return colors[idx % colors.length];
}

function toggleRole(key: string) {
  if (expandedRoles.value.has(key)) {
    expandedRoles.value.delete(key);
  } else {
    expandedRoles.value.add(key);
  }
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
  max-width: 1000px;
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
  margin: 0 0 24px;
}

.rankings-empty {
  text-align: center;
  padding: 60px 24px;
  color: var(--text-muted);
}

/* Role sections */
.role-section {
  margin-bottom: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--depth-3, var(--bg-card));
  overflow: hidden;
}

.role-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}

.role-header:hover {
  background: var(--bg-hover);
}

.role-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.role-title {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0;
}

.role-badge {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--accent-subtle);
  color: var(--accent);
}

.role-meta {
  font-size: 0.65rem;
  color: var(--text-muted);
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform 0.2s;
}

.role-chevron.open {
  transform: rotate(180deg);
}

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
  gap: 12px;
  padding: 10px 18px;
  cursor: pointer;
  transition: background 0.1s;
}

.rr-main:hover {
  background: var(--bg-hover);
}

.rr-rank {
  width: 36px;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
}

.rr-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rr-name {
  font-size: 0.82rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rr-bar-track {
  height: 4px;
  background: var(--depth-1, var(--bg-elevated));
  border-radius: 2px;
  overflow: hidden;
}

.rr-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s var(--ease-emphasis);
}

.rr-score {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dim);
  flex-shrink: 0;
  width: 48px;
  text-align: right;
}

.rr-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform 0.2s;
}

.rr-chevron.open {
  transform: rotate(180deg);
}

/* Breakdown */
.rr-breakdown {
  padding: 0 18px 14px 66px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rrb-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rrb-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.rrb-bars {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rrb-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rrb-tag {
  width: 90px;
  font-size: 0.68rem;
  color: var(--text-dim);
  flex-shrink: 0;
}

.rrb-track {
  flex: 1;
  height: 6px;
  background: var(--depth-1, var(--bg-elevated));
  border-radius: 3px;
  overflow: hidden;
}

.rrb-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s var(--ease-emphasis);
}

.rrb-fill.total { background: var(--accent-gradient); }
.rrb-fill.ctx { background: var(--viz-hue-3, #48dbfb); }
.rrb-fill.bonus { background: var(--green); }
.rrb-fill.penalty { background: var(--red); }

.rrb-val {
  width: 44px;
  font-size: 0.68rem;
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
  gap: 4px;
}

.rrb-tag-pill {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 0.62rem;
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
  gap: 5px;
}

.wf-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 20px;
}

.wf-label {
  width: 80px;
  font-size: 0.62rem;
  color: var(--text-muted);
  flex-shrink: 0;
  text-align: right;
}

.wf-track {
  flex: 1;
  height: 14px;
  position: relative;
  background: var(--depth-2, rgba(17, 21, 32, 0.6));
  border-radius: 3px;
  overflow: visible;
}

.wf-bar {
  height: 100%;
  border-radius: 3px;
  position: relative;
  transition: width 0.4s var(--ease-emphasis, ease);
  min-width: 24px;
}

.wf-positive {
  background: linear-gradient(90deg, var(--green), color-mix(in srgb, var(--green) 70%, var(--accent)));
}

.wf-negative {
  background: linear-gradient(90deg, var(--red-dim, #c44), var(--red));
}

.wf-val {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.55rem;
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
  width: 10px;
  height: 10px;
  background: var(--accent-gradient, linear-gradient(135deg, #6b8aff, #a78bfa));
  border-radius: 1.5px;
  box-shadow: 0 0 6px var(--accent-glow, rgba(99,128,247,0.4));
}

.wf-final-row {
  border-top: 1px solid var(--border-light);
  padding-top: 6px;
  margin-top: 2px;
}

.wf-final-val {
  font-size: 0.72rem;
  font-weight: 800;
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent);
  width: 48px;
  text-align: right;
  flex-shrink: 0;
}

/* Tag Heatmap Grid */
.tag-heatmap {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.thm-column {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.thm-col-label {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 2px;
}

.thm-col-label.positive { color: var(--green); }
.thm-col-label.negative { color: var(--red); }

.thm-pill {
  padding: 3px 8px;
  border-radius: var(--radius-full);
  font-size: 0.62rem;
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

@media (max-width: 768px) {
  .wf-label { width: 60px; font-size: 0.55rem; }
  .tag-heatmap { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .rankings-page {
    padding: 12px;
  }
  .rr-breakdown {
    padding: 0 12px 12px 40px;
  }
  .rrb-tag {
    width: 65px;
    font-size: 0.62rem;
  }
  .role-meta {
    display: none;
  }
}
</style>
