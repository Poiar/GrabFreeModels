<template>
  <div class="se-page">
    <div class="page-header">
      <h2>Model Scores Explorer</h2>
      <p>Per-model benchmark scores, quality factors, and role-specific scoring breakdowns</p>
    </div>

    <!-- Summary stats -->
    <div class="se-stats-row">
      <div class="se-stat"><span class="se-stat-value">{{ scoredModelCount }}</span><span class="se-stat-label">Models scored</span></div>
      <div class="se-stat"><span class="se-stat-value">{{ scoreSources.length }}</span><span class="se-stat-label">Score sources</span></div>
      <div class="se-stat"><span class="se-stat-value">{{ totalScoreEntries }}</span><span class="se-stat-label">Total entries</span></div>
    </div>

    <!-- Search + sort -->
    <div class="se-controls">
      <input v-model="search" type="text" class="se-search" placeholder="Search models…" />
      <select v-model="sortBy" class="se-sort">
        <option value="name">Name</option>
        <option value="score">Best score</option>
        <option value="sources">Most sources</option>
      </select>
      <select v-model="scoreFilter" class="se-sort">
        <option value="">All sources</option>
        <option v-for="s in scoreSources" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <!-- Per-role quality breakdown -->
    <div v-if="roleQualityBreakdown.length" class="se-roles-section">
      <h3 class="section-title">Role Quality Breakdown</h3>
      <div class="se-roles-grid">
        <div v-for="role in roleQualityBreakdown" :key="role.role" class="se-role-card">
          <h4>{{ formatRole(role.role) }}</h4>
          <div class="se-role-stats">
            <span>Models: <strong>{{ role.count }}</strong></span>
            <span>Avg quality: <strong>{{ role.avgQuality?.toFixed(1) ?? '—' }}</strong></span>
            <span>Avg freshness: <strong>{{ role.avgFreshness ? (role.avgFreshness * 100).toFixed(0) + '%' : '—' }}</strong></span>
            <span>Avg speed: <strong>{{ role.avgSpeed?.toFixed(1) ?? '—' }}</strong></span>
            <span>Avg latency: <strong>{{ role.avgLatency ? role.avgLatency.toFixed(0) + 'ms' : '—' }}</strong></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Score distribution chart -->
    <div class="se-dist-section" v-if="scoreDistribution.length">
      <h3 class="section-title">Score Distribution</h3>
      <div class="se-dist-bars">
        <div v-for="b in scoreDistribution" :key="b.bucket" class="se-dist-row">
          <span class="se-dist-label">{{ b.bucket }}</span>
          <div class="se-dist-track"><div class="se-dist-fill" :style="{ width: b.pct + '%' }"></div></div>
          <span class="se-dist-count">{{ b.count }}</span>
        </div>
      </div>
    </div>

    <!-- Score table -->
    <h3 class="section-title">Model Scores</h3>
    <div class="se-table-wrap">
      <table class="se-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Creator</th>
            <th v-for="src in sourceColumns" :key="src" class="se-src-col">{{ src }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filteredRows" :key="row.slug">
            <td><router-link :to="`/model/${row.slug}`" class="se-model-link">{{ row.name }}</router-link></td>
            <td class="se-creator">{{ row.creator }}</td>
            <td v-for="src in sourceColumns" :key="src" class="se-val-cell">
              <span v-if="row.scores[src] !== undefined" class="se-val" :class="scoreClass(row.scores[src])">{{ row.scores[src]?.toFixed(1) }}</span>
              <span v-else class="se-na">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="filteredRows.length === 0" class="se-empty">No models match the current filters.</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '@/store/models';

const store = useModelsStore();
const search = ref('');
const sortBy = ref<'name' | 'score' | 'sources'>('score');
const scoreFilter = ref('');

// ── Data extraction ──
interface ScoreRow {
  slug: string; name: string; creator: string;
  scores: Record<string, number>;
  bestScore: number; sourceCount: number;
}

const allScoreRows = computed((): ScoreRow[] => {
  const scores = store.modelScores;
  if (!scores?.scores) return [];
  const rows: ScoreRow[] = [];
  for (const [slug, entries] of Object.entries(scores.scores)) {
    const model = store.modelBySlug.get(slug);
    if (!model) continue;
    const row: ScoreRow = { slug, name: model.name, creator: model.creator || 'Unknown', scores: {}, bestScore: 0, sourceCount: 0 };
    for (const e of entries) {
      if (e.score_value == null) continue;
      const key = e.source || e.score_type;
      if (row.scores[key] === undefined || e.score_value > row.scores[key]) {
        row.scores[key] = e.score_value;
      }
      if (e.score_value > row.bestScore) row.bestScore = e.score_value;
    }
    row.sourceCount = Object.keys(row.scores).length;
    rows.push(row);
  }
  return rows;
});

const scoreSources = computed(() => {
  const srcs = new Set<string>();
  for (const r of allScoreRows.value) for (const k of Object.keys(r.scores)) srcs.add(k);
  return [...srcs].sort();
});

const sourceColumns = computed(() => scoreFilter.value ? [scoreFilter.value] : scoreSources.value.slice(0, 8));

const scoredModelCount = computed(() => allScoreRows.value.length);
const totalScoreEntries = computed(() => allScoreRows.value.reduce((s, r) => s + r.sourceCount, 0));

const filteredRows = computed(() => {
  let rows = allScoreRows.value;
  if (search.value) {
    const q = search.value.toLowerCase();
    rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.creator.toLowerCase().includes(q));
  }
  if (sortBy.value === 'name') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy.value === 'score') rows = [...rows].sort((a, b) => b.bestScore - a.bestScore);
  else rows = [...rows].sort((a, b) => b.sourceCount - a.sourceCount);
  return rows;
});

function scoreClass(v: number): string {
  if (v >= 80) return 'hi';
  if (v >= 50) return 'mid';
  return 'lo';
}

// ── Role quality breakdown ──
const roleQualityBreakdown = computed(() => {
  const scores = store.modelScores;
  if (!scores?.scores) return [];
  const roles = ['model', 'build', 'general', 'small_model', 'explore'];
  return roles.map(role => {
    let count = 0, totalQ = 0, totalF = 0, fCount = 0, totalS = 0, totalL = 0, lCount = 0;
    for (const [, entries] of Object.entries(scores.scores)) {
      const e = entries.find(s => (s as any).score_type === role || (s as any).source === role);
      if (!e) continue;
      count++;
      if ((e as any).qualityBonus != null) { totalQ += (e as any).qualityBonus; }
      if ((e as any).freshness != null) { totalF += (e as any).freshness; fCount++; }
      if ((e as any).qualitySpeed != null) { totalS += (e as any).qualitySpeed; }
      if ((e as any).qualityLatency != null) { totalL += (e as any).qualityLatency; lCount++; }
    }
    return {
      role,
      count,
      avgQuality: count ? totalQ / count : null,
      avgFreshness: fCount ? totalF / fCount : null,
      avgSpeed: count ? totalS / count : null,
      avgLatency: lCount ? totalL / lCount : null,
    };
  });
});

// ── Score distribution ──
const scoreDistribution = computed(() => {
  const buckets = ['0-20', '20-40', '40-60', '60-80', '80-100'];
  const counts = [0, 0, 0, 0, 0];
  for (const r of allScoreRows.value) {
    const s = r.bestScore;
    if (s < 20) counts[0]++;
    else if (s < 40) counts[1]++;
    else if (s < 60) counts[2]++;
    else if (s < 80) counts[3]++;
    else counts[4]++;
  }
  const max = Math.max(...counts, 1);
  return buckets.map((b, i) => ({ bucket: b, count: counts[i], pct: Math.round((counts[i] / max) * 100) }));
});

function formatRole(role: string): string {
  const labels: Record<string, string> = { model: 'Coder', build: 'Build', general: 'General', small_model: 'Small', explore: 'Explore' };
  return labels[role] || role;
}
</script>

<style scoped>
.se-page { max-width: 1200px; margin: 0 auto; padding: 20px; }
.page-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.page-header p { font-size: 0.78rem; color: var(--text-muted); margin: 0; }

.se-stats-row { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.se-stat { display: flex; flex-direction: column; padding: 10px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); min-width: 120px; }
.se-stat-value { font-size: 1.2rem; font-weight: 700; color: var(--accent); }
.se-stat-label { font-size: 0.62rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }

.se-controls { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.se-search { flex: 1; min-width: 200px; padding: 6px 10px; font-size: 0.8rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card); color: var(--text); font-family: inherit; }
.se-sort { padding: 6px 10px; font-size: 0.75rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card); color: var(--text); font-family: inherit; }

.section-title { font-size: 1rem; font-weight: 700; margin: 20px 0 12px; }

/* Role quality */
.se-roles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.se-role-card { padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); }
.se-role-card h4 { font-size: 0.85rem; font-weight: 700; margin: 0 0 6px; color: var(--accent); }
.se-role-stats { display: flex; flex-direction: column; gap: 2px; }
.se-role-stats span { font-size: 0.68rem; color: var(--text-dim); }
.se-role-stats strong { color: var(--text); }

/* Score distribution */
.se-dist-bars { display: flex; flex-direction: column; gap: 6px; max-width: 500px; }
.se-dist-row { display: flex; align-items: center; gap: 8px; }
.se-dist-label { font-size: 0.65rem; color: var(--text-dim); width: 50px; text-align: right; }
.se-dist-track { flex: 1; height: 12px; border-radius: 6px; background: var(--bg-elevated); overflow: hidden; }
.se-dist-fill { height: 100%; border-radius: 6px; background: var(--accent); transition: width 0.3s; }
.se-dist-count { font-size: 0.65rem; font-weight: 600; color: var(--text-dim); width: 30px; }

/* Table */
.se-table-wrap { overflow-x: auto; }
.se-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
.se-table th { text-align: left; padding: 6px 10px; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
.se-table td { padding: 5px 10px; border-bottom: 1px solid var(--border-subtle); }
.se-model-link { color: var(--accent); text-decoration: none; font-weight: 600; }
.se-model-link:hover { text-decoration: underline; }
.se-creator { color: var(--text-dim); font-size: 0.7rem; }
.se-src-col { text-align: center; min-width: 60px; }
.se-val-cell { text-align: center; }
.se-val { font-weight: 700; font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; }
.se-val.hi { color: #34d399; background: rgba(52,211,153,0.1); }
.se-val.mid { color: #fbbf24; background: rgba(251,191,36,0.1); }
.se-val.lo { color: #f87171; background: rgba(239,68,68,0.1); }
.se-na { color: var(--text-dim); font-size: 0.65rem; }
.se-empty { padding: 32px 0; text-align: center; color: var(--text-muted); font-size: 0.85rem; }

@media (max-width: 768px) { .se-page { padding: 12px; } }
</style>
