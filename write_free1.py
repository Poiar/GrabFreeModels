with open('vue-model-manager/src/views/Free.vue', 'r', encoding='utf-8') as f:
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

with open('vue-model-manager/src/views/Free.vue', 'w', encoding='utf-8') as f:
    f.write(content)
print('Step 1 done: template dropdown added')
