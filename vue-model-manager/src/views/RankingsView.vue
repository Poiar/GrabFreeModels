<template>
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
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useModelsStore } from '@/store/models';
import RankingExplorer from '@/components/RankingExplorer.vue';

const store = useModelsStore();

onMounted(() => {
  store.loadData();
});
</script>
