<template>
  <div>
    <div class="page-header">
      <h2>Rankings</h2>
      <p>Role-specific ranked lists of working, non-rate-limited free models</p>
    </div>

    <div v-for="role in roles" :key="role" class="ranking-section">
      <h3>{{ formatRole(role) }}</h3>
      <ul class="ranking-list">
        <li v-for="(modelId, index) in store.roleRankings[role] ?? []" :key="modelId">
          <span class="rank-num" :class="{ top3: index < 3 }">{{ index + 1 }}</span>
          <div class="rank-model-wrap">
            <span
              class="rank-model"
              :class="{ 'rank-used-up': store.isModelProviderUsedUp(modelId) }"
            >
              {{ modelId }}
            </span>
            <span class="rank-name">
              {{ store.getModelById(modelId)?.name ?? '' }}
            </span>
          </div>
          <span v-if="store.isModelProviderUsedUp(modelId)" class="badge badge-rate_limited ms-auto">
            used up
          </span>
        </li>
        <li v-if="(store.roleRankings[role] ?? []).length === 0" class="fst-italic text-muted">
          No models in this category
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModelsStore } from '@/store/models'

const store = useModelsStore()

const roles = ['model', 'build', 'general', 'small_model', 'explore', 'stable'] as const

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
</script>
