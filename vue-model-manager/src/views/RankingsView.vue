<template>
  <div class="rankings-page">
    <!-- Export buttons -->
    <div class="export-bar">
      <button class="export-btn" @click="handleExportCSV">Down CSV</button>
      <button class="export-btn" @click="handleExportJSON">Down JSON</button>
    </div>

    <RankingExplorer
      :rankings="store.roleRankings"
      :scores="store.roleScores"
      :meta="store.roleMeta"
      :role-variants="store.freeRoleVariants"
      :master-variant="store.freeMasterVariant"
      :variant-keys="store.freeVariantKeys"
      :model-scores="store.modelScores"
      @update:role-variant="(role: string, variant: string) => store.freeRoleVariants[role] = variant"
      @update:master-variant="(variant: string) => store.setFreeMaster(variant)"
    />
  </div>
</template>

<style scoped>
.rankings-page { max-width: 1200px; margin: 0 auto; padding: 20px; }
.export-bar { display: flex; gap: 6px; margin-bottom: 12px; justify-content: flex-end; }
.export-btn { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-dim); cursor: pointer; font-family: inherit; transition: all 0.12s; }
.export-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-subtle); }
</style>

<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useModelsStore } from '@/store/models';
import { useExport } from '@/composables/useExport';
import RankingExplorer from '@/components/RankingExplorer.vue';

const store = useModelsStore();

onMounted(() => {
  store.loadData();
});

// ── Export ──
const { exportJSON, exportCSV } = useExport();

const rankingRows = computed(() => {
  const rows: { rank: number; model_name: string; role: string }[] = [];
  for (const [role, ranking] of Object.entries(store.roleRankings)) {
    if (!ranking?.length) continue;
    ranking.forEach((name: string, i: number) => {
      rows.push({ rank: i + 1, model_name: name, role });
    });
  }
  return rows;
});

function handleExportJSON() {
  exportJSON(rankingRows.value, 'rankings');
}

function handleExportCSV() {
  const csvRows: string[][] = [];
  for (const r of rankingRows.value) {
    csvRows.push([String(r.rank), r.model_name, r.role]);
  }
  exportCSV(['rank', 'model_name', 'role'], csvRows, 'rankings');
}
</script>
