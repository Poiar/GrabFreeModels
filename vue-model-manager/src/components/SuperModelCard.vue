<template>
  <div
    class="sm-card"
    :class="[`card-${status}`, { 'card-has-removed': hasRemoved }]"
    @click="handleClick"
    role="button"
    tabindex="0"
  >
    <!-- Row 1: Model name (primary identity) + ranking badges -->
    <div class="sm-name-row">
      <span class="sm-model-name">
        <span class="sm-model-icon-fb">{{ model.name[0] }}</span>
        {{ model.name }}
        <button class="copy-btn-badge" title="Copy name" @click.stop="copyText(model.name)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <router-link v-if="model.base_model" :to="`/model/${model.base_model}`" class="sm-finetune-badge" title="Fine-tune — click to see base model" @click.stop>
          FT: {{ baseModelName }}
        </router-link>
      </span>
      <div class="sm-header-right">
        <span v-for="r in topRoles" :key="r.role" class="sm-ranking-badge" :title="r.role + ' rank #' + r.rank">
          #{{ r.rank }} {{ r.label }}
        </span>
      </div>
    </div>

    <!-- Row 2: Creator / Family / Base creator (lineage) -->
    <div class="sm-meta-row">
      <span
        class="sm-badge sm-badge-creator"
        :class="{ 'is-link': !!model.creator }"
        @click.stop="model.creator ? emit('creator-click', model.creator!) : null"
      >
        <svg v-if="creatorIcon" class="sm-icon" :viewBox="creatorIcon.viewBox" v-html="creatorIcon.body"></svg>
        <span v-else class="sm-icon-fb">{{ (model.creator || '?')[0] }}</span>
        {{ model.creator || '—' }}
        <button v-if="model.creator" class="copy-btn-badge" title="Copy creator" @click.stop="copyText(model.creator!)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </span>
      <span class="sm-badge-sep">/</span>
      <span v-if="model.family" class="sm-badge sm-badge-family">
        <span class="sm-icon-fb">{{ formatFamily(model.family)[0] }}</span>
        {{ formatFamily(model.family) }}
      </span>
      <span v-if="model.family" class="sm-badge-sep">/</span>
      <span v-if="model.base_creator && model.base_creator !== model.creator" class="sm-badge sm-badge-base" :title="'Architecture lineage: ' + model.base_creator">
        <span class="sm-icon-fb">{{ model.base_creator[0] }}</span>
        {{ model.base_creator }}
      </span>
    </div>

    <!-- Row 3: Provider stats -->
    <div class="sm-stats">
      <span class="sm-stat">{{ datapointsCount }} provider{{ datapointsCount !== 1 ? 's' : '' }}</span>
      <span class="sm-stat-divider">|</span>
      <span v-if="workingCount > 0" class="sm-stat sm-stat-working">{{ workingCount }} working</span>
      <template v-if="rateLimitedCount > 0">
        <span class="sm-stat-divider">|</span>
        <span class="sm-stat sm-stat-limited">{{ rateLimitedCount }} limited</span>
      </template>
      <template v-if="brokenCount > 0">
        <span class="sm-stat-divider">|</span>
        <span class="sm-stat sm-stat-broken">{{ brokenCount }} down</span>
      </template>
      <template v-if="workingCount === 0 && brokenCount === 0">
        <span class="sm-stat sm-stat-none">untested</span>
      </template>
      <span class="sm-stat-divider">|</span>
      <span class="sm-stat">Max: {{ model.best_context ? formatContext(model.best_context) : '—' }} ctx</span>
      <template v-if="anyTools">
        <span class="sm-stat-divider">|</span>
        <span class="sm-stat sm-stat-tools">Tools</span>
      </template>
      <template v-if="releaseDate">
        <span class="sm-stat-divider">|</span>
        <span class="sm-stat" :title="releaseDate">v{{ formatDateShort(releaseDate) }}</span>
      </template>
    </div>

    <!-- Row 5: Footer — provider tags + source badges -->
    <div class="sm-footer">
      <div class="sm-providers">
        <span v-for="p in providerTags.slice(0, 6)" :key="p.slug" class="provider-tag">
          <ProviderIcon :slug="p.slug" :size="14" :cls="'sm-provider-logo'" />
          {{ p.name }}
        </span>
        <span v-if="providerTags.length > 6" class="provider-tag more">+{{ providerTags.length - 6 }}</span>
      </div>
      <span v-if="sourceBadges.length" class="sm-sources">
        <span v-for="b in sourceBadges" :key="b.key" class="sm-source-badge" :class="b.cssClass" :title="b.title">{{ b.label }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ModelData, ProviderDatapoint } from '@/types';
import { useModelsStore } from '@/store/models';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { useToast } from '@/composables/useToast';
import { getProviderIcon } from '@/data/provider-icons';

const ROLES = ['model', 'build', 'general', 'small_model', 'explore'] as const;
const ROLE_SHORT: Record<string, string> = { model: 'Mod', build: 'Bld', general: 'Gen', small_model: 'Sml', explore: 'Exp' };

const props = defineProps<{
  model: ModelData;
  creatorSlug?: string;
}>();

const emit = defineEmits<{
  click: [];
  'creator-click': [creatorName: string];
}>();

const store = useModelsStore();
const { success: toastSuccess } = useToast();

const baseModelName = computed(() => {
  if (!props.model.base_model) return null;
  const parent = store.modelBySlug.get(props.model.base_model);
  return parent ? parent.name : props.model.base_model;
});

const activeDps = computed(() => props.model.providers.filter((p: ProviderDatapoint) => !p._removed));
const working = computed(() => activeDps.value.filter((d) => d.status.result === 'working'));
const broken = computed(() => activeDps.value.filter((d) => d.status.result === 'broken'));
const rateLimited = computed(() => activeDps.value.filter((d) => d.status.result === 'rate_limited'));
const datapointsCount = computed(() => activeDps.value.length);
const workingCount = computed(() => working.value.length);
const brokenCount = computed(() => broken.value.length);
const rateLimitedCount = computed(() => rateLimited.value.length);
const hasRemoved = computed(() => props.model.providers.some((d) => d._removed));
const anyTools = computed(() => activeDps.value.some((d) => d.supports_tools));

const status = computed(() => {
  if (!activeDps.value.length) return 'down';
  if (working.value.length === activeDps.value.length) return 'working';
  if (working.value.length > 0) return 'mixed';
  return 'down';
});

const providerTags = computed(() => {
  const set = new Map<string, string>();
  for (const p of props.model.providers) set.set(p.provider_slug, p.provider);
  return [...set.entries()].map(([slug, name]) => ({ slug, name }));
});

const releaseDate = computed(() => {
  let earliest: string | null = null;
  for (const dp of activeDps.value) {
    if (dp.release_date && (!earliest || dp.release_date < earliest)) {
      earliest = dp.release_date;
    }
  }
  return earliest;
});

const topRoles = computed(() => {
  const result: { role: string; label: string; rank: number }[] = [];
  for (const role of ROLES) {
    const arr = store.roleRankings[role] ?? [];
    let bestRank = Infinity;
    for (const dp of activeDps.value) {
      const idx = arr.indexOf(dp.full_id);
      if (idx !== -1 && idx + 1 < bestRank) bestRank = idx + 1;
    }
    if (bestRank < Infinity) result.push({ role, label: ROLE_SHORT[role] ?? role, rank: bestRank });
  }
  result.sort((a, b) => a.rank - b.rank);
  return result.slice(0, 3);
});

const sourceBadges = computed(() => {
  const idCounts = new Map<number, number>();
  for (const dp of activeDps.value) {
    for (const id of (dp.source_ids || [])) {
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
  }
  if (idCounts.size === 0) return [];
  const sourceById: Record<number, { slug: string; name: string; source_type: string }> = {};
  for (const s of store.sources) {
    sourceById[s.id] = { slug: s.slug, name: s.name, source_type: s.source_type };
  }
  const ABBR: Record<string, { label: string; cssClass: string }> = {
    'huggingface-hub': { label: 'HF', cssClass: 'src-hf' },
    modelsdev: { label: 'MD', cssClass: 'src-md' },
    mastra: { label: 'MS', cssClass: 'src-ms' },
    'openllm-leaderboard': { label: 'LL', cssClass: 'src-ll' },
    'free-llm-api-resources': { label: 'FR', cssClass: 'src-fr' },
  };
  return [...idCounts.entries()]
    .map(([id, count]) => {
      const s = sourceById[id];
      if (!s) return null;
      const abbr = ABBR[s.slug];
      const base = abbr ?? { label: s.source_type === 'api_provider' ? 'API' : s.name.slice(0, 12), cssClass: 'src-api' };
      const label = count > 1 ? `${base.label}×${count}` : base.label;
      return { key: s.slug, label, title: `${s.name} (${count} provider${count > 1 ? 's' : ''})`, cssClass: base.cssClass };
    })
    .filter(Boolean) as { key: string; label: string; title: string; cssClass: string }[];
});

const creatorIcon = computed(() => {
  const slug = props.creatorSlug || props.model.creator;
  if (!slug) return null;
  return getProviderIcon(slug);
});

const FAMILY_OVERRIDES: Record<string, string> = { gpt: 'GPT', glm: 'GLM', llm: 'LLM' };

function formatFamily(raw: string): string {
  return raw.split('-').map(w => FAMILY_OVERRIDES[w] ?? (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

function formatContext(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(n);
}

function formatDateShort(date: string): string {
  return date.slice(2);
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest('.copy-btn-badge')) return;
  emit('click');
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toastSuccess(`"${text}" copied`); } catch { /* noop */ }
}
</script>

<style scoped>
.sm-card {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s, border-left-color 0.3s, box-shadow 0.15s;
}

.sm-card.card-working { border-left-color: var(--green); }
.sm-card.card-mixed { border-left-color: var(--orange); }
.sm-card.card-down { border-left-color: var(--border); }

.sm-card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
}

.sm-card.card-has-removed {
  border-left-color: var(--orange);
}

/* Row 1: Model name + ranking badges */
.sm-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}

.sm-model-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
}

.sm-model-icon-fb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  font-size: 0.55rem;
  font-weight: 800;
  text-transform: uppercase;
  flex-shrink: 0;
  color: var(--accent);
}

.sm-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.sm-ranking-badge {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.15);
  color: var(--green);
  white-space: nowrap;
}


/* Row 2: Creator / Family / Base creator badges */
.sm-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.sm-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 0.68rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
}

.sm-badge-creator {
  background: var(--accent-subtle);
  color: var(--accent);
}

.sm-badge-creator.is-link {
  cursor: pointer;
}

.sm-badge-creator.is-link:hover {
  filter: brightness(1.2);
}

.sm-badge-family {
  background: rgba(167, 139, 250, 0.12);
  color: var(--purple);
}

.sm-badge-base {
  background: rgba(250, 204, 21, 0.12);
  color: var(--yellow, #facb15);
}

.sm-finetune-badge {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
  flex-shrink: 0;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s;
}

.sm-badge-sep {
  font-size: 0.6rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.sm-icon {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.sm-icon-fb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 0.48rem;
  font-weight: 800;
  text-transform: uppercase;
  flex-shrink: 0;
}

/* Row 3: Stats */
.sm-stats {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-bottom: 3px;
}

.sm-stat-divider {
  color: var(--border);
  font-size: 0.6rem;
}

.sm-stat-working { color: var(--green); font-weight: 600; }
.sm-stat-limited { color: var(--orange); font-weight: 600; }
.sm-stat-broken { color: var(--red); }
.sm-stat-none { color: var(--text-muted); }
.sm-stat-tools { color: var(--blue, #60a5fa); }

/* Row 5: Footer */
.sm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sm-providers {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.provider-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.6rem;
  font-weight: 500;
  background: var(--accent-subtle);
  color: var(--accent);
  white-space: nowrap;
}

.sm-provider-logo {
  border-radius: 2px;
}

.provider-tag.more {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.sm-sources {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.sm-source-badge {
  padding: 0 4px;
  font-size: 0.55rem;
  font-weight: 700;
  border-radius: 3px;
  line-height: 1.4;
}

.sm-source-badge.src-api { background: var(--accent-subtle); color: var(--accent); }
.sm-source-badge.src-hf { background: #fff3cd; color: #856404; }
.sm-source-badge.src-md { background: #d4edff; color: #004085; }
.sm-source-badge.src-ms { background: #e2d9f3; color: #563d7c; }
.sm-source-badge.src-ll { background: #d1f2eb; color: #0d5f4e; }
.sm-source-badge.src-fr { background: #ffe0cc; color: #7a3800; }

.copy-btn-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.12s;
}

.sm-model-name:hover .copy-btn-badge,
.sm-badge:hover .copy-btn-badge,
.copy-btn-badge:focus-visible {
  opacity: 1;
}

@media (max-width: 768px) {
  .sm-card { padding: 8px 10px; }
  .sm-model-name { font-size: 0.78rem; }
  .sm-header-right { display: none; }
}
</style>
