<template>
  <Teleport to="body">
    <Transition name="panel-slide">
      <div v-if="open" class="prp-backdrop" @click.self="close">
        <div class="prp-panel">
          <!-- Header -->
          <div class="prp-header">
            <div class="prp-header-left">
              <button class="prp-nav-btn" :disabled="!hasPrev" title="Previous provider" @click="goPrev">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <ProviderIcon :slug="provider.slug" :size="28" />
              <h2 class="prp-title" :style="{ color: providerColor }">{{ provider.name }}</h2>
              <span class="prp-slug">{{ provider.slug }}</span>
              <span class="prp-status" :class="provider.health_status">{{ provider.health_status }}</span>
            </div>
            <button class="prp-close" aria-label="Close panel" @click="close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- Stats -->
          <div class="prp-stats">
            <div class="prp-stat">
              <span class="prp-stat-val">{{ provider.model_count }}</span>
              <span class="prp-stat-lbl">Models</span>
            </div>
            <div class="prp-stat">
              <span class="prp-stat-val working">{{ provider.working_count }}</span>
              <span class="prp-stat-lbl">Working</span>
            </div>
            <div v-if="provider.model_count - provider.working_count > 0" class="prp-stat">
              <span class="prp-stat-val down">{{ provider.model_count - provider.working_count }}</span>
              <span class="prp-stat-lbl">Down</span>
            </div>
          </div>

          <!-- Health bar -->
          <div class="prp-bar-track">
            <div
              class="prp-bar-fill"
              :class="provider.health_status"
              :style="{ width: provider.model_count ? (provider.working_count / provider.model_count * 100) + '%' : '0%' }"
            ></div>
          </div>

          <!-- Base URL -->
          <div v-if="provider.base_url" class="prp-url">{{ provider.base_url }}</div>

          <!-- npm install snippet -->
          <div v-if="provider.npm_package" class="prp-npm">
            <code class="prp-npm-code" @click="copyNpm">{{ npmLabel }}</code>
            <span class="prp-copy-hint">click to copy</span>
          </div>

          <!-- Models list -->
          <h3 class="prp-section-title">Models ({{ providerModels.length }})</h3>
          <div class="prp-models">
            <div v-for="m in providerModels" :key="m.super_id" class="prp-model-row">
              <span class="prp-model-name">{{ m.name }}</span>
            </div>
          </div>

          <!-- Next button -->
          <button v-if="hasNext" class="prp-next-btn" @click="goNext">
            Next provider →
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import type { ProviderReference } from '@/types';
import { useModelsStore } from '@/store/models';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { getProviderColor } from '@/data/provider-colors';
import { useToast } from '@/composables/useToast';

const props = defineProps<{
  open: boolean;
  provider: ProviderReference;
  providerIndex: number;
  providerList: ProviderReference[];
}>();

const emit = defineEmits<{
  close: [];
  'navigate-to': [index: number];
}>();

const store = useModelsStore();
const providerColor = computed(() => getProviderColor(props.provider.slug));

function close() {
  emit('close');
}

const hasPrev = computed(() => props.providerIndex > 0);
const hasNext = computed(() => props.providerIndex < props.providerList.length - 1);

function goPrev() {
  if (!hasPrev.value) return;
  emit('navigate-to', props.providerIndex - 1);
}

function goNext() {
  if (!hasNext.value) return;
  emit('navigate-to', props.providerIndex + 1);
}

const npmLabel = computed(() => `npm i ${props.provider.npm_package}`);

const { success: toastSuccess } = useToast();

async function copyNpm() {
  try { await navigator.clipboard.writeText(npmLabel.value); toastSuccess('npm command copied'); } catch { /* noop */ }
}

const providerModels = computed(() => {
  const models: { super_id: number; name: string }[] = [];
  for (const model of store.visibleModels) {
    for (const dp of model.providers) {
      if (dp.provider_slug === props.provider.slug) {
        if (!models.some((m) => m.super_id === model.super_id)) {
          models.push({ super_id: model.super_id, name: model.name });
        }
      }
    }
  }
  models.sort((a, b) => a.name.localeCompare(b.name));
  return models;
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
.prp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: flex-end;
}

.prp-panel {
  width: min(90vw, 700px);
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

.prp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.prp-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.prp-nav-btn {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  flex-shrink: 0;
}

.prp-nav-btn:hover:not(:disabled) {
  background: var(--bg-elevated);
  color: var(--text);
}
.prp-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}



.prp-title {
  font-size: 1.2rem;
  font-weight: 700;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prp-slug {
  font-size: 0.62rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.prp-status {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.prp-status.healthy { background: rgba(63,185,80,0.12); color: var(--green); }
.prp-status.degraded { background: rgba(251,191,36,0.12); color: var(--orange); }
.prp-status.down { background: rgba(248,113,113,0.12); color: var(--red); }

.prp-close {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
}

.prp-close:hover {
  background: var(--bg-elevated);
  color: var(--text);
}

.prp-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
}

.prp-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.prp-stat-val {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
}

.prp-stat-val.working { color: var(--green); }
.prp-stat-val.down { color: var(--red); }

.prp-stat-lbl {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.prp-bar-track {
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  margin-bottom: 12px;
  overflow: hidden;
}

.prp-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s;
}

.prp-bar-fill.healthy { background: var(--green); }
.prp-bar-fill.degraded { background: var(--orange); }
.prp-bar-fill.down { background: var(--red); }

.prp-url {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 8px;
  opacity: 0.6;
}

.prp-npm {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.prp-npm-code {
  font-size: 0.72rem;
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg-elevated);
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border);
  cursor: pointer;
  user-select: all;
  transition: border-color 0.12s;
}

.prp-npm-code:hover {
  border-color: var(--accent);
}

.prp-copy-hint {
  font-size: 0.6rem;
  color: var(--text-muted);
  opacity: 0.6;
}

.prp-section-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0 0 10px;
  color: var(--text);
}

.prp-models {
  display: flex;
  flex-direction: column;
}

.prp-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  border-radius: 4px;
  transition: background 0.1s;
}

.prp-model-row:hover {
  background: var(--bg-hover);
}

.prp-model-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent);
}

.prp-next-btn {
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

.prp-next-btn:hover {
  border-color: var(--accent);
}

@media (max-width: 768px) {
  .prp-panel {
    width: 100vw;
    border-left: none;
  }
}
</style>
