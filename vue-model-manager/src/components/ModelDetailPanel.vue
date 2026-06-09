<template>
  <Teleport to="body">
    <Transition name="panel-slide">
      <div v-if="open" class="detail-panel-backdrop" @click.self="close">
        <div class="detail-panel">
          <!-- Header -->
          <div class="dp-header">
            <div class="dp-header-left">
              <button class="dp-back" :disabled="!hasPrev" title="Previous model" @click="goPrev">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 class="dp-title">{{ model.name }}</h2>
              <span class="dp-creator-badge">{{ creator.name }}</span>
            </div>
            <button class="dp-close" aria-label="Close panel" @click="close">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- Meta info -->
          <div class="dp-meta">
            <span v-if="model.family" class="dp-meta-item">Family: {{ model.family }}</span>
            <span v-if="model.best_for.length" class="dp-meta-item"
              >Best for: {{ model.best_for.join(', ') }}</span
            >
            <span v-if="lineageChain.length > 0" class="dp-meta-item">
              <span v-if="model.derivation_method" class="dp-deriv-badge">{{ derivationLabel }}</span>
              Based on:
              <template v-for="(ancestor, i) in lineageChain" :key="i">
                <router-link v-if="ancestor.slug" :to="`/model/${ancestor.slug}`" class="dp-meta-link">{{ ancestor.name }}</router-link>
                <span v-else>{{ ancestor.name }}</span>
                <span v-if="i < lineageChain.length - 1"> → </span>
              </template>
              <span class="dp-depth-badge">Depth: {{ lineageChain.length }}</span>
            </span>
            <span v-else-if="model.base_creator && model.base_creator !== model.creator" class="dp-meta-item">
              Based on: {{ model.base_creator }} architecture
            </span>
            <span class="dp-meta-item">Context: up to {{ formatContext(model.best_context) }}</span>
            <span class="dp-meta-item"
              >{{ activeCount }} working / {{ totalCount }} providers</span
            >
          </div>

          <!-- Role rankings -->
          <div v-if="Object.keys(model.role_rankings).length" class="dp-rankings">
            <span v-for="(rank, role) in model.role_rankings" :key="role" class="dp-ranking-badge">
              #{{ rank }} {{ roleLabel(role) }}
            </span>
          </div>

          <!-- Recursive fine-tune tree -->
          <div class="dp-finetunes">
            <FineTuneTree :root-slug="model.slug" />
          </div>

          <!-- Provider comparison table -->
          <h3 class="dp-section-title">Providers ({{ model.providers.length }})</h3>
          <ProviderTable :providers="model.providers" />

          <!-- Known issues -->
          <div v-if="modelIssues.length" class="dp-issues">
            <h3 class="dp-section-title">Known Issues</h3>
            <div v-for="issue in modelIssues" :key="issue.issue" class="dp-issue">
              <span class="dp-issue-severity" :class="`severity-${issue.severity}`">{{
                issue.severity
              }}</span>
              <p class="dp-issue-text">{{ issue.issue }}</p>
            </div>
          </div>

          <!-- Next button -->
          <button v-if="hasNext" class="dp-next-btn" :disabled="!hasNext" @click="goNext">
            Next model →
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
import type { ModelData, CreatorData, KnownIssue } from '@/types';
import { useModelsStore } from '@/store/models';

const props = defineProps<{
  open: boolean;
  model: ModelData;
  creator: CreatorData;
}>();

const emit = defineEmits<{
  close: [];
  'navigate-to': [{ model: ModelData; creator: CreatorData }];
}>();

const store = useModelsStore();

function close() {
  emit('close');
}

const allModelList = computed(() => {
  const list: Array<{ model: ModelData; creator: CreatorData }> = [];
  for (const c of store.creators) {
    for (const m of c.models) {
      list.push({ model: m, creator: c });
    }
  }
  return list;
});

const currentIndex = computed(() => {
  return allModelList.value.findIndex((entry) => entry.model.super_id === props.model.super_id);
});

const hasPrev = computed(() => currentIndex.value > 0);
const hasNext = computed(() => currentIndex.value < allModelList.value.length - 1);

function goPrev() {
  if (!hasPrev.value) return;
  const entry = allModelList.value[currentIndex.value - 1];
  emit('navigate-to', entry);
}

function goNext() {
  if (!hasNext.value) return;
  const entry = allModelList.value[currentIndex.value + 1];
  emit('navigate-to', entry);
}

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

const activeCount = computed(() =>
  props.model.providers.filter((p) => !p._removed && p.status.result === 'working').length,
);
const totalCount = computed(() => props.model.providers.filter((p) => !p._removed).length);

const DERIV_LABELS_PANEL: Record<string, string> = {
  finetune: 'Fine-tune', merge: 'Merge', distillation: 'Distillation', dpo: 'DPO',
  continued_pretraining: 'Continued PT', lora_adapter: 'LoRA',
};

const derivationLabel = computed(() => {
  const method = props.model.derivation_method;
  if (!method) return null;
  return DERIV_LABELS_PANEL[method] || method;
});

const lineageChain = computed(() => {
  const chain: { name: string; slug: string | null }[] = [];
  let slug = props.model.base_model;
  while (slug) {
    const parent = store.modelBySlug.get(slug);
    if (parent) {
      chain.push({ name: parent.name, slug: parent.slug });
      slug = parent.base_model;
    } else {
      chain.push({ name: slug, slug: null });
      slug = null;
    }
  }
  return chain;
});

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
  const providerIds = new Set(props.model.providers.map((p) => p.full_id));
  return issues.filter((i) => providerIds.has(i.model_id));
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
.detail-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: flex-end;
}

.detail-panel {
  width: min(90vw, 900px);
  height: 100dvh;
  background: var(--bg);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  padding: 20px 24px;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition:
    transform 0.25s ease,
    opacity 0.2s ease;
}
.panel-slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.panel-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.dp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.dp-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dp-back {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
}

.dp-back:hover:not(:disabled) {
  background: var(--bg-elevated);
  color: var(--text);
}
.dp-back:disabled {
  opacity: 0.3;
  cursor: default;
}

.dp-title {
  font-size: 1.2rem;
  font-weight: 700;
  margin: 0;
}

.dp-creator-badge {
  padding: 2px 10px;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
}

.dp-close {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
}

.dp-close:hover {
  background: var(--bg-elevated);
  color: var(--text);
}

.dp-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.dp-meta-item {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.dp-meta-link {
  color: var(--accent);
  text-decoration: none;
}
.dp-meta-link:hover {
  text-decoration: underline;
}

.dp-deriv-badge {
  display: inline-block;
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
  margin-right: 4px;
}
.dp-depth-badge {
  display: inline-block;
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.1);
  color: #a5b4fc;
  vertical-align: middle;
  margin-left: 4px;
}

.dp-finetunes {
  margin: 0 0 4px;
}

.dp-rankings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.dp-ranking-badge {
  padding: 3px 10px;
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
}

.dp-section-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 20px 0 10px;
  color: var(--text);
}

.dp-issues {
  margin-top: 20px;
}

.dp-issue {
  display: flex;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.dp-issue-severity {
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

.dp-issue-text {
  font-size: 0.78rem;
  color: var(--text);
  margin: 0;
}

.dp-next-btn {
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

.dp-next-btn:hover:not(:disabled) {
  border-color: var(--accent);
}
.dp-next-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

@media (max-width: 768px) {
  .detail-panel {
    width: 100vw;
    border-left: none;
  }
}
</style>
