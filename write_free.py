with open('vue-model-manager/src/views/Free.vue', 'r') as f:
    content = f.read()

# 1. Add scoring source dropdown in template, after the role pills div
old_template = '''      <div class="sort-controls">
        <select v-model="sortBy" class="sort-select">
          <option value="rank">Sort: Rank</option>
          <option value="score">Sort: Score</option>
          <option value="name">Sort: Name</option>
          <option value="author">Sort: Author</option>
          <option value="provider">Sort: Provider</option>
          <option value="context">Sort: Context</option>
        </select>'''

new_template = '''      <div class="scoring-source">
        <select v-model="scoringSource" class="sort-select scoring-select">
          <option value="internal">Scoring: Internal</option>
          <option v-for="src in availableSources" :key="src.id" :value="src.id">Scoring: {{ src.label }}</option>
        </select>
      </div>
      <div class="sort-controls">
        <select v-model="sortBy" class="sort-select">
          <option value="rank">Sort: Rank</option>
          <option value="score">Sort: Score</option>
          <option value="name">Sort: Name</option>
          <option value="author">Sort: Author</option>
          <option value="provider">Sort: Provider</option>
          <option value="context">Sort: Context</option>
        </select>'''

content = content.replace(old_template, new_template)

# 2. Add scoring source logic in script, after the ROLES constant
old_script = '''const ROLES = ['model', 'build', 'general', 'small_model', 'explore'] as const
type Role = (typeof ROLES)[number]'''

new_script = '''const ROLES = ['model', 'build', 'general', 'small_model', 'explore'] as const
type Role = (typeof ROLES)[number]

const SCORING_SOURCES = [
  { id: 'internal', label: 'Internal' },
  { id: 'artificial_analysis', label: 'Artificial Analysis' },
] as const

const scoringSource = ref('internal')

const availableSources = computed(() => {
  const sources = SCORING_SOURCES.filter(s => s.id !== 'internal')
  // Only show sources that actually have data
  return sources.filter(s => {
    const scores = store.modelScores
    if (!scores || !scores.scores) return false
    const scoreMap = scores.scores instanceof Map ? scores.scores : new Map(Object.entries(scores.scores).map(([k, v]) => [Number(k), v]))
    for (const [, scoresArr] of scoreMap) {
      if (scoresArr && scoresArr.some(sc => sc.source === s.id)) return true
    }
    return false
  })
})

// Get external score for a model
function getExternalScore(modelId: string, source: string): number | null {
  const scores = store.modelScores
  if (!scores || !scores.scores) return null
  const scoreMap = scores.scores instanceof Map ? scores.scores : new Map(Object.entries(scores.scores).map(([k, v]) => [Number(k), v]))
  const modelScoresArr = scoreMap.get(Number(modelId))
  if (!modelScoresArr) return null
  // For external sources, use the 'intelligence' score type, or the first available
  const score = modelScoresArr.find(s => s.source === source && s.score_type === 'intelligence')
    || modelScoresArr.find(s => s.source === source)
  return score ? score.score_value : null
}'''

content = content.replace(old_script, new_script)

# 3. Modify sortedItems to handle external scoring
old_sort = '''const sortedItems = computed(() => {
  const arr = filtered.value.map(mr => ({
    ...mr,
    model: store.getModelById(mr.modelId),
  }))
  arr.sort((a, b) => {
    let cmp = 0
    switch (sortBy.value) {
      case 'rank':
        cmp = a.roleRank - b.roleRank
        if (cmp === 0) cmp = (STATUS_ORDER[a.model?.status?.result ?? ''] ?? 5) - (STATUS_ORDER[b.model?.status?.result ?? ''] ?? 5)
        if (cmp === 0) cmp = bestRoleOrder(a) - bestRoleOrder(b)
        break
      case 'score':
        cmp = (itemScore(a.modelId)?.score ?? 0) - (itemScore(b.modelId)?.score ?? 0)
        break'''

new_sort = '''const sortedItems = computed(() => {
  const arr = filtered.value.map(mr => ({
    ...mr,
    model: store.getModelById(mr.modelId),
    externalScore: scoringSource.value !== 'internal' ? getExternalScore(mr.modelId, scoringSource.value) : null,
  }))
  arr.sort((a, b) => {
    let cmp = 0
    // When using external scoring, sort by external score first
    if (scoringSource.value !== 'internal') {
      const scoreA = a.externalScore ?? -Infinity
      const scoreB = b.externalScore ?? -Infinity
      cmp = scoreB - scoreA // Higher is better for external scores
      if (cmp !== 0) return cmp
    }
    switch (sortBy.value) {
      case 'rank':
        cmp = a.roleRank - b.roleRank
        if (cmp === 0) cmp = (STATUS_ORDER[a.model?.status?.result ?? ''] ?? 5) - (STATUS_ORDER[b.model?.status?.result ?? ''] ?? 5)
        if (cmp === 0) cmp = bestRoleOrder(a) - bestRoleOrder(b)
        break
      case 'score':
        cmp = (itemScore(a.modelId)?.score ?? 0) - (itemScore(b.modelId)?.score ?? 0)
        break'''

content = content.replace(old_sort, new_sort)

# 4. Reset sort when switching scoring source
old_watch = '''watch(() => roleFilter.value, () => writeQueryToUrl(jql.rawQuery.value ?? ''))'''
new_watch = '''watch(() => roleFilter.value, () => writeQueryToUrl(jql.rawQuery.value ?? ''))
watch(() => scoringSource.value, () => {
  sortBy.value = 'rank'
  sortDesc.value = false
})'''

content = content.replace(old_watch, new_watch)

with open('vue-model-manager/src/views/Free.vue', 'w') as f:
  f.write(content)
print('Updated Free.vue')
