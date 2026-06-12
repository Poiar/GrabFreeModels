<template>
  <div class="paid-rankings-wrapper">
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
      @update:role-variant="
        (role: string, variant: string) => (store.paidRoleVariants[role] = variant)
      "
      @update:master-variant="(variant: string) => store.setPaidMaster(variant)"
      title="Role Rankings (Paid)"
      subtitle="See how paid models rank for each role and explore their score breakdowns"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useModelsStore } from '@/store/models';
import RankingExplorer from '@/components/RankingExplorer.vue';
import type { ProviderDatapoint, ModelData, CreatorData } from '@/types';

const store = useModelsStore();

function resolvePaidDatapoint(
  id: string,
): { dp: ProviderDatapoint; model: ModelData; creator: CreatorData } | undefined {
  return store.paidRankingsDatapointById(id);
}

onMounted(() => {
  store.loadPaidRankings();
});
</script>

<style scoped>
.paid-rankings-wrapper {
  width: 100%;
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
