<template>
  <div>
    <div class="page-header">
      <h2>Providers</h2>
      <p>{{ store.visibleProviderRefs.length }} API provider{{ store.visibleProviderRefs.length !== 1 ? 's' : '' }} hosting free models<template v-if="store.isSourceFilterActive"> <span class="filtered-note">(filtered)</span></template></p>
    </div>

    <div class="providers-grid">
      <div
        v-for="(provider, idx) in sortedProviders"
        :key="provider.slug"
        class="provider-card glass-card"
        :style="{ '--pc-color-muted': getProviderColorMuted(provider.slug), '--pc-color': getProviderColor(provider.slug) }"
        role="button"
        tabindex="0"
        @click="openProviderPanel(idx)"
      >
        <div class="pc-header">
          <ProviderIcon :slug="provider.slug" :size="32" />
          <div class="pc-name-group">
            <h3 class="pc-name">{{ provider.name }}<button class="copy-btn-sm" title="Copy name" @click.stop="copyText(provider.name)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></h3>
            <span class="pc-slug">{{ provider.slug }}</span>
          </div>
          <span class="pc-status" :class="provider.health_status">
            {{ provider.health_status }}
          </span>
        </div>

        <div class="pc-stats">
          <div class="pc-stat">
            <span class="pc-stat-val">{{ provider.model_count }}</span>
            <span class="pc-stat-lbl">Instances</span>
          </div>
          <div class="pc-stat">
            <span class="pc-stat-val free">{{ providerModels[provider.slug]?.length || 0 }}</span>
            <span class="pc-stat-lbl">Free</span>
          </div>
          <div class="pc-stat">
            <span class="pc-stat-val working">{{ provider.working_count }}</span>
            <span class="pc-stat-lbl">Working</span>
          </div>
        </div>

        <div class="pc-bar-track">
          <div
            class="pc-bar-fill"
            :class="provider.health_status"
            :style="{ width: provider.model_count ? (provider.working_count / provider.model_count * 100) + '%' : '0%' }"
          ></div>
        </div>

        <div v-if="provider.base_url" class="pc-url">{{ provider.base_url }}</div>

        <div class="pc-models">
          <div
            v-for="m in providerModels[provider.slug]?.slice(0, 6)"
            :key="m.super_id"
            class="pc-model-chip"
          >
            {{ m.name }}
          </div>
          <div v-if="(providerModels[provider.slug]?.length || 0) > 6" class="pc-model-chip more">
            +{{ (providerModels[provider.slug]?.length || 0) - 6 }} more
          </div>
        </div>
      </div>
    </div>

    <!-- Provider detail panel -->
    <ProviderPanel
      v-if="panelProvider"
      :open="!!panelProvider"
      :provider="panelProvider"
      :provider-index="providerIndex"
      :provider-list="sortedProviders"
      @close="panelProvider = null"
      @navigate-to="navigateProviderPanel"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '@/store/models';
import ProviderIcon from '@/components/ProviderIcon.vue';
import ProviderPanel from '@/components/ProviderPanel.vue';
import { useToast } from '@/composables/useToast';
import { getProviderColor, getProviderColorMuted } from '@/data/provider-colors';
import type { ProviderReference } from '@/types';

const store = useModelsStore();

const sortedProviders = computed(() =>
  [...store.visibleProviderRefs].sort((a, b) => b.model_count - a.model_count),
);

const providerModels = computed(() => {
  const map: Record<string, { super_id: number; name: string }[]> = {};
  for (const model of store.visibleModels) {
    for (const dp of model.providers) {
      const slug = dp.provider_slug;
      if (!map[slug]) map[slug] = [];
      // dedupe by super_id within a provider
      if (!map[slug].some((m) => m.super_id === model.super_id)) {
        map[slug].push({ super_id: model.super_id, name: model.name });
      }
    }
  }
  for (const slug of Object.keys(map)) {
    map[slug].sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
});

const { success: toastSuccess } = useToast();

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toastSuccess(`"${text}" copied`); } catch { /* noop */ }
}

// ── Provider detail panel ──
const panelProvider = ref<ProviderReference | null>(null);
const providerIndex = ref(0);

function openProviderPanel(index: number) {
  providerIndex.value = index;
  panelProvider.value = sortedProviders.value[index];
}

function navigateProviderPanel(index: number) {
  const provider = sortedProviders.value[index];
  if (!provider) return;
  providerIndex.value = index;
  panelProvider.value = provider;
}
</script>

<style scoped>
.page-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.page-header p { font-size: 0.78rem; color: var(--text-muted); margin: 0 0 20px; }
.filtered-note { color: var(--accent); font-weight: 600; }

.providers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.provider-card {
  padding: 16px;
  cursor: pointer;
  border-left: 4px solid var(--pc-color);
  position: relative;
  overflow: hidden;
}

.provider-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--pc-color);
  opacity: 0.3;
}

.pc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.pc-name-group {
  flex: 1;
  min-width: 0;
}

.pc-name {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--pc-color);
}

.copy-btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 1px;
  border-radius: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s, color 0.12s;
}

.pc-name:hover .copy-btn-sm,
.copy-btn-sm:focus-visible {
  opacity: 1;
}

.copy-btn-sm:hover {
  color: var(--accent);
}

.pc-slug {
  font-size: 0.62rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.pc-status {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.pc-status.healthy { background: rgba(63,185,80,0.12); color: var(--green); }
.pc-status.degraded { background: rgba(251,191,36,0.12); color: var(--orange); }
.pc-status.down { background: rgba(248,113,113,0.12); color: var(--red); }

.pc-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 10px;
}

.pc-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pc-stat-val {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
}

.pc-stat-val.working { color: var(--green); }
.pc-stat-val.free { color: var(--accent); }
.pc-stat-val.down { color: var(--red); }

.pc-stat-lbl {
  font-size: 0.62rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pc-bar-track {
  height: 3px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  margin-bottom: 10px;
  overflow: hidden;
}

.pc-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s;
}

.pc-bar-fill.healthy { background: var(--green); }
.pc-bar-fill.degraded { background: var(--orange); }
.pc-bar-fill.down { background: var(--red); }

.pc-url {
  font-size: 0.58rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 10px;
  opacity: 0.6;
}

.pc-models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pc-model-chip {
  padding: 2px 7px;
  font-size: 0.62rem;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
  white-space: nowrap;
}

.pc-model-chip.more {
  background: var(--bg-hover);
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .providers-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .providers-grid {
    grid-template-columns: 1fr;
  }
}
</style>
