# Update server/routes/data.js to include model_scores
with open('server/routes/data.js', 'r') as f:
    content = f.read()

# Add model_scores query after the featMap section, before outputModels
old = '''  const health = {};'''
new = '''  // Load model_scores
  const { rows: scoreRows } = await pool.query(
    'SELECT datapoint_model_id, source, score_type, score_value FROM model_scores'
  );
  const scoreMap = new Map();
  for (const r of scoreRows) {
    if (!scoreMap.has(r.datapoint_model_id)) scoreMap.set(r.datapoint_model_id, []);
    scoreMap.get(r.datapoint_model_id).push({
      source: r.source,
      score_type: r.score_type,
      score_value: r.score_value !== null ? Number(r.score_value) : null,
    });
  }

  const health = {};'''

content = content.replace(old, new)

# Add _model_scores to the return value
old2 = '''    _role_rankings: meta._role_rankings || { description: '', model: [], build: [], general: [], small_model: [], explore: [], stable: [] },'''
new2 = '''    _role_rankings: meta._role_rankings || { description: '', model: [], build: [], general: [], small_model: [], explore: [], stable: [] },
    _model_scores: {
      description: 'External benchmark scores by source',
      sources: ['artificial_analysis'],
      scores: scoreMap,
    },'''

content = content.replace(old2, new2)

with open('server/routes/data.js', 'w') as f:
    f.write(content)
print('Updated data.js')
