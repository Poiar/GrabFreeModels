<template>
  <div class="ic-card" :class="[`ic-${dp.status.result}`]" :style="{ '--ic-provider-color': providerColorMuted, '--ic-provider-color-main': providerColor }" @click="handleClick">
    <!-- Row 1: Provider name + status -->
    <div class="ic-provider-row">
      <span class="ic-provider-name">
        <svg v-if="providerIconSvg" class="ic-provider-icon" :viewBox="providerIconSvg.viewBox" v-html="providerIconSvg.body"></svg>
        <span v-else class="ic-provider-icon-fb">{{ dp.provider[0] }}</span>
        <router-link :to="`/provider/${dp.provider_slug}`" class="ic-provider-link" @click.stop>{{ dp.provider }}</router-link>
        <button class="copy-btn-badge" title="Copy provider" @click.stop="copyText(dp.provider)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
      </span>
      <div class="ic-header-right">
        <span v-for="r in topRankings" :key="r.role" class="ic-ranking-badge" :title="r.role + ' rank #' + r.rank">#{{ r.rank }} {{ r.label }}</span>
        <span class="ic-status-badge" :class="`ic-status-${dp.status.result}`">{{ statusLabel }}</span>
      </div>
    </div>

    <!-- Row 2: Creator / Family / Super Model -->
    <div class="ic-meta-row">
      <router-link :to="'/creator/' + creator.id" class="ic-badge ic-badge-creator ic-badge-link" @click.stop>
        <svg v-if="creatorIconSvg" class="ic-icon" :viewBox="creatorIconSvg.viewBox" v-html="creatorIconSvg.body"></svg>
        <span v-else class="ic-icon-fb">{{ (creator.name || '?')[0] }}</span>
        {{ creator.name }}
      </router-link>
      <span class="ic-badge-sep">/</span>
      <router-link v-if="model.family" :to="'/family/' + model.family" class="ic-badge ic-badge-family ic-badge-link" @click.stop>
        <span class="ic-icon-fb">{{ formatFamily(model.family)[0] }}</span>
        {{ formatFamily(model.family) }}
      </router-link>
      <span v-if="model.family" class="ic-badge-sep">/</span>
      <router-link :to="'/model/' + model.slug" class="ic-badge ic-badge-model ic-badge-link" @click.stop>
        <span class="ic-icon-fb">{{ model.name[0] }}</span>
        {{ model.name }}
      </router-link>
    </div>

    <!-- Row 3: Instance key (full_id) -->
    <div class="ic-key-row">
      <router-link :to="'/model/' + model.slug" class="ic-key-pill ic-key-link" :title="dp.full_id" @click.stop>
        {{ dp.full_id }}
        <button class="copy-btn-badge" title="Copy full ID" @click.stop.prevent="copyText(dp.full_id)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
      </router-link>
    </div>

    <!-- Row 4: Capabilities -->
    <div class="ic-stats">
      <span class="ic-stat">{{ formatContext(dp.context_length) }}</span>
      <span class="ic-stat-divider">|</span>
      <span v-if="dp.is_free" class="ic-stat ic-free">Free</span>
      <span v-else class="ic-stat ic-paid">Paid</span>
      <template v-if="dp.supports_tools">
        <span class="ic-stat-divider">|</span>
        <span class="ic-stat ic-cap" title="Tools supported">Tools</span>
      </template>
      <template v-if="hasImageInput">
        <span class="ic-stat-divider">|</span>
        <span class="ic-stat ic-cap" title="Image input supported">Image</span>
      </template>
      <template v-if="dp.supports_attachment">
        <span class="ic-stat-divider">|</span>
        <span class="ic-stat ic-cap" title="Attachment supported">Attach</span>
      </template>
      <template v-if="dp.supports_structured_output">
        <span class="ic-stat-divider">|</span>
        <span class="ic-stat ic-cap" title="Structured output supported">Struct</span>
      </template>
      <template v-if="dp.supports_reasoning">
        <span class="ic-stat-divider">|</span>
        <span class="ic-stat ic-cap" title="Reasoning supported">Reason</span>
      </template>
    </div>

    <!-- Row 5: Knowledge + last success -->
    <div class="ic-info-row">
      <span v-if="dp.knowledge_cutoff" class="ic-info-tag" title="Knowledge cutoff">Cutoff: {{ formatKnowledge(dp.knowledge_cutoff) }}</span>
      <span v-if="dp.last_success" class="ic-info-tag" title="Last successful test">Last OK: {{ formatTimeAgo(dp.last_success) }}</span>
    </div>

    <!-- Row 6: Limits + sources + siblings -->
    <div class="ic-footer">
      <div class="ic-limits">
        <span v-if="limits.rate" class="ic-limit-tag" :title="limits.rate">Rate: {{ limits.rate }}</span>
        <span v-if="limits.daily" class="ic-limit-tag">{{ limits.daily }}/day</span>
        <span v-if="limits.card" class="ic-limit-warn">Card</span>
        <span v-if="limits.sub" class="ic-limit-warn" :title="limits.sub">Sub</span>
        <span v-if="limits.expires" class="ic-limit-tag" :title="'Expires: ' + limits.expires">Exp. {{ limits.expiresShort }}</span>
        <span v-if="!hasLimits" class="ic-no-limits">No limits</span>
        <span v-if="sourceBadges.length" class="ic-sources">
          <span v-for="b in sourceBadges" :key="b.key" class="ic-source-badge" :class="b.cssClass" :title="b.title">{{ b.label }}</span>
        </span>
      </div>
      <router-link v-if="siblingCount > 0" :to="'/model/' + model.slug" class="ic-siblings ic-siblings-link" @click.stop>
        +{{ siblingCount }} other{{ siblingCount !== 1 ? 's' : '' }}
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getProviderIcon } from '@/data/provider-icons';
import { getProviderColor, getProviderColorMuted } from '@/data/provider-colors';
import { useToast } from '@/composables/useToast';
import { useModelsStore } from '@/store/models';
import type { ProviderDatapoint, ModelData, CreatorData } from '@/types';

const props = defineProps<{
  dp: ProviderDatapoint;
  model: ModelData;
  creator: CreatorData;
  siblingCount: number;
}>();

const emit = defineEmits<{
  'click': [];
}>();

const store = useModelsStore();

const providerIconSvg = computed(() => getProviderIcon(props.dp.provider_slug));
const creatorIconSvg = computed(() => getProviderIcon(props.creator.id));
const providerColor = computed(() => getProviderColor(props.dp.provider_slug));
const providerColorMuted = computed(() => getProviderColorMuted(props.dp.provider_slug));

const hasImageInput = computed(() => (props.dp.input_types || []).includes('image'));

const topRankings = computed(() => {
  const rankings = props.model.role_rankings;
  const result: { role: string; label: string; rank: number }[] = [];
  const labels: Record<string, string> = { model: 'Mod', build: 'Bld', general: 'Gen', small_model: 'Sml', explore: 'Exp' };
  for (const [role, rank] of Object.entries(rankings)) {
    if (result.length >= 2) break;
    result.push({ role, label: labels[role] || role, rank });
  }
  return result;
});

const sourceBadges = computed(() => {
  const ids = props.dp.source_ids || [];
  if (ids.length === 0) return [];
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
  return ids
    .map((id) => sourceById[id])
    .filter(Boolean)
    .map((s) => {
      const abbr = ABBR[s.slug];
      if (abbr) return { key: s.slug, label: abbr.label, title: s.name, cssClass: abbr.cssClass };
      return { key: s.slug, label: s.source_type === 'api_provider' ? 'API' : s.name.slice(0, 12), title: s.name, cssClass: 'src-api' };
    });
});

const statusLabel = computed(() => {
  const labels: Record<string, string> = {
    working: 'working',
    broken: 'down',
    rate_limited: 'limited',
    untested: 'untested',
    not_found: 'gone',
  };
  return labels[props.dp.status.result] || props.dp.status.result;
});

const limits = computed(() => {
  const l = props.dp.limitations;
  if (!l) return {};
  return {
    rate: l.rate_limit || null,
    daily: l.daily_requests
      ? l.daily_requests >= 1000
        ? `${(l.daily_requests / 1000).toFixed(1).replace(/\.0$/, '')}K`
        : String(l.daily_requests)
      : null,
    card: l.requires_card ? 'Card req.' : null,
    sub: l.subscription_required || null,
    expires: l.expires || null,
    expiresShort: l.expires ? l.expires.slice(0, 7) : null,
  };
});

const hasLimits = computed(() => {
  const l = limits.value;
  return l.rate || l.daily || l.card || l.sub || l.expires;
});

const FAMILY_OVERRIDES: Record<string, string> = { gpt: 'GPT', glm: 'GLM', llm: 'LLM' };

function formatFamily(raw: string): string {
  return raw.split('-').map(w => FAMILY_OVERRIDES[w] ?? (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest('.copy-btn-badge')) return;
  emit('click');
}

function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

function formatKnowledge(k: string | null): string {
  if (!k) return '';
  const m = k.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : k.slice(0, 7);
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = diff / 3_600_000;
  if (hours < 1) return '<1h ago';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const { success: toastSuccess } = useToast();

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toastSuccess(`"${text}" copied`);
  } catch { /* noop */ }
}
</script>

<style scoped>
.ic-card {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  cursor: pointer;
  transition:
    border-color 0.15s,
    border-left-color 0.3s,
    box-shadow 0.15s;
}

.ic-card.ic-working { border-left-color: var(--green); }
.ic-card.ic-broken,
.ic-card.ic-not_found { border-left-color: var(--red); }
.ic-card.ic-rate_limited { border-left-color: var(--orange); }
.ic-card.ic-untested { border-left-color: var(--text-muted); }

.ic-card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
}

/* Row 1: Provider */
.ic-provider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}

/* Row 2: Instance key */
.ic-key-row {
  margin-bottom: 4px;
}

.ic-key-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  font-size: 0.62rem;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ic-key-link {
  text-decoration: none;
  color: var(--text-muted);
}

.ic-key-link:hover {
  color: var(--accent);
}

.ic-badge-link {
  text-decoration: none;
  color: inherit;
}

.ic-provider-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ic-provider-color-main, var(--text));
}

.ic-provider-icon {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
  background: var(--ic-provider-color);
}

.ic-provider-icon-fb {
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

.ic-status-badge {
  padding: 1px 8px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 999px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.ic-status-working { background: rgba(52, 211, 153, 0.15); color: var(--green); }
.ic-status-broken,
.ic-status-not_found { background: rgba(239, 68, 68, 0.12); color: var(--red); }
.ic-status-rate_limited { background: rgba(251, 191, 36, 0.15); color: var(--orange); }
.ic-status-untested { background: rgba(156, 163, 175, 0.12); color: var(--text-muted); }

/* Row 2: Creator / Model badges */
.ic-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.ic-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 0.68rem;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
}

.ic-badge-creator {
  background: var(--accent-subtle);
  color: var(--accent);
}

.ic-badge-family {
  background: rgba(167, 139, 250, 0.12);
  color: var(--purple);
}

.ic-badge-model {
  background: rgba(52, 211, 153, 0.12);
  color: var(--green);
  cursor: pointer;
}

.ic-badge-model:hover {
  filter: brightness(1.2);
}

.ic-badge-sep {
  font-size: 0.6rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.ic-icon {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.ic-icon-fb {
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

.ic-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ic-ranking-badge {
  padding: 1px 6px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.15);
  color: var(--green);
  white-space: nowrap;
}

/* Row 4: Capabilities */
.ic-stats {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-bottom: 3px;
}

.ic-stat-divider {
  color: var(--border);
  font-size: 0.6rem;
}

.ic-free { color: var(--green); font-weight: 700; }
.ic-paid { color: var(--orange); font-weight: 600; }
.ic-cap { color: var(--blue, #60a5fa); }

/* Row 5: Knowledge + last success */
.ic-info-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.ic-info-tag {
  font-size: 0.62rem;
  color: var(--text-muted);
  white-space: nowrap;
}

/* Row 6: Footer */
.ic-sources {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 2px;
}

.ic-source-badge {
  padding: 0 4px;
  font-size: 0.55rem;
  font-weight: 700;
  border-radius: 3px;
  line-height: 1.4;
}

.ic-source-badge.src-api { background: var(--accent-subtle); color: var(--accent); }
.ic-source-badge.src-hf { background: #fff3cd; color: #856404; }
.ic-source-badge.src-md { background: #d4edff; color: #004085; }
.ic-source-badge.src-ms { background: #e2d9f3; color: #563d7c; }
.ic-source-badge.src-ll { background: #d1f2eb; color: #0d5f4e; }
.ic-source-badge.src-fr { background: #ffe0cc; color: #7a3800; }
.ic-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ic-limits {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.ic-limit-tag {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.12);
  color: var(--orange);
  white-space: nowrap;
}

.ic-limit-warn {
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.12);
  color: var(--red);
  white-space: nowrap;
}

.ic-no-limits {
  font-size: 0.6rem;
  color: var(--text-muted);
}

.ic-siblings {
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.ic-siblings-link {
  text-decoration: none;
  color: var(--accent);
}

.ic-siblings:hover,
.ic-siblings-link:hover {
  text-decoration: underline;
}

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

.ic-provider-link {
  color: inherit;
  text-decoration: none;
}
.ic-provider-link:hover {
  text-decoration: underline;
  color: var(--ic-provider-color-main, var(--accent));
}

.ic-provider-name:hover .copy-btn-badge,
.copy-btn-badge:focus-visible {
  opacity: 1;
}

@media (max-width: 768px) {
  .ic-card {
    padding: 8px 10px;
  }
  .ic-provider-name {
    font-size: 0.78rem;
  }
  .ic-siblings {
    display: none;
  }
}
</style>
