with open('vue-model-manager/src/types.ts', 'r') as f:
    content = f.read()

# Add ModelScore interface before ModelsData
old = 'export interface ModelsData {'
new = '''export interface ModelScore {
  source: string
  score_type: string
  score_value: number | null
}

export interface ModelScoresData {
  description: string
  sources: string[]
  scores: Map<number, ModelScore[]> | Record<number, ModelScore[]>
}

export interface ModelsData {'''

content = content.replace(old, new)

# Add _model_scores to ModelsData interface
old2 = '''  _role_rankings: {
    description: string
    model: string[]
    build: string[]
    general: string[]
    small_model: string[]
    explore: string[]
    stable: string[]
    _scores?: Record<string, RoleScore[]>
    _meta?: Record<string, RoleMeta>
  }'''
new2 = '''  _role_rankings: {
    description: string
    model: string[]
    build: string[]
    general: string[]
    small_model: string[]
    explore: string[]
    stable: string[]
    _scores?: Record<string, RoleScore[]>
    _meta?: Record<string, RoleMeta>
  }
  _model_scores: ModelScoresData'''

content = content.replace(old2, new2)

with open('vue-model-manager/src/types.ts', 'w') as f:
    f.write(content)
print('Updated types.ts')
