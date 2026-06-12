<template>
  <div class="bm-page">
    <div class="page-header">
      <h2>Benchmarks</h2>
      <p>
        {{ store.benchmarkEntries.length }} models with external benchmark scores from Artificial
        Analysis and models.dev
      </p>
    </div>

    <div class="bm-controls">
      <input v-model="search" type="text" class="bm-search" placeholder="Search models…" />
      <select v-model="sortCol" class="bm-sort">
        <option value="intelligence">Sort: Intelligence</option>
        <option value="speed">Sort: Speed</option>
        <option value="cost">Sort: Cost</option>
        <option value="name">Sort: Name</option>
        <option value="creator">Sort: Creator</option>
      </select>
      <button class="sort-dir-btn" @click="asc = !asc" :title="asc ? 'Ascending' : 'Descending'">
        {{ asc ? '↑' : '↓' }}
      </button>
    </div>

    <div v-if="filtered.length === 0" class="bm-empty">No benchmark data available yet.</div>

    <div v-else class="bm-table-wrap">
      <table class="bm-table">
        <thead>
          <tr>
            <th @click="setSort('name')" class="sortable">Model</th>
            <th @click="setSort('creator')" class="sortable">Creator</th>
            <th @click="setSort('intelligence')" class="sortable bm-num">Intelligence</th>
            <th @click="setSort('speed')" class="sortable bm-num">Speed</th>
            <th @click="setSort('cost')" class="sortable bm-num">Cost</th>
            <th>Sources</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in filtered"
            :key="entry.full_id"
            class="bm-row"
            @click="goModel(entry.slug)"
          >
            <td class="bm-name">
              <span class="bm-name-text">{{ entry.name }}</span>
              <span class="bm-provider-tag">{{ entry.provider }}</span>
            </td>
            <td class="bm-creator">{{ entry.creator || '—' }}</td>
            <td class="bm-num">
              <span
                v-if="entry.intelligence"
                class="bm-score"
                :class="scoreClass(entry.intelligence)"
                >{{ entry.intelligence }}</span
              >
              <span v-else class="bm-na">—</span>
            </td>
            <td class="bm-num">
              <span v-if="entry.speed" class="bm-score" :class="scoreClass(entry.speed / 2)">{{
                entry.speed
              }}</span>
              <span v-else class="bm-na">—</span>
            </td>
            <td class="bm-num">
              <span v-if="entry.cost" class="bm-score" :class="scoreClass(entry.cost)">{{
                entry.cost
              }}</span>
              <span v-else class="bm-na">—</span>
            </td>
            <td class="bm-sources">
              <span v-for="s in uniqueSources(entry.scores)" :key="s" class="bm-source-chip">{{
                s
              }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useModelsStore } from '@/store/models';
import type { ModelScore } from '@/types';

const router = useRouter();
const store = useModelsStore();

const search = ref('');
const sortCol = ref<'intelligence' | 'speed' | 'cost' | 'name' | 'creator'>('intelligence');
const asc = ref(false);

function uniqueSources(scores: ModelScore[]): string[] {
  return [...new Set(scores.map((s) => s.source).filter(Boolean))];
}

function setSort(col: typeof sortCol.value) {
  if (sortCol.value === col) asc.value = !asc.value;
  else {
    sortCol.value = col;
    asc.value = col === 'name' || col === 'creator';
  }
}

function scoreClass(v: number): string {
  if (v >= 80) return 'sc-high';
  if (v >= 50) return 'sc-mid';
  return 'sc-low';
}

const filtered = computed(() => {
  let list = [...store.benchmarkEntries];
  const q = search.value.trim().toLowerCase();
  if (q)
    list = list.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.creator || '').toLowerCase().includes(q),
    );
  const dir = asc.value ? 1 : -1;
  list.sort((a, b) => {
    switch (sortCol.value) {
      case 'intelligence':
        return ((a.intelligence ?? -1) - (b.intelligence ?? -1)) * dir;
      case 'speed':
        return ((a.speed ?? -1) - (b.speed ?? -1)) * dir;
      case 'cost':
        return ((a.cost ?? -1) - (b.cost ?? -1)) * dir;
      case 'name':
        return a.name.localeCompare(b.name) * dir;
      case 'creator':
        return (a.creator || '').localeCompare(b.creator || '') * dir;
    }
  });
  return list;
});

function goModel(slug: string) {
  router.push(`/model/${slug}`);
}
</script>

<style scoped>
.bm-page {
  max-width: 1200px;
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
  margin: 0 0 16px;
}

.bm-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.bm-search {
  font-size: 0.72rem;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  font-family: inherit;
  min-width: 200px;
  flex: 1;
  max-width: 320px;
}
.bm-search:focus {
  outline: none;
  border-color: var(--accent);
}
.bm-sort {
  font-size: 0.72rem;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-dim);
  font-family: inherit;
  cursor: pointer;
}
.sort-dir-btn {
  font-size: 0.8rem;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-dim);
  cursor: pointer;
  font-family: monospace;
}

.bm-empty {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.bm-table-wrap {
  overflow-x: auto;
}
.bm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
.bm-table th {
  text-align: left;
  padding: 8px 12px;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}
.bm-table th.sortable {
  cursor: pointer;
  user-select: none;
}
.bm-table th.sortable:hover {
  color: var(--accent);
}
.bm-num {
  text-align: right !important;
}

.bm-row {
  cursor: pointer;
  transition: background 0.1s;
}
.bm-row:hover {
  background: var(--bg-hover);
}
.bm-row td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.bm-name {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.bm-name-text {
  font-weight: 600;
  color: var(--accent);
}
.bm-provider-tag {
  font-size: 0.6rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}
.bm-creator {
  color: var(--text-dim);
  font-size: 0.7rem;
}

.bm-score {
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
}
.bm-score.sc-high {
  color: var(--green);
}
.bm-score.sc-mid {
  color: var(--orange);
}
.bm-score.sc-low {
  color: var(--red);
}
.bm-na {
  color: var(--text-muted);
  font-size: 0.7rem;
}

.bm-sources {
  display: flex;
  gap: 3px;
}
.bm-source-chip {
  padding: 1px 5px;
  font-size: 0.55rem;
  font-weight: 700;
  border-radius: 3px;
  background: var(--accent-subtle);
  color: var(--accent);
  white-space: nowrap;
}

@media (max-width: 768px) {
  .bm-page {
    padding: 12px;
  }
  .bm-search {
    max-width: 100%;
  }
}
</style>
