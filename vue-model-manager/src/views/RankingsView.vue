<template>
  <div class="rankings-page">
    <!-- Export buttons -->
    <div class="export-bar">
      <button class="export-btn" @click="handleExportCSV">Down CSV</button>
      <button class="export-btn" @click="handleExportJSON">Down JSON</button>
    </div>

    <!-- Free / Paid toggle -->
    <div class="rankings-toggle-bar">
      <button
        class="toggle-btn"
        :class="{ active: mode === 'free' }"
        @click="mode = 'free'"
      >Free</button>
      <button
        class="toggle-btn"
        :class="{ active: mode === 'paid' }"
        @click="switchToPaid"
      >Paid</button>
    </div>

    <!-- Free rankings -->
    <RankingExplorer
      v-if="mode === 'free'"
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

    <!-- Paid rankings -->
    <div v-else-if="mode === 'paid'">
      <div v-if="store.paidLoading" class="center-message">
        <p>Loading paid rankings...</p>
      </div>
      <div v-else-if="store.paidError" class="center-message error-box">
        <p>Failed to load paid rankings: {{ store.paidError }}</p>
      </div>
      <RankingExplorer
        v-else
        :rankings="store.paidRoleRankings"
        :scores="store.paidRoleScores"
        :meta="store.paidRoleMeta"
        :datapoint-by-id-fn="resolvePaidDatapoint"
        :role-variants="store.paidRoleVariants"
        :master-variant="store.paidMasterVariant"
        :variant-keys="store.paidVariantKeys"
        :model-scores="store.paidModelScores"
        @update:role-variant="(role: string, variant: string) => store.paidRoleVariants[role] = variant"
        @update:master-variant="(variant: string) => store.setPaidMaster(variant)"
        title="Role Rankings (Paid)"
        subtitle="See how paid models rank for each role and explore their score breakdowns"
      />
    </div>
  </div>
</template>

<style scoped>
.rankings-page { max-width: 1200px; margin: 0 auto; padding: 20px; }
.export-bar { display: flex; gap: 6px; margin-bottom: 8px; justify-content: flex-end; }
.export-btn { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-dim); cursor: pointer; font-family: inherit; transition: all 0.12s; }
.export-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-subtle); }

/* Free / Paid toggle */
.rankings-toggle-bar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  width: fit-content;
}

.toggle-btn {
  padding: 6px 18px;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--text-dim);
  transition: all 0.15s;
}

.toggle-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.toggle-btn.active {
  color: #fff;
  background: var(--accent);
}

.toggle-btn + .toggle-btn {
  border-left: 1px solid var(--border);
}

.center-message {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.error-box {
  color: var(--red);
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useModelsStore } from '@/store/models';
import { useExport } from '@/composables/useExport';
import RankingExplorer from '@/components/RankingExplorer.vue';
import type { ProviderDatapoint, ModelData, CreatorData } from '@/types';

const store = useModelsStore();
const mode = ref<'free' | 'paid'>('free');

onMounted(() => {
  store.loadData();
});

function switchToPaid() {
  mode.value = 'paid';
  store.loadPaidData();
}

function resolvePaidDatapoint(id: string): { dp: ProviderDatapoint; model: ModelData; creator: CreatorData } | undefined {
  return store.paidDatapointById.get(id);
}

// ── Export ──
const { exportJSON, exportCSV } = useExport();

const rankingRows = computed(() => {
  const rows: { rank: number; model_name: string; role: string }[] = [];
  const source = mode.value === 'free' ? store.roleRankings : store.paidRoleRankings;
  for (const [role, ranking] of Object.entries(source)) {
    if (!ranking?.length) continue;
    ranking.forEach((name: string, i: number) => {
      rows.push({ rank: i + 1, model_name: name, role });
    });
  }
  return rows;
});

function handleExportJSON() {
  exportJSON(rankingRows.value, `rankings-${mode.value}`);
}

function handleExportCSV() {
  const csvRows: string[][] = [];
  for (const r of rankingRows.value) {
    csvRows.push([String(r.rank), r.model_name, r.role]);
  }
  exportCSV(['rank', 'model_name', 'role'], csvRows, `rankings-${mode.value}`);
}
</script>
