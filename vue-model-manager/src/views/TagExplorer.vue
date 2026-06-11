<template>
  <div class="te-page">
    <div class="page-header">
      <h2>Tag Explorer</h2>
      <p>Discover models by capability tags — click any tag to see matching models and related tags</p>
    </div>

    <!-- Stats row -->
    <div class="te-stats">
      <div class="te-stat"><span class="te-stat-val">{{ tagCount }}</span><span class="te-stat-lbl">Unique tags</span></div>
      <div class="te-stat"><span class="te-stat-val">{{ taggedModelCount }}</span><span class="te-stat-lbl">Tagged models</span></div>
      <div class="te-stat"><span class="te-stat-val">{{ avgTagsPerModel }}</span><span class="te-stat-lbl">Avg tags/model</span></div>
    </div>

    <!-- Selected tags -->
    <div v-if="selectedTags.length" class="te-selected">
      <span class="te-selected-label">Active filters:</span>
      <span v-for="tag in selectedTags" :key="tag" class="te-selected-tag" @click="removeTag(tag)">
        {{ tag }} ✕
      </span>
      <button class="te-clear-btn" @click="selectedTags = []">Clear all</button>
    </div>

    <!-- Tag cloud -->
    <div class="te-cloud">
      <span
        v-for="tag in visibleTags"
        :key="tag.name"
        class="te-tag"
        :class="{ active: selectedTags.includes(tag.name), disabled: selectedTags.length > 0 && !selectedTags.includes(tag.name) && !tag.related }"
        :style="{ fontSize: (0.65 + tag.count / maxCount * 1.2) + 'rem', opacity: selectedTags.length === 0 ? 1 : (selectedTags.includes(tag.name) || tag.related ? 1 : 0.3) }"
        @click="toggleTag(tag.name)"
      >
        {{ tag.name }}<span class="te-tag-count">{{ tag.count }}</span>
      </span>
    </div>

    <!-- Co-occurring tags (when a single tag is selected) -->
    <div v-if="selectedTags.length === 1 && coOccurring.length" class="te-co-section">
      <h3 class="section-title">Often paired with "{{ selectedTags[0] }}"</h3>
      <div class="te-co-chips">
        <span v-for="[tag, count] in coOccurring" :key="tag" class="te-co-chip" @click="addTag(tag)">
          {{ tag }} <strong>{{ count }}</strong>
        </span>
      </div>
    </div>

    <!-- Model list -->
    <div v-if="filteredModels.length" class="te-models">
      <h3 class="section-title">
        {{ selectedTags.length ? `Models matching: ${selectedTags.join(' + ')}` : 'All tagged models' }}
        <span class="te-count">({{ filteredModels.length }})</span>
      </h3>
      <div class="te-model-grid">
        <router-link v-for="m in filteredModels" :key="m.slug" :to="`/model/${m.slug}`" class="te-model-card">
          <span class="te-model-name">{{ m.name }}</span>
          <span class="te-model-creator">{{ m.creator }}</span>
          <div class="te-model-tags">
            <span v-for="tag in m.best_for" :key="tag" class="te-model-tag" :class="{ highlight: selectedTags.includes(tag) }">{{ tag }}</span>
          </div>
        </router-link>
      </div>
    </div>
    <div v-else-if="selectedTags.length" class="te-empty">No models match all selected tags.</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '@/store/models';

const store = useModelsStore();
const selectedTags = ref<string[]>([]);

// ── Build tag index ──
interface TagInfo { name: string; count: number; related: boolean }

const tagIndex = computed(() => {
  const counts = new Map<string, number>();
  const modelTags = new Map<string, string[]>();
  for (const m of store.allModels) {
    const tags = m.best_for || [];
    modelTags.set(m.slug, tags);
    for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return { counts, modelTags };
});

const tagCount = computed(() => tagIndex.value.counts.size);
const taggedModelCount = computed(() => {
  let count = 0;
  for (const [, tags] of tagIndex.value.modelTags) {
    if (tags.length > 0) count++;
  }
  return count;
});
const avgTagsPerModel = computed(() => {
  const m = store.allModels.filter(m => (m.best_for || []).length > 0);
  if (!m.length) return '0';
  const total = m.reduce((s, m) => s + (m.best_for || []).length, 0);
  return (total / m.length).toFixed(1);
});

const maxCount = computed(() => Math.max(...tagIndex.value.counts.values(), 1));

// ── Co-occurring tags ──
const coOccurring = computed(() => {
  if (selectedTags.value.length !== 1) return [];
  const sel = selectedTags.value[0];
  const co = new Map<string, number>();
  for (const m of store.allModels) {
    const tags = m.best_for || [];
    if (!tags.includes(sel)) continue;
    for (const t of tags) {
      if (t === sel) continue;
      if (selectedTags.value.includes(t)) continue;
      co.set(t, (co.get(t) || 0) + 1);
    }
  }
  return [...co.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
});

// ── Visible tags ──
const visibleTags = computed(() => {
  const tags: TagInfo[] = [];
  for (const [name, count] of tagIndex.value.counts) {
    let related = false;
    if (selectedTags.value.length > 0) {
      // Check if this tag co-occurs with any selected tags
      for (const m of store.allModels) {
        const mt = m.best_for || [];
        if (mt.includes(name) && selectedTags.value.some(t => mt.includes(t))) {
          related = true;
          break;
        }
      }
    }
    tags.push({ name, count, related });
  }
  return tags.sort((a, b) => a.name.localeCompare(b.name));
});

// ── Filtered models ──
const filteredModels = computed(() => {
  if (selectedTags.value.length === 0) {
    return store.allModels.filter(m => (m.best_for || []).length > 0).sort((a, b) => a.name.localeCompare(b.name));
  }
  return store.allModels
    .filter(m => {
      const tags = m.best_for || [];
      return selectedTags.value.every(t => tags.includes(t));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});

function toggleTag(tag: string) {
  const idx = selectedTags.value.indexOf(tag);
  if (idx >= 0) selectedTags.value.splice(idx, 1);
  else selectedTags.value.push(tag);
}

function addTag(tag: string) {
  if (!selectedTags.value.includes(tag)) selectedTags.value.push(tag);
}

function removeTag(tag: string) {
  selectedTags.value = selectedTags.value.filter(t => t !== tag);
}
</script>

<style scoped>
.te-page { max-width: 1200px; margin: 0 auto; padding: 20px; }
.page-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.page-header p { font-size: 0.78rem; color: var(--text-muted); margin: 0; }

.te-stats { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.te-stat { padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); display: flex; flex-direction: column; min-width: 100px; }
.te-stat-val { font-size: 1.1rem; font-weight: 700; color: var(--accent); }
.te-stat-lbl { font-size: 0.62rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }

.te-selected { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; background: var(--bg-elevated); }
.te-selected-label { font-size: 0.65rem; color: var(--text-dim); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.te-selected-tag { font-size: 0.65rem; padding: 3px 10px; border-radius: 999px; background: var(--accent-subtle); color: var(--accent); font-weight: 600; cursor: pointer; transition: background 0.12s; }
.te-selected-tag:hover { background: rgba(239,68,68,0.12); color: #ef4444; }
.te-clear-btn { font-size: 0.62rem; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border); background: transparent; color: var(--text-dim); cursor: pointer; font-family: inherit; }
.te-clear-btn:hover { border-color: var(--red); color: var(--red); }

/* Tag cloud */
.te-cloud { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-card); align-items: center; justify-content: center; line-height: 1.6; margin-bottom: 16px; }
.te-tag { display: inline-flex; align-items: center; gap: 3px; font-weight: 600; padding: 3px 10px; border-radius: 999px; color: var(--text-dim); cursor: pointer; transition: all 0.12s; border: 1px solid transparent; }
.te-tag:hover { color: var(--accent); background: var(--accent-subtle); border-color: var(--accent); }
.te-tag.active { color: var(--accent); background: var(--accent-subtle); border-color: var(--accent); }
.te-tag.disabled { cursor: default; }
.te-tag-count { font-size: 0.55em; font-family: 'JetBrains Mono', monospace; opacity: 0.7; }

/* Co-occurrence */
.te-co-section { margin-bottom: 16px; }
.te-co-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.te-co-chip { font-size: 0.68rem; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-dim); cursor: pointer; transition: all 0.12s; display: inline-flex; align-items: center; gap: 4px; }
.te-co-chip strong { font-family: 'JetBrains Mono', monospace; color: var(--accent); }
.te-co-chip:hover { border-color: var(--accent); color: var(--accent); }

/* Model grid */
.section-title { font-size: 1rem; font-weight: 700; margin: 20px 0 12px; }
.te-count { font-size: 0.7rem; font-weight: 400; color: var(--text-dim); }
.te-model-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
.te-model-card { padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); text-decoration: none; display: flex; flex-direction: column; gap: 4px; transition: border-color 0.12s; }
.te-model-card:hover { border-color: var(--accent); }
.te-model-name { font-size: 0.78rem; font-weight: 600; color: var(--text); }
.te-model-creator { font-size: 0.62rem; color: var(--text-dim); }
.te-model-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
.te-model-tag { font-size: 0.58rem; padding: 1px 6px; border-radius: 4px; background: var(--bg-elevated); color: var(--text-dim); }
.te-model-tag.highlight { background: var(--accent-subtle); color: var(--accent); font-weight: 600; }
.te-empty { padding: 32px 0; text-align: center; color: var(--text-muted); font-size: 0.85rem; }

@media (max-width: 768px) { .te-page { padding: 12px; } }
</style>
