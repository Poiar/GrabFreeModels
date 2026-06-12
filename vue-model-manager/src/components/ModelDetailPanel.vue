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

          <!-- Key-derived features -->
          <div v-if="dpTiers.length || dpVariant || dpSize || dpThinking || dpCoding || dpStage || dpVersion || dpDescription" class="dp-derived-tags">
            <span v-for="tier in dpTiers" :key="'tier-'+tier" class="sm-tier-chip">{{ tier.charAt(0).toUpperCase() + tier.slice(1) }}</span>
            <span v-if="dpVariant" class="sm-variant-chip">{{ dpVariant.charAt(0).toUpperCase() + dpVariant.slice(1) }}</span>
            <span v-if="dpSize" class="sm-size-chip">{{ dpSize }}</span>
            <span v-if="dpThinking" class="sm-thinking-chip">Thinking</span>
            <span v-if="dpStage" class="sm-stage-chip" :class="'stage-'+dpStage">{{ dpStage === 'experimental' ? 'Exp' : dpStage.charAt(0).toUpperCase() + dpStage.slice(1) }}</span>
            <span v-if="dpCoding" class="sm-coder-chip">Coder</span>
            <span v-if="dpVersion" class="sm-version-chip">v{{ dpVersion }}</span>
            <span v-if="dpDescription" class="dp-description-text">{{ dpDescription }}</span>
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

          <!-- Health history -->
          <div v-if="providerHealthList.length" class="dp-health">
            <h3 class="dp-section-title">Health History</h3>
            <div v-for="h in providerHealthList" :key="h.fullId" class="dp-health-row">
              <span class="dp-health-provider">{{ h.providerName }}</span>
              <span
                class="dp-stability-badge"
                :class="stabilityClass(h.stability)"
                :title="`Stability: ${h.stability}%`"
              >
                {{ h.stability }}%
              </span>
              <div class="dp-sparkline">
                <span
                  v-for="(snap, i) in h.lastSnapshots"
                  :key="i"
                  class="dp-sparkline-dot"
                  :class="`dot-${snap.status}`"
                  :title="snapTooltip(snap)"
                ></span>
              </div>
              <span class="dp-health-streak">{{ h.streakText }}</span>
              <span v-if="h.lastWorking" class="dp-health-last">{{ h.lastWorking }}</span>
            </div>
          </div>
          <div v-else class="dp-health-empty">
            No health history yet — run validation to collect data.
          </div>

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
import type { ModelData, CreatorData, KnownIssue, HealthSnapshot } from '@/types';
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

// ── Key-derived aggregates across all providers ──
const dpTiers = computed(() => {
  const set = new Set<string>();
  for (const dp of props.model.providers) if (!dp._removed) for (const t of (dp.model_tier || [])) set.add(t);
  return [...set].sort();
});
const dpVariant = computed(() => {
  for (const dp of props.model.providers) if (!dp._removed && dp.model_variant) return dp.model_variant;
  return null;
});
const dpSize = computed(() => {
  let minB = Infinity; let maxB = 0; let activeB: number | null = null; let experts: number | null = null;
  for (const dp of props.model.providers) {
    if (dp._removed) continue;
    if (dp.param_count_b) {
      if (dp.param_count_b < minB) minB = dp.param_count_b;
      if (dp.param_count_b > maxB) maxB = dp.param_count_b;
    }
    if (dp.active_param_count_b) activeB = dp.active_param_count_b;
    if (dp.expert_count) experts = dp.expert_count;
  }
  if (!isFinite(minB)) return null;
  const parts: string[] = [];
  parts.push(minB === maxB ? `${maxB}B params` : `${minB}B–${maxB}B params`);
  if (activeB) parts.push(`${activeB}B active`);
  if (experts) parts.push(`${experts} experts`);
  return parts.join(' · ');
});
const dpThinking = computed(() => props.model.providers.some(dp => !dp._removed && dp.thinking_variant));
const dpCoding = computed(() => props.model.providers.some(dp => !dp._removed && dp.coding_specialized));
const dpStage = computed(() => {
  for (const dp of props.model.providers) if (!dp._removed && dp.release_stage) return dp.release_stage;
  return null;
});
const dpVersion = computed(() => {
  for (const dp of props.model.providers) if (!dp._removed && dp.model_version) return dp.model_version;
  return null;
});
const dpDescription = computed(() => {
  for (const dp of props.model.providers) if (!dp._removed && dp.description) return dp.description;
  return null;
});

const MAX_LINEAGE_DEPTH = 30;
const lineageChain = computed(() => {
  const chain: { name: string; slug: string | null }[] = [];
  let slug = props.model.base_model;
  const visited = new Set<string>();
  let steps = 0;
  while (slug && steps < MAX_LINEAGE_DEPTH) {
    steps++;
    if (visited.has(slug)) break;
    visited.add(slug);
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

// ── Health history ──
interface HealthRow {
  fullId: string;
  providerName: string;
  stability: number;
  lastSnapshots: HealthSnapshot[];
  streakText: string;
  lastWorking: string | null;
}

const providerHealthList = computed((): HealthRow[] => {
  const rows: HealthRow[] = [];
  for (const dp of props.model.providers) {
    const health = store.getModelHealth(dp.full_id);
    if (!health || health.snapshots.length === 0) continue;
    const lastSnapshots = health.snapshots.slice(-15);
    const latest = lastSnapshots[lastSnapshots.length - 1];
    let streakText: string;
    if (latest.status === 'working') {
      streakText = `Working for ${health.streak} consecutive tests`;
    } else if (latest.status === 'broken' || latest.status === 'not_found') {
      streakText = `Broken for ${health.streak} tests`;
    } else {
      streakText = `${health.streak} tests`;
    }
    rows.push({
      fullId: dp.full_id,
      providerName: dp.provider,
      stability: health.stability,
      lastSnapshots,
      streakText,
      lastWorking: health.last_working ? formatDateNice(health.last_working) : null,
    });
  }
  return rows;
});

function stabilityClass(stability: number): string {
  if (stability >= 90) return 'stab-green';
  if (stability >= 70) return 'stab-yellow';
  return 'stab-red';
}

function snapTooltip(snap: HealthSnapshot): string {
  const date = new Date(snap.date);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  let text = `${dateStr}: ${snap.status}`;
  if (snap.detail) text += ` — ${snap.detail}`;
  if (snap.latency_ms !== null) text += ` (${snap.latency_ms}ms)`;
  return text;
}

function formatDateNice(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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

/* ── Health History ── */
.dp-health {
  margin-top: 4px;
}

.dp-health-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.dp-health-provider {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text);
  min-width: 80px;
  flex-shrink: 0;
}

.dp-stability-badge {
  padding: 1px 7px;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 999px;
  flex-shrink: 0;
}

.dp-stability-badge.stab-green {
  background: rgba(52, 211, 153, 0.15);
  color: var(--green);
}

.dp-stability-badge.stab-yellow {
  background: rgba(251, 191, 36, 0.15);
  color: var(--orange);
}

.dp-stability-badge.stab-red {
  background: rgba(239, 68, 68, 0.12);
  color: var(--red);
}

.dp-sparkline {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.dp-sparkline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: default;
  transition: transform 0.12s;
}

.dp-sparkline-dot:hover {
  transform: scale(1.6);
}

.dp-sparkline-dot.dot-working {
  background: var(--green);
}

.dp-sparkline-dot.dot-broken {
  background: var(--red);
}

.dp-sparkline-dot.dot-rate_limited {
  background: var(--orange);
}

.dp-sparkline-dot.dot-not_found {
  background: #9ca3af;
}

.dp-sparkline-dot.dot-untested {
  background: var(--text-muted);
}

.dp-sparkline-dot.dot-unknown {
  background: var(--text-muted);
  opacity: 0.5;
}

.dp-health-streak {
  font-size: 0.68rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.dp-health-last {
  font-size: 0.65rem;
  color: var(--text-muted);
  opacity: 0.8;
  white-space: nowrap;
}

.dp-health-empty {
  padding: 16px 0;
  font-size: 0.78rem;
  color: var(--text-muted);
  text-align: center;
  font-style: italic;
}

@media (max-width: 768px) {
  .detail-panel {
    width: 100vw;
    border-left: none;
  }
}
</style>
