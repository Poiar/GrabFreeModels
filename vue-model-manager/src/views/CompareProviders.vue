<template>
  <div class="cp-page">
    <div class="page-header">
      <h2>Compare Providers</h2>
      <p>Side-by-side comparison of two providers.</p>
    </div>

    <div class="cp-selectors">
      <div class="cp-select-group">
        <label class="cp-select-label" for="cp-a">Provider A</label>
        <select id="cp-a" v-model="slugA" class="cp-select">
          <option value="">— Select —</option>
          <option v-for="p in providers" :key="p.slug" :value="p.slug">{{ p.name }}</option>
        </select>
      </div>
      <button class="cp-swap-btn" @click="swap" title="Swap providers" :disabled="!slugA || !slugB">
        ⇄
      </button>
      <div class="cp-select-group">
        <label class="cp-select-label" for="cp-b">Provider B</label>
        <select id="cp-b" v-model="slugB" class="cp-select">
          <option value="">— Select —</option>
          <option v-for="p in providers" :key="p.slug" :value="p.slug">{{ p.name }}</option>
        </select>
      </div>
    </div>

    <div v-if="!provA && !provB" class="cp-prompt">
      <p>Select two providers above to compare.</p>
    </div>

    <div v-else class="cp-grid">
      <!-- Header row -->
      <div class="cp-row-header">Attribute</div>
      <div class="cp-col-header" :class="{ 'cp-col-active': provA }">
        <template v-if="provA">{{ provA.name }}</template>
        <template v-else><em>Not selected</em></template>
      </div>
      <div class="cp-col-header" :class="{ 'cp-col-active': provB }">
        <template v-if="provB">{{ provB.name }}</template>
        <template v-else><em>Not selected</em></template>
      </div>

      <!-- Type -->
      <div class="cp-row-header">Type</div>
      <div class="cp-cell">
        <span v-if="provA" class="cp-tag" :class="provA.provider_type || 'unknown'">{{
          typeLabel(provA)
        }}</span>
      </div>
      <div class="cp-cell">
        <span v-if="provB" class="cp-tag" :class="provB.provider_type || 'unknown'">{{
          typeLabel(provB)
        }}</span>
      </div>

      <!-- Hardware -->
      <div class="cp-row-header">Hardware</div>
      <div class="cp-cell">
        <span v-if="provA" class="cp-tag" :class="provA.hardware || 'unknown'">{{
          hwLabel(provA)
        }}</span>
      </div>
      <div class="cp-cell">
        <span v-if="provB" class="cp-tag" :class="provB.hardware || 'unknown'">{{
          hwLabel(provB)
        }}</span>
      </div>

      <!-- Country -->
      <div class="cp-row-header">Country</div>
      <div class="cp-cell">
        <span
          v-if="provA"
          class="cp-country"
          :style="{
            color: getCountryForProvider(provA.slug).text,
            background: getCountryForProvider(provA.slug).color,
          }"
          >{{ getCountryForProvider(provA.slug).name }}</span
        >
      </div>
      <div class="cp-cell">
        <span
          v-if="provB"
          class="cp-country"
          :style="{
            color: getCountryForProvider(provB.slug).text,
            background: getCountryForProvider(provB.slug).color,
          }"
          >{{ getCountryForProvider(provB.slug).name }}</span
        >
      </div>

      <!-- Health -->
      <div class="cp-row-header">Health</div>
      <div class="cp-cell">
        <span v-if="provA" class="cp-status" :class="provA.health_status">{{
          provA.health_status
        }}</span>
      </div>
      <div class="cp-cell">
        <span v-if="provB" class="cp-status" :class="provB.health_status">{{
          provB.health_status
        }}</span>
      </div>

      <!-- Model scope -->
      <div class="cp-row-header">Model scope</div>
      <div class="cp-cell">
        <span
          v-if="provA"
          class="cp-tag"
          :class="provA.serves_third_party === false ? 'firstparty' : 'host'"
          >{{ scopeLabel(provA) }}</span
        >
      </div>
      <div class="cp-cell">
        <span
          v-if="provB"
          class="cp-tag"
          :class="provB.serves_third_party === false ? 'firstparty' : 'host'"
          >{{ scopeLabel(provB) }}</span
        >
      </div>

      <!-- OpenAI compat -->
      <div class="cp-row-header">API compat</div>
      <div class="cp-cell">
        <span v-if="provA">{{
          provA.is_openai_compat !== false ? 'OpenAI-compatible' : 'Non-standard'
        }}</span>
      </div>
      <div class="cp-cell">
        <span v-if="provB">{{
          provB.is_openai_compat !== false ? 'OpenAI-compatible' : 'Non-standard'
        }}</span>
      </div>

      <!-- Separator -->
      <div class="cp-sep" />

      <!-- Total models -->
      <div class="cp-row-header">Total models</div>
      <div class="cp-cell cp-cell-num">
        <strong v-if="provA">{{ provA.model_count }}</strong>
        <div v-if="provA" class="cp-bar-track">
          <div
            class="cp-bar-fill"
            :style="{
              width: provA.model_count
                ? (provA.working_count / provA.model_count) * 100 + '%'
                : '0%',
            }"
            :class="provA.health_status"
          ></div>
        </div>
      </div>
      <div class="cp-cell cp-cell-num">
        <strong v-if="provB">{{ provB.model_count }}</strong>
        <div v-if="provB" class="cp-bar-track">
          <div
            class="cp-bar-fill"
            :style="{
              width: provB.model_count
                ? (provB.working_count / provB.model_count) * 100 + '%'
                : '0%',
            }"
            :class="provB.health_status"
          ></div>
        </div>
      </div>

      <!-- Working -->
      <div class="cp-row-header">Working</div>
      <div class="cp-cell cp-cell-num">
        <span v-if="provA" class="cp-val working">{{ provA.working_count }}</span>
        <span v-if="provA" class="cp-pct"
          >({{
            provA.model_count ? Math.round((provA.working_count / provA.model_count) * 100) : 0
          }}%)</span
        >
      </div>
      <div class="cp-cell cp-cell-num">
        <span v-if="provB" class="cp-val working">{{ provB.working_count }}</span>
        <span v-if="provB" class="cp-pct"
          >({{
            provB.model_count ? Math.round((provB.working_count / provB.model_count) * 100) : 0
          }}%)</span
        >
      </div>

      <!-- Free models per provider -->
      <div class="cp-row-header">Free instances</div>
      <div class="cp-cell cp-cell-num">
        <strong v-if="provA" class="cp-val free">{{ modelsFor(provA.slug).length }}</strong>
      </div>
      <div class="cp-cell cp-cell-num">
        <strong v-if="provB" class="cp-val free">{{ modelsFor(provB.slug).length }}</strong>
      </div>

      <!-- Separator -->
      <div class="cp-sep" />

      <!-- Shared models -->
      <div class="cp-row-header">Shared models</div>
      <div class="cp-cell">
        <template v-if="provA && provB">
          <strong>{{ sharedModels.length }}</strong>
          <div v-if="sharedModels.length" class="cp-model-list">
            <span
              v-for="m in sharedModels.slice(0, 8)"
              :key="m.super_id"
              class="cp-model-chip shared"
              >{{ m.name }}</span
            >
            <span v-if="sharedModels.length > 8" class="cp-model-chip more"
              >+{{ sharedModels.length - 8 }} more</span
            >
          </div>
        </template>
      </div>
      <div class="cp-cell">
        <!-- shared models span both columns -->
      </div>

      <!-- Unique to A -->
      <div class="cp-row-header">Unique to A</div>
      <div class="cp-cell">
        <template v-if="provA && provB">
          <strong>{{ uniqueToA.length }}</strong>
          <div v-if="uniqueToA.length" class="cp-model-list">
            <span
              v-for="m in uniqueToA.slice(0, 8)"
              :key="m.super_id"
              class="cp-model-chip unique"
              >{{ m.name }}</span
            >
            <span v-if="uniqueToA.length > 8" class="cp-model-chip more"
              >+{{ uniqueToA.length - 8 }} more</span
            >
          </div>
        </template>
      </div>
      <div class="cp-cell">
        <template v-if="provA && provB">
          <strong>{{ uniqueToB.length }}</strong>
          <div v-if="uniqueToB.length" class="cp-model-list">
            <span
              v-for="m in uniqueToB.slice(0, 8)"
              :key="m.super_id"
              class="cp-model-chip unique"
              >{{ m.name }}</span
            >
            <span v-if="uniqueToB.length > 8" class="cp-model-chip more"
              >+{{ uniqueToB.length - 8 }} more</span
            >
          </div>
        </template>
      </div>

      <!-- Separator -->
      <div class="cp-sep" />

      <!-- Base URL -->
      <div class="cp-row-header">Base URL</div>
      <div class="cp-cell cp-url">{{ provA?.base_url || '—' }}</div>
      <div class="cp-cell cp-url">{{ provB?.base_url || '—' }}</div>

      <!-- Stream support -->
      <div class="cp-row-header">Streaming</div>
      <div class="cp-cell">
        {{ provA ? (provA.supports_streaming !== false ? '✓ Yes' : '✗ No') : '' }}
      </div>
      <div class="cp-cell">
        {{ provB ? (provB.supports_streaming !== false ? '✓ Yes' : '✗ No') : '' }}
      </div>

      <div class="cp-sep" />

      <!-- Latency comparison -->
      <div class="cp-row-header">Avg latency</div>
      <div class="cp-cell cp-cell-num">
        <span v-if="latA" class="cp-val">{{ latA.avg_latency_ms }}ms</span>
        <em class="cp-na" v-else>—</em>
      </div>
      <div class="cp-cell cp-cell-num">
        <span v-if="latB" class="cp-val">{{ latB.avg_latency_ms }}ms</span>
        <em class="cp-na" v-else>—</em>
      </div>

      <div class="cp-row-header">P95 latency</div>
      <div class="cp-cell cp-cell-num">
        <span v-if="latA" class="cp-val">{{ latA.p95_latency_ms }}ms</span>
        <em class="cp-na" v-else>—</em>
      </div>
      <div class="cp-cell cp-cell-num">
        <span v-if="latB" class="cp-val">{{ latB.p95_latency_ms }}ms</span>
        <em class="cp-na" v-else>—</em>
      </div>

      <!-- Description -->
      <!-- Failure rate -->
      <div class="cp-row-header">Failure rate</div>
      <div class="cp-cell">
        <template v-if="provA">
          <span class="cp-fail-rate" :class="failClass(failRateA)">{{ failRateA }}%</span>
          <div class="cp-fail-chips" v-if="failBreakdownA.length">
            <span v-for="f in failBreakdownA" :key="f.cat" class="cp-fail-chip"
              >{{ f.count }} {{ f.label }}</span
            >
          </div>
        </template>
      </div>
      <div class="cp-cell">
        <template v-if="provB">
          <span class="cp-fail-rate" :class="failClass(failRateB)">{{ failRateB }}%</span>
          <div class="cp-fail-chips" v-if="failBreakdownB.length">
            <span v-for="f in failBreakdownB" :key="f.cat" class="cp-fail-chip"
              >{{ f.count }} {{ f.label }}</span
            >
          </div>
        </template>
      </div>

      <!-- Tier distribution -->
      <div class="cp-row-header">Model tiers</div>
      <div class="cp-cell">
        <div v-if="provA && tierDistA.length" class="cp-tier-chips">
          <span v-for="[tier, count] in tierDistA" :key="tier" class="cp-tier-chip"
            >{{ tier }}: {{ count }}</span
          >
        </div>
        <span v-else>—</span>
      </div>
      <div class="cp-cell">
        <div v-if="provB && tierDistB.length" class="cp-tier-chips">
          <span v-for="[tier, count] in tierDistB" :key="tier" class="cp-tier-chip"
            >{{ tier }}: {{ count }}</span
          >
        </div>
        <span v-else>—</span>
      </div>

      <div class="cp-row-header">Description</div>
      <div class="cp-cell cp-desc">{{ provA?.description || '—' }}</div>
      <div class="cp-cell cp-desc">{{ provB?.description || '—' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '@/store/models';
import { getCountryForProvider } from '@/data/provider-countries';
import type { ProviderReference } from '@/types';

const store = useModelsStore();

const slugA = ref('');
const slugB = ref('');

const providers = computed((): ProviderReference[] =>
  [...store.visibleProviderRefs].sort(
    (a, b) => b.model_count - a.model_count || a.name.localeCompare(b.name),
  ),
);

const provA = computed(() => providers.value.find((p) => p.slug === slugA.value) || null);
const provB = computed(() => providers.value.find((p) => p.slug === slugB.value) || null);
const latA = computed(
  () => store.providerLatencies.find((l) => l.provider_slug === slugA.value) ?? null,
);
const latB = computed(
  () => store.providerLatencies.find((l) => l.provider_slug === slugB.value) ?? null,
);

function swap() {
  const tmp = slugA.value;
  slugA.value = slugB.value;
  slugB.value = tmp;
}

function typeLabel(p: ProviderReference): string {
  const labels: Record<string, string> = {
    router: 'Router',
    inference: 'Inference',
    local: 'Local',
    discovery: 'Discovery',
  };
  return labels[p.provider_type || 'unknown'] || p.provider_type || 'Unknown';
}

function hwLabel(p: ProviderReference): string {
  const labels: Record<string, string> = {
    gpu: 'GPU',
    lpu: 'LPU',
    wafer: 'Wafer-scale',
    tpu: 'TPU',
    edge: 'Edge',
    local: 'Local',
    unknown: '—',
  };
  return labels[p.hardware || 'unknown'] || p.hardware || '—';
}

function scopeLabel(p: ProviderReference): string {
  if (p.provider_type === 'router') return 'Multi-provider';
  if (p.provider_type === 'local') return 'Any model';
  if (p.provider_type === 'discovery') return 'N/A';
  return p.serves_third_party === false ? 'First-party only' : 'Open-model host';
}

// Show all models for a provider (deduped by super_id)
function modelsFor(slug: string): { super_id: number; name: string }[] {
  const seen = new Set<number>();
  const result: { super_id: number; name: string }[] = [];
  for (const model of store.visibleModels) {
    for (const dp of model.providers) {
      if (dp.provider_slug === slug && !seen.has(model.super_id)) {
        seen.add(model.super_id);
        result.push({ super_id: model.super_id, name: model.name });
      }
    }
  }
  return result;
}

const sharedModels = computed(() => {
  if (!slugA.value || !slugB.value || slugA.value === slugB.value) return [];
  const a = new Set(modelsFor(slugA.value).map((m) => m.super_id));
  return modelsFor(slugB.value).filter((m) => a.has(m.super_id));
});

const uniqueToA = computed(() => {
  if (!slugA.value || !slugB.value || slugA.value === slugB.value) return [];
  const b = new Set(modelsFor(slugB.value).map((m) => m.super_id));
  return modelsFor(slugA.value).filter((m) => !b.has(m.super_id));
});

const uniqueToB = computed(() => {
  if (!slugA.value || !slugB.value || slugA.value === slugB.value) return [];
  const a = new Set(modelsFor(slugA.value).map((m) => m.super_id));
  return modelsFor(slugB.value).filter((m) => !a.has(m.super_id));
});

// ── Failure rates ──
const FAILURE_LABELS: Record<string, string> = {
  timeout: 'Timeout',
  not_found: 'Not found',
  auth_error: 'Auth',
  rate_limited: 'RL',
  server_error: '5xx',
  network_error: 'Net',
  unknown: 'Unknown',
};

function computeFailStats(slug: string) {
  let working = 0,
    broken = 0;
  const failCats = new Map<string, number>();
  for (const m of store.allModels) {
    for (const dp of m.providers) {
      if (dp.provider_slug !== slug || dp._removed) continue;
      if (dp.status.result === 'working') working++;
      else {
        broken++;
        failCats.set(
          dp.failure_category || 'unknown',
          (failCats.get(dp.failure_category || 'unknown') || 0) + 1,
        );
      }
    }
  }
  const total = working + broken || 1;
  return {
    rate: Math.round((broken / total) * 100),
    breakdown: [...failCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
  };
}

const failStatsA = computed(() =>
  slugA.value ? computeFailStats(slugA.value) : { rate: 0, breakdown: [] as [string, number][] },
);
const failStatsB = computed(() =>
  slugB.value ? computeFailStats(slugB.value) : { rate: 0, breakdown: [] as [string, number][] },
);
const failRateA = computed(() => failStatsA.value.rate);
const failRateB = computed(() => failStatsB.value.rate);
const failBreakdownA = computed(() =>
  failStatsA.value.breakdown.map(([cat, count]) => ({
    cat,
    count,
    label: FAILURE_LABELS[cat] || cat,
  })),
);
const failBreakdownB = computed(() =>
  failStatsB.value.breakdown.map(([cat, count]) => ({
    cat,
    count,
    label: FAILURE_LABELS[cat] || cat,
  })),
);
function failClass(rate: number) {
  return rate <= 10 ? 'good' : rate <= 30 ? 'warn' : 'bad';
}

// ── Tier distribution ──
const tierDistA = computed(() => {
  if (!slugA.value) return [] as [string, number][];
  const dist = new Map<string, number>();
  for (const m of store.allModels) {
    for (const dp of m.providers) {
      if (dp.provider_slug !== slugA.value || dp._removed) continue;
      for (const tier of dp.model_tier || []) {
        if (tier) dist.set(tier, (dist.get(tier) || 0) + 1);
      }
    }
  }
  return [...dist.entries()].sort((a, b) => b[1] - a[1]);
});
const tierDistB = computed(() => {
  if (!slugB.value) return [] as [string, number][];
  const dist = new Map<string, number>();
  for (const m of store.allModels) {
    for (const dp of m.providers) {
      if (dp.provider_slug !== slugB.value || dp._removed) continue;
      for (const tier of dp.model_tier || []) {
        if (tier) dist.set(tier, (dist.get(tier) || 0) + 1);
      }
    }
  }
  return [...dist.entries()].sort((a, b) => b[1] - a[1]);
});
</script>

<style scoped>
.cp-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}
.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0 0 4px;
}
.page-header p {
  font-size: 0.78rem;
  color: var(--text-dim);
  margin: 0 0 20px;
}

/* Selectors */
.cp-selectors {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 24px;
}
.cp-select-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cp-select-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-dim);
  letter-spacing: 0.04em;
}
.cp-select {
  font-size: 0.82rem;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--text);
  font-family: inherit;
}
.cp-select:focus {
  outline: none;
  border-color: var(--accent);
}
.cp-swap-btn {
  font-size: 1.1rem;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--text-dim);
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
}
.cp-swap-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--text-dim);
}
.cp-swap-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.cp-prompt {
  text-align: center;
  padding: 60px 0;
  color: var(--text-dim);
  font-size: 0.9rem;
}

/* Grid */
.cp-grid {
  display: grid;
  grid-template-columns: 140px 1fr 1fr;
  gap: 1px;
  background: var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.cp-row-header {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  padding: 8px 12px;
  background: var(--bg-card);
  display: flex;
  align-items: center;
}
.cp-col-header {
  font-size: 0.85rem;
  font-weight: 700;
  padding: 10px 14px;
  background: var(--bg-card);
  text-align: center;
}
.cp-col-header.cp-col-active {
  color: var(--accent);
}
.cp-cell {
  padding: 8px 14px;
  background: var(--bg-card);
  font-size: 0.78rem;
  min-height: 36px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}
.cp-cell-num strong {
  font-size: 1.1rem;
  font-family: 'JetBrains Mono', monospace;
}
.cp-sep {
  grid-column: 1 / -1;
  height: 8px;
  background: var(--bg);
}
.cp-url {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem;
  color: var(--text-dim);
  word-break: break-all;
  opacity: 0.7;
}
.cp-desc {
  font-size: 0.75rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* Tags */
.cp-tag {
  display: inline-block;
  font-size: 0.62rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.03em;
  width: fit-content;
}
.cp-tag.router {
  background: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
}
.cp-tag.inference {
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
}
.cp-tag.local {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
}
.cp-tag.discovery {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
}
.cp-tag.unknown {
  background: rgba(156, 163, 175, 0.12);
  color: #9ca3af;
}
.cp-tag.gpu {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.cp-tag.lpu {
  background: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
}
.cp-tag.wafer {
  background: rgba(244, 114, 182, 0.12);
  color: #f472b6;
}
.cp-tag.tpu {
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
}
.cp-tag.edge {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
}
.cp-tag.firstparty {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.cp-tag.host {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
}

.cp-country {
  display: inline-block;
  font-size: 0.58rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.04em;
  width: fit-content;
}
.cp-status {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 999px;
  letter-spacing: 0.03em;
  width: fit-content;
}
.cp-status.healthy {
  background: rgba(63, 185, 80, 0.12);
  color: var(--green);
}
.cp-status.degraded {
  background: rgba(251, 191, 36, 0.12);
  color: var(--orange);
}
.cp-status.down {
  background: rgba(248, 113, 113, 0.12);
  color: var(--red);
}

/* Values */
.cp-val {
  font-family: 'JetBrains Mono', monospace;
}
.cp-val.working {
  color: var(--green);
}
.cp-val.free {
  color: var(--accent);
}
.cp-pct {
  font-size: 0.65rem;
  color: var(--text-dim);
  margin-left: 4px;
}

/* Health bar */
.cp-bar-track {
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
  width: 100%;
}
.cp-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s;
}
.cp-bar-fill.healthy {
  background: var(--green);
}
.cp-bar-fill.degraded {
  background: var(--orange);
}
.cp-bar-fill.down {
  background: var(--red);
}

/* Model chips */
.cp-model-list {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 4px;
}
.cp-model-chip {
  padding: 1px 6px;
  font-size: 0.6rem;
  border-radius: 999px;
  white-space: nowrap;
}
.cp-model-chip.shared {
  background: var(--accent-subtle);
  color: var(--accent);
}
.cp-model-chip.unique {
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
}
.cp-model-chip.more {
  background: var(--bg-hover);
  color: var(--text-dim);
}

.cp-fail-rate {
  font-size: 0.85rem;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}
.cp-fail-rate.good {
  color: var(--green);
}
.cp-fail-rate.warn {
  color: var(--orange);
}
.cp-fail-rate.bad {
  color: var(--red);
}
.cp-fail-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 4px;
}
.cp-fail-chip {
  font-size: 0.58rem;
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--text-dim);
  background: var(--bg-elevated);
}

.cp-tier-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.cp-tier-chip {
  font-size: 0.58rem;
  padding: 1px 6px;
  border-radius: 3px;
  color: var(--accent);
  background: var(--accent-subtle);
  font-weight: 600;
}

@media (max-width: 768px) {
  .cp-grid {
    grid-template-columns: 100px 1fr 1fr;
  }
  .cp-selectors {
    flex-direction: column;
  }
  .cp-swap-btn {
    align-self: center;
    transform: rotate(90deg);
  }
}
</style>
