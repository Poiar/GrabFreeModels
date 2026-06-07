<template>
  <div class="stp-root">
    <button class="stp-header" @click="open = !open" :aria-expanded="open">
      <div class="stp-header-left">
        <svg
          aria-hidden="true" width="14" height="14"
          viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>Sources</span>
        <span v-if="activeCount > 0" class="stp-badge">{{ activeCount }}</span>
      </div>
      <svg
        class="stp-chevron" :class="{ open }"
        aria-hidden="true" width="12" height="12"
        viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>

    <div v-if="open" class="stp-body">
      <!-- API Providers section -->
      <div class="stp-section">
        <div class="stp-section-header">
          <span>API Providers</span>
          <button class="stp-super-toggle" @click="toggleSuperApi">
            {{ superApiEnabled ? 'Disable All' : 'Enable All' }}
          </button>
        </div>
        <label v-for="s in apiSources" :key="s.id" class="stp-toggle-row">
          <span class="stp-toggle-label">{{ s.name }}</span>
          <label class="stp-switch">
            <input
              type="checkbox"
              :checked="isEnabled(s.id)"
              @change="toggle(s.id)"
            />
            <span class="stp-slider"></span>
          </label>
        </label>
      </div>

      <!-- Community Sources section -->
      <div class="stp-section">
        <div class="stp-section-header">
          <span>Community Sources</span>
        </div>
        <label v-for="s in communitySources" :key="s.id" class="stp-toggle-row">
          <span class="stp-toggle-label">{{ s.name }}</span>
          <label class="stp-switch">
            <input
              type="checkbox"
              :checked="isEnabled(s.id)"
              @change="toggle(s.id)"
            />
            <span class="stp-slider"></span>
          </label>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useModelsStore } from '@/store/models';

const store = useModelsStore();
const open = ref(false);

watch(
  () => store.sourcesPanelOpen,
  (v) => { if (v) { open.value = true; store.sourcesPanelOpen = false; } },
);

const apiSources = computed(() =>
  store.sources.filter((s) => s.source_type === 'api_provider'),
);
const communitySources = computed(() =>
  store.sources.filter((s) => s.source_type === 'community_list'),
);
const activeCount = computed(() =>
  store.sources.filter((s) => store.toggleState[s.id] === false).length,
);

const superApiEnabled = computed(() => store.superApiEnabled);

function isEnabled(id: number) {
  return store.toggleState[id] !== false;
}
function toggle(id: number) {
  store.toggleSource(id, !isEnabled(id));
}
function toggleSuperApi() {
  store.superApiEnabled = !store.superApiEnabled;
}
</script>

<style scoped>
.stp-root {
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  margin: 0 0 0 0;
}

.stp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 16px;
  background: none;
  border: none;
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.12s;
  text-align: left;
}

.stp-header:hover {
  background: var(--bg-hover);
}

.stp-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stp-header-left svg {
  color: var(--text-muted);
  flex-shrink: 0;
}

.stp-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 0.6rem;
  font-weight: 700;
  background: var(--accent);
  color: #fff;
  line-height: 1;
}

.stp-chevron {
  color: var(--text-muted);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.stp-chevron.open {
  transform: rotate(90deg);
}

.stp-body {
  padding: 0 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stp-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stp-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 4px 0;
  margin-bottom: 2px;
}

.stp-super-toggle {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.6rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.12s;
}

.stp-super-toggle:hover {
  background: var(--accent-subtle);
}

.stp-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}

.stp-toggle-row:hover {
  background: var(--bg-hover);
}

.stp-toggle-label {
  font-size: 0.7rem;
  color: var(--text-dim);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Toggle switch ── */
.stp-switch {
  position: relative;
  display: inline-block;
  width: 30px;
  height: 17px;
  flex-shrink: 0;
}

.stp-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.stp-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 17px;
  transition: background 0.2s;
}

.stp-slider::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 13px;
  height: 13px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.stp-switch input:checked + .stp-slider {
  background: var(--accent);
}

.stp-switch input:checked + .stp-slider::before {
  transform: translateX(13px);
}

.stp-switch input:focus-visible + .stp-slider {
  box-shadow: 0 0 0 2px var(--accent-subtle);
}
</style>
