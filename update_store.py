with open('vue-model-manager/src/store/models.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Import ModelScore and ModelScoresData types
content = content.replace(
    \"import type { ModelsData, DatapointModel, MasterModel, RoleScore, RoleMeta } from '@/types'\",
    \"import type { ModelsData, DatapointModel, MasterModel, RoleScore, RoleMeta, ModelScoresData } from '@/types'\"
)

# Add modelScores computed after roleMeta
old = '  const roleMeta = computed(() => data.value?._role_rankings?._meta ?? {} as Record<string, RoleMeta>)'
new = '''  const roleMeta = computed(() => data.value?._role_rankings?._meta ?? {} as Record<string, RoleMeta>)

  const modelScores = computed((): ModelScoresData | null => {
    const raw = data.value?._model_scores
    if (!raw) return null
    return raw as ModelScoresData
  })'''
content = content.replace(old, new)

# Add modelScores to return
content = content.replace(
    '    modelById, getModelById, loadData,\n',
    '    modelById, getModelById, loadData, modelScores,\n'
)

with open('vue-model-manager/src/store/models.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('OK - store updated')
