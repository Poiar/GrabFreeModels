<template>
  <div class="po-page">
    <div class="page-header">
      <h2>Provider Onboarding</h2>
      <p>
        What you need to start using each free LLM provider — API keys, rate limits, compatibility
      </p>
    </div>

    <!-- Summary cards -->
    <div class="po-summary">
      <div class="po-sum-card green">
        <span class="po-sum-value">{{ noAuth.length }}</span>
        <span class="po-sum-label">No auth needed</span>
      </div>
      <div class="po-sum-card blue">
        <span class="po-sum-value">{{ apiKeyOnly.length }}</span>
        <span class="po-sum-label">API key only</span>
      </div>
      <div class="po-sum-card orange">
        <span class="po-sum-value">{{ accountKey.length }}</span>
        <span class="po-sum-label">Account + key</span>
      </div>
      <div class="po-sum-card red">
        <span class="po-sum-value">{{ cardRequired.length }}</span>
        <span class="po-sum-label">Card required</span>
      </div>
      <div class="po-sum-card purple">
        <span class="po-sum-value">{{ streamCount }}</span>
        <span class="po-sum-label">Supports streaming</span>
      </div>
      <div class="po-sum-card teal">
        <span class="po-sum-value">{{ compatCount }}</span>
        <span class="po-sum-label">OpenAI-compatible</span>
      </div>
    </div>

    <!-- Filter chips -->
    <div class="po-filters">
      <button
        v-for="f in filters"
        :key="f.key"
        class="po-filter-chip"
        :class="{ active: activeFilter === f.key }"
        @click="activeFilter = f.key"
      >
        {{ f.label }} ({{ f.count }})
      </button>
    </div>

    <!-- Provider cards -->
    <div class="po-grid">
      <div v-for="provider in filteredProviders" :key="provider.slug" class="po-card">
        <div class="po-card-header">
          <div class="po-card-title-row">
            <ProviderIcon
              :slug="provider.slug"
              :size="22"
              :alt="provider.name"
              cls="po-prov-icon"
            />
            <div>
              <h3>{{ provider.name }}</h3>
              <span class="po-card-slug">{{ provider.slug }}</span>
            </div>
          </div>
          <span class="po-card-type" :class="provider.provider_type || 'unknown'">{{
            PROVIDER_TYPE_LABELS[provider.provider_type || ''] ||
            provider.provider_type ||
            'Unknown'
          }}</span>
        </div>

        <!-- Auth requirements -->
        <div class="po-card-section">
          <h4>🔑 Access</h4>
          <div class="po-tags">
            <span
              v-if="!provider.requires_account_id && !provider.requires_card"
              class="po-tag green"
              >No auth required</span
            >
            <span v-if="provider.requires_account_id" class="po-tag blue">Account signup</span>
            <span v-if="provider.requires_card" class="po-tag red">Credit card required</span>
            <span v-if="provider.is_openai_compat" class="po-tag teal">OpenAI-compatible API</span>
            <span
              v-if="!provider.is_openai_compat && provider.is_openai_compat !== null"
              class="po-tag orange"
              >Custom API</span
            >
          </div>
        </div>

        <!-- Endpoint -->
        <div class="po-card-section" v-if="provider.base_url">
          <h4>🔗 Endpoint</h4>
          <code class="po-code">{{ provider.base_url }}</code>
        </div>

        <!-- Compatibility -->
        <div class="po-card-section">
          <h4>⚙️ Features</h4>
          <div class="po-tags">
            <span v-if="provider.supports_streaming" class="po-tag green">Streaming ✓</span>
            <span v-else class="po-tag dim">No streaming</span>
            <span v-if="provider.is_openai_compat" class="po-tag teal">OpenAI SDK</span>
            <span v-if="provider.npm_package" class="po-tag purple"
              >npm: {{ provider.npm_package }}</span
            >
            <span v-if="provider.hardware && provider.hardware !== 'unknown'" class="po-tag gold">{{
              HARDWARE_LABELS[provider.hardware] || provider.hardware
            }}</span>
          </div>
        </div>

        <!-- Rate limits -->
        <div
          class="po-card-section"
          v-if="provider.max_rpm || provider.max_tpm || provider.max_daily_requests"
        >
          <h4>⏱ Rate Limits</h4>
          <div class="po-tags">
            <span v-if="provider.max_rpm" class="po-tag rate">{{ provider.max_rpm }} RPM</span>
            <span v-if="provider.max_tpm" class="po-tag rate"
              >{{ formatTpm(provider.max_tpm) }} TPM</span
            >
            <span v-if="provider.max_daily_requests" class="po-tag rate"
              >{{ provider.max_daily_requests?.toLocaleString() }} req/day</span
            >
          </div>
        </div>

        <!-- Stats -->
        <div class="po-card-stats">
          <span class="po-card-stat">{{ provider.model_count }} models</span>
          <span class="po-card-stat">{{ provider.working_count }} working</span>
          <span class="po-card-stat health" :class="provider.health_status">{{
            provider.health_status
          }}</span>
        </div>

        <!-- Description -->
        <p v-if="provider.description" class="po-description">{{ provider.description }}</p>

        <!-- Quick start snippet -->
        <div class="po-snippet" v-if="provider.is_openai_compat && provider.base_url">
          <h4>📋 Quick Start</h4>
          <pre><code>from openai import OpenAI
client = OpenAI(
    base_url="{{ provider.base_url }}/v1",
    api_key="{{ provider.requires_account_id ? 'your-key' : 'not-needed' }}"
)
response = client.chat.completions.create(
    model="&lt;model-id&gt;",
    messages=[{"role": "user", "content": "Hello!"}]
)</code></pre>
        </div>

        <router-link :to="`/provider/${provider.slug}`" class="po-detail-link"
          >Full provider details →</router-link
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '@/store/models';
import ProviderIcon from '@/components/ProviderIcon.vue';

const store = useModelsStore();

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  router: 'Router',
  inference: 'Inference',
  local: 'Local',
  discovery: 'Discovery',
};
const HARDWARE_LABELS: Record<string, string> = {
  gpu: 'GPU',
  lpu: 'LPU (Groq)',
  wafer: 'Wafer-scale',
  tpu: 'TPU',
  edge: 'Edge',
  local: 'Local',
};

function formatTpm(tpm: number | null): string {
  if (!tpm) return '—';
  return tpm >= 1000000 ? `${(tpm / 1000000).toFixed(1)}M` : tpm.toLocaleString();
}

const providers = computed(() => store.providerRefs);
const noAuth = computed(() =>
  providers.value.filter((p) => !p.requires_account_id && !p.requires_card),
);
const apiKeyOnly = computed(() =>
  providers.value.filter((p) => p.requires_account_id && !p.requires_card),
);
const accountKey = computed(() => providers.value.filter((p) => p.requires_account_id));
const cardRequired = computed(() => providers.value.filter((p) => p.requires_card));
const streamCount = computed(() => providers.value.filter((p) => p.supports_streaming).length);
const compatCount = computed(() => providers.value.filter((p) => p.is_openai_compat).length);

const activeFilter = ref('all');
const filters = computed(() => [
  { key: 'all', label: 'All', count: providers.value.length },
  { key: 'noauth', label: 'No auth', count: noAuth.value.length },
  { key: 'apikey', label: 'API key', count: apiKeyOnly.value.length },
  { key: 'account', label: 'Account', count: accountKey.value.length },
  { key: 'card', label: 'Card', count: cardRequired.value.length },
  { key: 'compat', label: 'OpenAI-compat', count: compatCount.value },
  { key: 'stream', label: 'Streaming', count: streamCount.value },
]);

const filteredProviders = computed(() => {
  let list = providers.value;
  if (activeFilter.value === 'noauth') list = noAuth.value;
  else if (activeFilter.value === 'apikey') list = apiKeyOnly.value;
  else if (activeFilter.value === 'account') list = accountKey.value;
  else if (activeFilter.value === 'card') list = cardRequired.value;
  else if (activeFilter.value === 'compat')
    list = providers.value.filter((p) => p.is_openai_compat);
  else if (activeFilter.value === 'stream')
    list = providers.value.filter((p) => p.supports_streaming);
  return list.sort((a, b) => b.model_count - a.model_count);
});
</script>

<style scoped>
.po-page {
  max-width: 1200px;
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
  color: var(--text-muted);
  margin: 0;
}

.po-summary {
  display: flex;
  gap: 10px;
  margin: 16px 0;
  flex-wrap: wrap;
}
.po-sum-card {
  display: flex;
  flex-direction: column;
  padding: 12px 18px;
  border-radius: 8px;
  min-width: 100px;
}
.po-sum-card.green {
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.25);
}
.po-sum-card.blue {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.25);
}
.po-sum-card.orange {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
}
.po-sum-card.red {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
}
.po-sum-card.purple {
  background: rgba(168, 85, 247, 0.1);
  border: 1px solid rgba(168, 85, 247, 0.25);
}
.po-sum-card.teal {
  background: rgba(20, 184, 166, 0.1);
  border: 1px solid rgba(20, 184, 166, 0.25);
}
.po-sum-value {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--accent);
}
.po-sum-label {
  font-size: 0.62rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.po-filters {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.po-filter-chip {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;
}
.po-filter-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.po-filter-chip.active {
  background: var(--accent-subtle);
  border-color: var(--accent);
  color: var(--accent);
}

.po-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}
.po-card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.po-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.po-card-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.po-card-title-row h3 {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
}
.po-card-slug {
  font-size: 0.62rem;
  color: var(--text-dim);
}
.po-prov-icon {
  border-radius: 4px;
  flex-shrink: 0;
}
.po-card-type {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
}
.po-card-type.router {
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.12);
}
.po-card-type.inference {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.12);
}
.po-card-type.local {
  color: #34d399;
  background: rgba(52, 211, 153, 0.12);
}
.po-card-type.discovery {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
}
.po-card-type.unknown {
  color: var(--text-dim);
  background: var(--bg-elevated);
}

.po-card-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.po-card-section h4 {
  font-size: 0.7rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.po-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.po-tag {
  font-size: 0.62rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}
.po-tag.green {
  color: #34d399;
  background: rgba(52, 211, 153, 0.1);
}
.po-tag.blue {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.1);
}
.po-tag.red {
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
}
.po-tag.orange {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}
.po-tag.teal {
  color: #2dd4bf;
  background: rgba(45, 212, 191, 0.1);
}
.po-tag.purple {
  color: #a855f7;
  background: rgba(168, 85, 247, 0.1);
}
.po-tag.gold {
  color: #eab308;
  background: rgba(234, 179, 8, 0.1);
}
.po-tag.dim {
  color: var(--text-dim);
  background: var(--bg-elevated);
}
.po-tag.rate {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6rem;
  color: var(--accent);
  background: var(--accent-subtle);
}

.po-code {
  font-size: 0.65rem;
  font-family: 'JetBrains Mono', monospace;
  padding: 4px 8px;
  background: var(--bg-elevated);
  border-radius: 4px;
  color: var(--text-dim);
  word-break: break-all;
}

.po-card-stats {
  display: flex;
  gap: 8px;
}
.po-card-stat {
  font-size: 0.62rem;
  color: var(--text-dim);
  font-weight: 600;
}
.po-card-stat.health.healthy {
  color: var(--green);
}
.po-card-stat.health.degraded {
  color: var(--orange);
}
.po-card-stat.health.down {
  color: var(--red);
}

.po-description {
  font-size: 0.72rem;
  color: var(--text-secondary);
  line-height: 1.4;
  margin: 0;
}

.po-snippet {
  margin-top: 4px;
}
.po-snippet h4 {
  font-size: 0.7rem;
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.po-snippet pre {
  margin: 0;
  padding: 8px 10px;
  background: var(--bg-elevated);
  border-radius: 6px;
  overflow-x: auto;
}
.po-snippet code {
  font-size: 0.62rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-dim);
  line-height: 1.5;
}

.po-detail-link {
  font-size: 0.7rem;
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  align-self: flex-end;
}
.po-detail-link:hover {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .po-page {
    padding: 12px;
  }
  .po-grid {
    grid-template-columns: 1fr;
  }
}
</style>
