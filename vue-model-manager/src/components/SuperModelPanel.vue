<template>
  <Teleport to="body">
    <Transition name="panel-slide">
      <div v-if="open" class="smp-backdrop" @click.self="close">
        <div class="smp-panel">
          <!-- Header -->
          <div class="smp-header">
            <div class="smp-header-left">
              <button class="smp-nav-btn" :disabled="!hasPrev" title="Previous super model" @click="goPrev">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 class="smp-title">{{ model.name }}</h2>
              <span class="smp-creator-badge">{{ creatorName }}</span>
            </div>
            <button class="smp-close" aria-label="Close panel" @click="close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- Meta -->
          <div class="smp-meta">
            <span v-if="model.family" class="smp-meta-item">Family: {{ model.family }}</span>
            <span v-if="model.best_for.length" class="smp-meta-item">Best for: {{ model.best_for.join(', ') }}</span>
            <span class="smp-meta-item">Context: {{ panelContextLabel }}</span>
            <span v-if="bestKnowledge" class="smp-meta-item">Knowledge: {{ bestKnowledge }}</span>
            <span class="smp-meta-item">{{ activeCount }} working / {{ totalCount }} providers</span>
            <span v-if="anyAttachment" class="smp-cap-badge smp-cap-attach" title="Attachment">Attach</span>
            <span v-if="anyStructuredOutput" class="smp-cap-badge smp-cap-struct" title="Structured output">Struct</span>
          </div>

          <!-- Role rankings -->
          <div v-if="Object.keys(model.role_rankings).length" class="smp-rankings">
            <span v-for="(rank, role) in model.role_rankings" :key="role" class="smp-ranking-badge">
              #{{ rank }} {{ roleLabel(role as string) }}
            </span>
          </div>

          <!-- Fine-tune tree -->
          <div class="smp-finetune-section">
            <FineTuneTree :root-slug="model.slug" />
          </div>

          <!-- Provider instances -->
          <h3 class="smp-section-title">Instances ({{ model.providers.length }})</h3>
          <ProviderTable :providers="model.providers" />

          <!-- Known issues -->
          <div v-if="modelIssues.length" class="smp-issues">
            <h3 class="smp-section-title">Known Issues</h3>
            <div v-for="issue in modelIssues" :key="issue.issue" class="smp-issue">
              <span class="smp-issue-severity" :class="`severity-${issue.severity}`">{{ issue.severity }}</span>
              <p class="smp-issue-text">{{ issue.issue }}</p>
            </div>
          </div>

          <!-- All tags -->
          <div v-if="allTags.length" class="smp-tags-section">
            <h3 class="smp-section-title">Tags</h3>
            <div class="smp-tags">
              <span v-for="t in allTags" :key="t" class="smp-tag">{{ t }}</span>
            </div>
          </div>

          <!-- Next button -->
          <button v-if="hasNext" class="smp-next-btn" @click="goNext">
            Next super model →
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import ProviderTable from '@/components/ProviderTable.vue';
import FineTuneTree from '@/components/FineTuneTree.vue';
import type { ModelData, KnownIssue } from '@/types';
import { useModelsStore } from '@/store/models';

const props = defineProps<{
  open: boolean;
  model: ModelData;
  modelIndex: number;
  modelList: ModelData[];
}>();

const emit = defineEmits<{
  close: [];
  'navigate-to': [index: number];
}>();

const store = useModelsStore();

function close() {
  emit('close');
}

const hasPrev = computed(() => props.modelIndex > 0);
const hasNext = computed(() => props.modelIndex < props.modelList.length - 1);

function goPrev() {
  if (!hasPrev.value) return;
  emit('navigate-to', props.modelIndex - 1);
}

function goNext() {
  if (!hasNext.value) return;
  emit('navigate-to', props.modelIndex + 1);
}

const creatorName = computed(() => {
  for (const c of store.visibleCreators) {
    if (c.models.some(m => m.super_id === props.model.super_id)) return c.name;
  }
  return 'Unknown';
});

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

const panelContextLabel = computed(() => {
  const maxCtx = props.model.best_context;
  const minCtx = props.model.min_context;
  if (!maxCtx && !minCtx) return '—';
  if (!minCtx || minCtx === maxCtx) return `up to ${formatContext(maxCtx!)}`;
  return `${formatContext(minCtx)}–${formatContext(maxCtx!)}`;
});

const activeCount = computed(() =>
  props.model.providers.filter(p => !p._removed && p.status.result === 'working').length,
);
const totalCount = computed(() => props.model.providers.filter(p => !p._removed).length);

const bestKnowledge = computed(() => {
  const dates = props.model.providers
    .map(p => p.knowledge_cutoff)
    .filter((k): k is string => !!k)
    .sort()
    .reverse();
  return dates.length > 0 ? dates[0].slice(0, 7) : null;
});

const anyAttachment = computed(() =>
  props.model.providers.some(p => p.supports_attachment),
);
const anyStructuredOutput = computed(() =>
  props.model.providers.some(p => p.supports_structured_output),
);

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    model: 'Model',
    build: 'Build',
    general: 'General',
    small_model: 'Small',
    explore: 'Explore',
    stable: 'Stable',
  };
  return labels[role] || role;
}

const modelIssues = computed((): KnownIssue[] => {
  const issues = store.knownIssues;
  if (!issues.length) return [];
  const providerIds = new Set(props.model.providers.map(p => p.full_id));
  return issues.filter(i => providerIds.has(i.model_id));
});

const allTags = computed(() => {
  const tags = new Set<string>();
  for (const p of props.model.providers) {
    for (const t of p.tags) tags.add(t);
    for (const b of p.best_for) tags.add(b);
  }
  return [...tags].sort();
});

function onKey(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape') close();
  if (e.key === 'ArrowLeft') goPrev();
  if (e.key === 'ArrowRight') goNext();
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    }
  },
);
</script>

<style scoped>
.smp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: flex-end;
}

.smp-panel {
  width: min(90vw, 900px);
  height: 100dvh;
  background: var(--bg);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  padding: 20px 24px;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.2s ease;
}
.panel-slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.panel-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.smp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.smp-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.smp-nav-btn {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
}

.smp-nav-btn:hover:not(:disabled) {
  background: var(--bg-elevated);
  color: var(--text);
}
.smp-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.smp-title {
  font-size: 1.2rem;
  font-weight: 700;
  margin: 0;
}

.smp-creator-badge {
  padding: 2px 10px;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
}

.smp-close {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
}

.smp-close:hover {
  background: var(--bg-elevated);
  color: var(--text);
}

.smp-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.smp-meta-item {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.smp-cap-badge {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.smp-cap-attach {
  background: rgba(96, 165, 250, 0.15);
  color: var(--blue);
}

.smp-cap-struct {
  background: rgba(167, 139, 250, 0.15);
  color: var(--purple);
}

.smp-rankings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.smp-ranking-badge {
  padding: 3px 10px;
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
}

.smp-finetune-section {
  margin-top: 16px;
}

.smp-section-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 20px 0 10px;
  color: var(--text);
}

.smp-issues {
  margin-top: 20px;
}

.smp-issue {
  display: flex;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.smp-issue-severity {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  height: fit-content;
}

.severity-critical {
  background: var(--red);
  color: #fff;
}
.severity-high {
  background: var(--orange);
  color: #fff;
}
.severity-moderate {
  background: #eab308;
  color: #000;
}
.severity-low {
  background: var(--text-muted);
  color: #fff;
}

.smp-issue-text {
  font-size: 0.78rem;
  color: var(--text);
  margin: 0;
}

.smp-tags-section {
  margin-top: 20px;
}

.smp-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.smp-tag {
  padding: 2px 8px;
  font-size: 0.65rem;
  font-weight: 500;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--text-dim);
}

.smp-next-btn {
  display: block;
  width: 100%;
  padding: 12px;
  margin-top: 24px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
}

.smp-next-btn:hover {
  border-color: var(--accent);
}

@media (max-width: 768px) {
  .smp-panel {
    width: 100vw;
    border-left: none;
  }
}
</style>
