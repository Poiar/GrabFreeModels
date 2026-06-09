<template>
  <RankingExplorer
    :selected-variant="store.rankingVariant"
    :variant-options="store.availableRankingVariants"
    :model-scores="store.modelScores"
    @update:selected-variant="store.rankingVariant = $event"
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
