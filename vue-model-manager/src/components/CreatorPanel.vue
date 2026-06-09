<template>
  <Teleport to="body">
    <Transition name="panel-slide">
      <div v-if="open" class="crp-backdrop" @click.self="close">
        <div class="crp-panel">
          <!-- Header -->
          <div class="crp-header">
            <div class="crp-header-left">
              <button class="crp-nav-btn" :disabled="!hasPrev" title="Previous creator" @click="goPrev">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <ProviderIcon :slug="creator.id" :size="28" />
              <h2 class="crp-title">{{ creator.name }}</h2>
            </div>
            <button class="crp-close" aria-label="Close panel" @click="close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- Stats -->
          <div class="crp-stats">
            <div class="crp-stat">
              <span class="crp-stat-val">{{ creator.model_count }}</span>
              <span class="crp-stat-lbl">Models</span>
            </div>
            <div class="crp-stat">
              <span class="crp-stat-val">{{ creator.provider_count }}</span>
              <span class="crp-stat-lbl">Providers</span>
            </div>
          </div>

          <!-- Models list -->
          <h3 class="crp-section-title">Models ({{ creator.models.length }})</h3>
          <div class="crp-models">
            <div v-for="m in creator.models" :key="m.super_id" class="crp-model-row">
              <span class="crp-model-name">{{ m.name }}</span>
              <span class="crp-model-providers">{{ m.providers.filter(p => !p._removed).length }} provider{{ m.providers.filter(p => !p._removed).length !== 1 ? 's' : '' }}</span>
            </div>
          </div>

          <!-- Next button -->
          <button v-if="hasNext" class="crp-next-btn" @click="goNext">
            Next creator →
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import type { CreatorData } from '@/types';
import ProviderIcon from '@/components/ProviderIcon.vue';

const props = defineProps<{
  open: boolean;
  creator: CreatorData;
  creatorIndex: number;
  creatorList: CreatorData[];
}>();

const emit = defineEmits<{
  close: [];
  'navigate-to': [index: number];
}>();

function close() {
  emit('close');
}

const hasPrev = computed(() => props.creatorIndex > 0);
const hasNext = computed(() => props.creatorIndex < props.creatorList.length - 1);

function goPrev() {
  if (!hasPrev.value) return;
  emit('navigate-to', props.creatorIndex - 1);
}

function goNext() {
  if (!hasNext.value) return;
  emit('navigate-to', props.creatorIndex + 1);
}


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
  { immediate: true },
);
</script>

<style scoped>
.crp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: flex-end;
}

.crp-panel {
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

.crp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.crp-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.crp-nav-btn {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  flex-shrink: 0;
}

.crp-nav-btn:hover:not(:disabled) {
  background: var(--bg-elevated);
  color: var(--text);
}
.crp-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.crp-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 6px;
}

.crp-title {
  font-size: 1.2rem;
  font-weight: 700;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crp-close {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
}

.crp-close:hover {
  background: var(--bg-elevated);
  color: var(--text);
}

.crp-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
}

.crp-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.crp-stat-val {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent);
  font-family: 'JetBrains Mono', monospace;
}

.crp-stat-lbl {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.crp-section-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0 0 10px;
  color: var(--text);
}

.crp-models {
  display: flex;
  flex-direction: column;
}

.crp-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  border-radius: 4px;
  transition: background 0.1s;
}

.crp-model-row:hover {
  background: var(--bg-hover);
}

.crp-model-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent);
}

.crp-model-providers {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.crp-next-btn {
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

.crp-next-btn:hover {
  border-color: var(--accent);
}

@media (max-width: 768px) {
  .crp-panel {
    width: 100vw;
    border-left: none;
  }
}
</style>
