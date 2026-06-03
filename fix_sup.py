with open('vue-model-manager/src/views/SuperModel.vue', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Remove the unused roleRankings computed (lines 222-237)
old = '''const roleRankings = computed(() => {
  if (!super_.value) return []
  const ROLES = ['model', 'build', 'general', 'small_model', 'explore', 'stable']
  const result: { role: string; label: string; rank: number }[] = []
  for (const role of ROLES) {
    const arr = store.roleRankings[role] ?? []
    let bestRank = Infinity
    for (const dp of super_.value.datapoints) {
      const idx = arr.indexOf(dp.id)
      if (idx !== -1 && idx + 1 < bestRank) bestRank = idx + 1
    }
    if (bestRank < Infinity) result.push({ role, label: role.slice(0, 3).toUpperCase(), rank: bestRank })
  }
  result.sort((a, b) => a.rank - b.sort)
  return result
})'''

new = '''// roleRankings removed - was unused'''

c = c.replace(old, new)

with open('vue-model-manager/src/views/SuperModel.vue', 'w', encoding='utf-8') as f:
    f.write(c)
print('Fixed SuperModel.vue')
