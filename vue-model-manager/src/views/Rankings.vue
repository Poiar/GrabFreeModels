<template>
  <div>
<div class="page-header">
    <h2>Rankings</h2>
    <p>Role-specific ranked lists of working, non-rate-limited free models</p>
  </div>

  <div class="filters">
    <input type="text" v-model="searchTerm" placeholder="Search models…" class="search-input" />
  </div>

  <div class="filters">
    <input v-model="searchTerm" type="text" placeholder="Search models…" class="search-input" />
    <select v-model="sortBy">
      <option value="rank">Rank</option>
      <option value="role">Role</option>
      <option value="name">Name</option>
      <option value="provider">Provider</option>
      <option value="status">Status</option>
      <option value="context">Context</option>
    </select>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="sortable" :class="{ active: sortBy === 'rank' }" @click="setSort('rank')">
            Rank <span class="sort-indicator">{{ sortIndicator('rank') }}</span>
          </th>
          <th class="sortable" :class="{ active: sortBy === 'role' }" @click="setSort('role')">
            Role <span class="sort-indicator">{{ sortIndicator('role') }}</span>
          </th>
          <th class="sortable" :class="{ active: sortBy === 'name' }" @click="setSort('name')">
            Model <span class="sort-indicator">{{ sortIndicator('name') }}</span>
          </th>
          <th>Provider</th>
          <th class="sortable" :class="{ active: sortBy === 'status' }" @click="setSort('status')">
            Status <span class="sort-indicator">{{ sortIndicator('status') }}</span>
          </th>
          <th class="sortable" :class="{ active: sortBy === 'context' }" @click="setSort('context')">
            Context <span class="sort-indicator">{{ sortIndicator('context') }}</span>
          </th>
          <th>Best For</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in sortedItems" :key="item.modelId">
          <td>#{{ roleRanks[item.modelId] ?? '?' }}</td>
          <td>{{ formatRole(item.role) }}</td>
          <td>
            <div class="model-name">{{ store.getModelById(item.modelId)?.name ?? item.modelId }}</div>
            <div class="model-id">{{ item.modelId }}</div>
          </td>
          <td>{{ item.model?.provider ?? '' }}</td>
          <td>
            <span class="badge" :class="`badge-${item.model?.status?.result ?? ''}`">
              {{ item.model?.status?.result ?? '' }}
            </span>
          </td>
          <td>
            <span class="context-len" v-if="item.model?.context_length">
              {{ Math.round((item.model?.context_length ?? 0)/1000) }}K
            </span>
          </td>
          <td>
            <div class="best-for-tags">
              <span class="tag" v-for="tag in item.model?.best_for?.slice(0,3)" :key="tag">{{ tag }}</span>
              <span class="tag" v-if="(item.model?.best_for?.length ?? 0) > 3">
                +{{ (item.model?.best_for?.length ?? 0) - 3 }}
              </span>
            </div>
          </td>
        </tr>
        <tr v-if="sortedItems.length === 0">
          <td colspan="7" class="fst-italic text-muted">No models match the filter</td>
        </tr>
      </tbody>
    </table>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useModelsStore } from '@/store/models'

const store = useModelsStore()

const roles = ['model', 'build', 'general', 'small_model', 'explore', 'stable'] as const

const searchTerm = ref('')

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Flatten all role rankings into a single list while preserving role information
const flatRankings = computed(() => {
  const list: { modelId: string; role: string }[] = []
  for (const role of roles) {
    const arr = store.roleRankings[role] ?? []
    for (const id of arr) {
      list.push({ modelId: id, role })
    }
  }
  return list
})

// Compute filtered flat list based on search term (matches name or id)
const filteredFlatRankings = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) return flatRankings.value
  return flatRankings.value.filter(item => {
    const model = store.getModelById(item.modelId)
    const name = model?.name?.toLowerCase() ?? ''
    const lowerId = item.modelId.toLowerCase()
    return name.includes(term) || lowerId.includes(term)
  })
})

// Map each modelId to its rank **within its role** (1‑based)
const roleRanks = computed(() => {
  const map: Record<string, number> = {}
  for (const role of roles) {
    const list = store.roleRankings[role] ?? []
    list.forEach((id, idx) => {
      map[id] = idx + 1
    })
  }
  return map
})

// Sorting state
const sortBy = ref('rank')
const sortDesc = ref(false)

function setSort(field: string) {
  if (sortBy.value === field) {
    sortDesc.value = !sortDesc.value
  } else {
    sortBy.value = field
    sortDesc.value = false
  }
}

function sortIndicator(field: string): string {
  if (sortBy.value !== field) return '⇅'
  return sortDesc.value ? '↓' : '↑'
}

// Prepare items with model data for table
const tableItems = computed(() => {
  return filteredFlatRankings.value.map(item => ({
    ...item,
    model: store.getModelById(item.modelId)
  }))
})

const sortedItems = computed(() => {
  const arr = [...tableItems.value]
  arr.sort((a, b) => {
    let av: any = a
    let bv: any = b
    switch (sortBy.value) {
      case 'rank':
        av = roleRanks.value[a.modelId] ?? Infinity
        bv = roleRanks.value[b.modelId] ?? Infinity
        break
      case 'role':
        av = a.role
        bv = b.role
        break
      case 'name':
        av = a.model?.name ?? ''
        bv = b.model?.name ?? ''
        break
      case 'provider':
        av = a.model?.provider ?? ''
        bv = b.model?.provider ?? ''
        break
      case 'status':
        av = a.model?.status?.result ?? ''
        bv = b.model?.status?.result ?? ''
        break
      case 'context':
        av = a.model?.context_length ?? 0
        bv = b.model?.context_length ?? 0
        break
      default:
        av = ''
        bv = ''
    }
    if (av < bv) return sortDesc.value ? 1 : -1
    if (av > bv) return sortDesc.value ? -1 : 1
    return 0
  })
  return arr
})


</script>
