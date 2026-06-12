<template>
  <div class="psg-page">
    <div class="page-header">
      <h2>Provider Status Grid</h2>
      <p>Daily uptime per provider — last 7 days from model health snapshots</p>
    </div>
    <div v-if="gridData.length === 0" class="psg-empty">
      No uptime data available. Run model health snapshots to populate.
    </div>
    <div v-else class="psg-grid-wrap">
      <table class="psg-grid">
        <thead>
          <tr>
            <th class="psg-prov-col">Provider</th>
            <th v-for="d in dates" :key="d" class="psg-day-col">{{ d }}</th>
            <th class="psg-total-col">%</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in gridData" :key="row.slug">
            <td class="psg-prov-cell">
              <router-link :to="'/provider/' + row.slug" class="psg-prov-link">{{
                row.name
              }}</router-link>
            </td>
            <td
              v-for="d in dates"
              :key="d"
              class="psg-day-cell"
              :class="'psg-' + (row.days[d] || 'no')"
              :title="row.slug + ' on ' + d + ': ' + (row.days[d] || 'no data')"
            >
              <span class="psg-cell-dot" :class="'psg-dot-' + (row.days[d] || 'no')"></span>
            </td>
            <td class="psg-total-cell">
              <strong>{{ row.uptime }}%</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useModelsStore } from '@/store/models';
const store = useModelsStore();

interface GridRow {
  slug: string;
  name: string;
  days: Record<string, string>;
  uptime: number;
}

const dates = computed(() => {
  const result: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().slice(0, 5));
  }
  return result;
});

const gridData = computed((): GridRow[] => {
  const provDays = new Map<string, Map<string, { working: number; total: number }>>();
  for (const model of store.allModels) {
    for (const dp of model.providers) {
      if (dp._removed) continue;
      const history = store.getModelHealth(dp.full_id);
      if (!history?.snapshots?.length) continue;
      const slug = dp.provider_slug;
      if (!provDays.has(slug)) provDays.set(slug, new Map());
      const dayMap = provDays.get(slug)!;
      for (const snap of history.snapshots) {
        const day = snap.date?.slice(0, 5);
        if (!day) continue;
        if (!dayMap.has(day)) dayMap.set(day, { working: 0, total: 0 });
        const entry = dayMap.get(day)!;
        entry.total++;
        if (snap.status === 'working') entry.working++;
      }
    }
  }
  const result: GridRow[] = [];
  for (const [slug, dayMap] of provDays) {
    const name = store.visibleProviderRefs.find((p) => p.slug === slug)?.name || slug;
    const days: Record<string, string> = {};
    let totalWorking = 0,
      totalChecks = 0;
    for (const d of dates.value) {
      const e = dayMap.get(d);
      if (!e || e.total === 0) {
        days[d] = 'no';
        continue;
      }
      totalWorking += e.working;
      totalChecks += e.total;
      const rate = e.working / e.total;
      days[d] = rate >= 0.8 ? 'up' : rate >= 0.5 ? 'degraded' : 'down';
    }
    result.push({
      slug,
      name,
      days,
      uptime: totalChecks > 0 ? Math.round((totalWorking / totalChecks) * 100) : 0,
    });
  }
  result.sort((a, b) => b.uptime - a.uptime);
  return result;
});
</script>

<style scoped>
.psg-page {
  max-width: 1100px;
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
.psg-empty {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
  font-size: 0.85rem;
}
.psg-grid-wrap {
  overflow-x: auto;
}
.psg-grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.72rem;
}
.psg-grid th {
  padding: 6px 8px;
  text-align: center;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  border-bottom: 2px solid var(--border);
}
.psg-prov-col {
  text-align: left !important;
  min-width: 120px;
}
.psg-day-col {
  width: 36px;
}
.psg-total-col {
  width: 40px;
}
.psg-prov-cell {
  padding: 8px;
}
.psg-prov-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.7rem;
}
.psg-prov-link:hover {
  text-decoration: underline;
}
.psg-day-cell {
  text-align: center;
  padding: 8px 4px;
}
.psg-cell-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.psg-dot-up {
  background: var(--green);
}
.psg-dot-degraded {
  background: var(--orange);
}
.psg-dot-down {
  background: var(--red);
}
.psg-dot-no {
  background: var(--border);
}
.psg-total-cell {
  text-align: center;
  padding: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
}
tr {
  border-bottom: 1px solid var(--border);
}
tr:hover {
  background: var(--bg-hover);
}
@media (max-width: 768px) {
  .psg-page {
    padding: 12px;
  }
}
</style>
