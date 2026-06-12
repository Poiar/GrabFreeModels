<template>
  <div v-if="org" class="org-detail-page">
    <div class="page-header">
      <router-link to="/organizations" class="back-link">← Organizations</router-link>
      <div class="org-header-row">
        <h2>
          {{ org.name }}
          <span class="org-kind-badge" :class="org.kind">{{ kindLabel }}</span>
        </h2>
        <div class="org-header-actions">
          <button class="org-copy-btn" @click="copyOrgAsMarkdown(org)" title="Copy as Markdown">
            ↓ MD
          </button>
          <button class="org-copy-btn" @click="copyAsJson(org)" title="Copy as JSON">↓ JSON</button>
          <span v-if="copied" class="org-copied-toast">Copied!</span>
        </div>
      </div>
      <p v-if="org.description" class="org-description">{{ org.description }}</p>
    </div>

    <!-- ── Stats row ── -->
    <div class="org-meta-grid">
      <div class="org-stat">
        <span class="org-stat-value">{{ org.kind }}</span>
        <span class="org-stat-label">Type</span>
      </div>
      <div v-if="org.creator_type" class="org-stat">
        <span class="org-stat-value">{{ org.creator_type }}</span>
        <span class="org-stat-label">Classification</span>
      </div>
      <div v-if="org.creator_role" class="org-stat">
        <span class="org-stat-value">{{ org.creator_role }}</span>
        <span class="org-stat-label">Role</span>
      </div>
      <div v-if="org.model_count > 0" class="org-stat">
        <span class="org-stat-value">{{ org.model_count }}</span>
        <span class="org-stat-label">Models</span>
      </div>
      <div v-if="org.provider_slugs.length > 0" class="org-stat">
        <span class="org-stat-value">{{ org.provider_slugs.length }}</span>
        <span class="org-stat-label">Provider endpoints</span>
      </div>
    </div>

    <!-- ── Creator Section ── -->
    <template v-if="org.kind === 'creator' || org.kind === 'both'">
      <div class="org-section">
        <h3 class="section-title">Models</h3>
        <p class="org-section-sub">
          {{ org.model_count }} model{{ org.model_count !== 1 ? 's' : '' }} across
          {{ org.provider_count }} provider{{ org.provider_count !== 1 ? 's' : '' }}
        </p>

        <!-- Provider icons row -->
        <div class="org-provider-icons" v-if="org.provider_slugs.length">
          <ProviderIcon
            v-for="slug in org.provider_slugs"
            :key="slug"
            :slug="slug"
            :size="20"
            :alt="slug"
            cls="org-prov-icon"
          />
        </div>

        <!-- Family tags -->
        <div v-if="familyList.length" class="org-families">
          <span class="org-families-label">Families:</span>
          <router-link
            v-for="f in familyList"
            :key="f"
            :to="`/family/${encodeURIComponent(f)}`"
            class="org-family-tag"
            >{{ f }}</router-link
          >
        </div>

        <!-- Model cards -->
        <div class="org-models">
          <SuperModelCard
            v-for="model in org.models"
            :key="model.slug"
            :model="model"
            :creator-slug="org.id"
            @click="openDetail(model)"
            @creator-click="() => {}"
          />
        </div>
        <div v-if="org.models.length === 0" class="org-empty">No models.</div>
      </div>
    </template>

    <!-- ── Provider Section ── -->
    <template v-if="org.kind === 'provider' || org.kind === 'both'">
      <div class="org-section">
        <h3 class="section-title">Provider Details</h3>
        <p v-if="org.provider_description" class="org-section-sub">
          {{ org.provider_description }}
        </p>

        <div class="org-provider-meta-grid">
          <div v-if="org.base_url" class="org-stat">
            <span class="org-stat-value org-stat-url">{{ org.base_url }}</span>
            <span class="org-stat-label">Base URL</span>
          </div>
          <div v-if="org.npm_package" class="org-stat">
            <span class="org-stat-value org-stat-pkg">{{ org.npm_package }}</span>
            <span class="org-stat-label">npm package</span>
          </div>
          <div v-if="org.provider_type" class="org-stat">
            <span class="org-stat-value org-stat-type" :class="org.provider_type">{{
              PROVIDER_TYPE_LABELS[org.provider_type] || org.provider_type
            }}</span>
            <span class="org-stat-label">Type</span>
          </div>
          <div
            v-if="org.provider_type === 'inference' && org.serves_third_party !== null"
            class="org-stat"
          >
            <span
              class="org-stat-value org-stat-host"
              :class="org.serves_third_party ? 'host' : 'firstparty'"
              >{{ org.serves_third_party ? 'Open-model host' : 'First-party only' }}</span
            >
            <span class="org-stat-label">Model scope</span>
          </div>
          <div v-if="org.hardware && org.hardware !== 'unknown'" class="org-stat">
            <span class="org-stat-value org-stat-hw" :class="org.hardware">{{
              HARDWARE_LABELS[org.hardware] || org.hardware
            }}</span>
            <span class="org-stat-label">Hardware</span>
          </div>
          <div v-if="!org.is_openai_compat" class="org-stat">
            <span class="org-stat-value org-stat-flag warn">Non-standard API</span>
            <span class="org-stat-label">Compatibility</span>
          </div>
          <div v-if="org.supports_streaming !== null" class="org-stat">
            <span
              class="org-stat-value org-stat-flag"
              :class="org.supports_streaming ? 'ok' : 'warn'"
              >{{ org.supports_streaming ? 'Yes' : 'No' }}</span
            >
            <span class="org-stat-label">Streaming</span>
          </div>
          <div v-if="org.requires_account_id" class="org-stat">
            <span class="org-stat-value org-stat-flag warn">Account ID required</span>
            <span class="org-stat-label">Auth</span>
          </div>
        </div>

        <!-- Rate limits row -->
        <div v-if="rateLimitText" class="org-rate-limits">
          <span class="org-rate-label">Rate limits:</span>
          <span class="org-rate-value">{{ rateLimitText }}</span>
        </div>

        <!-- Model counts + health -->
        <div class="org-health-row">
          <div class="org-stat">
            <span class="org-stat-value">{{ org.working_count }} / {{ org.model_count }}</span>
            <span class="org-stat-label">Working / Total</span>
          </div>
          <div v-if="org.health_status" class="org-stat">
            <span class="org-stat-value org-health-badge" :class="org.health_status">{{
              org.health_status
            }}</span>
            <span class="org-stat-label">Health</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Sub-provider slugs (additional API endpoints) -->
    <template v-if="org.provider_slugs.length > 1">
      <div class="org-section">
        <h3 class="section-title">All Provider Endpoints</h3>
        <div class="org-slug-chips">
          <router-link
            v-for="slug in org.provider_slugs"
            :key="slug"
            :to="`/org/${slug}`"
            class="org-slug-chip"
            :class="{ current: slug === org.id }"
            >{{ slug }}</router-link
          >
        </div>
      </div>
    </template>

    <ModelDetailPanel
      v-if="detailModel && creatorForPanel"
      :open="!!detailModel"
      :model="detailModel"
      :creator="creatorForPanel"
      @close="detailModel = null"
      @navigate-to="detailModel = $event.model"
    />
  </div>
  <div v-else class="org-not-found">
    <p>Organization not found.</p>
    <router-link to="/organizations" class="back-link">← Back to organizations</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import SuperModelCard from '@/components/SuperModelCard.vue';
import ModelDetailPanel from '@/components/ModelDetailPanel.vue';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { useModelsStore } from '@/store/models';
import type { CreatorData, ModelData } from '@/types';

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;
function showCopied() {
  copied.value = true;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function copyAsJson(obj: any) {
  navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
  showCopied();
}

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  router: 'Router',
  inference: 'Inference',
  local: 'Local',
  discovery: 'Discovery',
};

const HARDWARE_LABELS: Record<string, string> = {
  gpu: 'GPU cluster',
  lpu: 'LPU (Groq)',
  wafer: 'Wafer-scale (Cerebras)',
  tpu: 'TPU (Google)',
  edge: 'Edge network',
  local: 'Local',
  unknown: 'Unknown',
};

const KIND_LABELS: Record<string, string> = {
  creator: 'Creator only',
  provider: 'Provider only',
  both: 'Creator + Provider',
};

const store = useModelsStore();
const route = useRoute();

const orgId = computed(() => route.params.id as string);
const org = computed(
  () => store.getOrgById(orgId.value) ?? store.getOrgByProviderSlug(orgId.value),
);

const kindLabel = computed(() => KIND_LABELS[org.value?.kind || ''] || '');
const detailModel = ref<ModelData | null>(null);

const creatorForPanel = computed((): CreatorData | null => {
  if (!org.value) return null;
  return {
    id: org.value.id,
    name: org.value.name,
    type: (org.value.creator_type as CreatorData['type']) || 'lab',
    role: (org.value.creator_role as CreatorData['role']) || 'Model creator',
    description: org.value.description,
    model_count: org.value.model_count,
    provider_count: org.value.provider_count,
    models: org.value.models,
  };
});

function openDetail(model: ModelData) {
  detailModel.value = model;
}

const familyList = computed(() => {
  const families = new Set<string>();
  for (const m of org.value?.models || []) {
    if (m.family) families.add(m.family);
  }
  return [...families].sort();
});

const rateLimitText = computed(() => {
  const o = org.value;
  if (!o) return '';
  const parts: string[] = [];
  if (o.max_rpm) parts.push(`${o.max_rpm} RPM`);
  if (o.max_tpm)
    parts.push(
      o.max_tpm >= 1000000
        ? `${(o.max_tpm / 1000000).toFixed(1)}M TPM`
        : `${o.max_tpm?.toLocaleString()} TPM`,
    );
  if (o.max_daily_requests) parts.push(`${o.max_daily_requests} req/day`);
  return parts.join(' / ');
});

function copyOrgAsMarkdown(o: NonNullable<typeof org.value>) {
  let md = `# ${o.name}\n\n`;
  md += `**Type:** ${KIND_LABELS[o.kind]}\n\n`;
  if (o.description) md += `${o.description}\n\n`;
  if (o.kind === 'creator' || o.kind === 'both') {
    md += `## Models (${o.model_count})\n\n`;
    for (const m of o.models) {
      md += `- **${m.name}** — ${m.best_context ? m.best_context.toLocaleString() + ' ctx' : 'unknown context'}\n`;
    }
    md += '\n';
  }
  if (o.kind === 'provider' || o.kind === 'both') {
    md += `## Provider\n\n`;
    if (o.base_url) md += `- Base URL: ${o.base_url}\n`;
    if (o.npm_package) md += `- npm: ${o.npm_package}\n`;
    if (o.provider_type)
      md += `- Type: ${PROVIDER_TYPE_LABELS[o.provider_type] || o.provider_type}\n`;
    if (o.hardware) md += `- Hardware: ${HARDWARE_LABELS[o.hardware] || o.hardware}\n`;
    md += `- Health: ${o.health_status || 'unknown'}\n`;
  }
  navigator.clipboard.writeText(md).then(() => {
    const el = document.querySelector('.org-copied-toast');
    if (el) {
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 2000);
    }
  });
}
</script>

<style scoped>
.org-detail-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}

.org-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.org-header-row h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.org-kind-badge {
  font-size: 14px;
  padding: 3px 10px;
  border-radius: 12px;
  font-weight: 600;
}
.org-kind-badge.both {
  background: #4caf50;
  color: #fff;
}
.org-kind-badge.creator {
  background: #2196f3;
  color: #fff;
}
.org-kind-badge.provider {
  background: #ff9800;
  color: #fff;
}

.org-description {
  margin-top: 12px;
  color: var(--color-text-secondary, #666);
  line-height: 1.6;
  font-size: 15px;
}

.org-meta-grid,
.org-provider-meta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 20px 0;
}

.org-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.org-stat-value {
  font-weight: 600;
  font-size: 16px;
}
.org-stat-label {
  font-size: 12px;
  color: var(--color-text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.org-stat-url {
  font-size: 13px;
  color: var(--color-link, #007acc);
  word-break: break-all;
}
.org-stat-pkg {
  font-size: 13px;
  font-family: monospace;
}

.org-section {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--color-border, #e0e0e0);
}

.org-section-sub {
  color: var(--color-text-secondary, #666);
  margin-bottom: 12px;
}

.org-provider-icons {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.org-families {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.org-families-label {
  font-size: 13px;
  color: var(--color-text-secondary, #888);
}
.org-family-tag {
  font-size: 13px;
  padding: 2px 10px;
  border-radius: 12px;
  background: var(--color-bg-secondary, #f0f0f0);
  color: var(--color-text, #333);
  text-decoration: none;
}
.org-family-tag:hover {
  background: var(--color-accent, #007acc);
  color: #fff;
}

.org-models {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.org-empty,
.org-not-found {
  padding: 40px;
  text-align: center;
  color: var(--color-text-secondary, #888);
}

.org-stat-type {
  text-transform: capitalize;
}
.org-stat-host.host {
  color: #4caf50;
}
.org-stat-host.firstparty {
  color: #2196f3;
}
.org-stat-hw {
  text-transform: uppercase;
}
.org-stat-flag.ok {
  color: #4caf50;
}
.org-stat-flag.warn {
  color: #e65100;
}

.org-rate-limits {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.org-rate-label {
  font-size: 13px;
  color: var(--color-text-secondary, #888);
}
.org-rate-value {
  font-size: 14px;
  font-weight: 500;
}

.org-health-row {
  display: flex;
  gap: 24px;
  margin-top: 16px;
}
.org-health-badge {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 13px;
}
.org-health-badge.healthy {
  background: #e8f5e9;
  color: #2e7d32;
}
.org-health-badge.degraded {
  background: #fff3e0;
  color: #e65100;
}
.org-health-badge.down {
  background: #fce4ec;
  color: #c62828;
}

.org-slug-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.org-slug-chip {
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 8px;
  background: var(--color-bg-secondary, #f0f0f0);
  color: var(--color-text, #333);
  text-decoration: none;
}
.org-slug-chip:hover {
  background: var(--color-accent, #007acc);
  color: #fff;
}
.org-slug-chip.current {
  background: var(--color-accent, #007acc);
  color: #fff;
  font-weight: 600;
}

.org-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.org-copy-btn {
  padding: 4px 12px;
  font-size: 13px;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 6px;
  background: var(--color-bg, #fff);
  cursor: pointer;
}
.org-copy-btn:hover {
  background: var(--color-bg-secondary, #f5f5f5);
}
.org-copied-toast {
  font-size: 12px;
  color: #4caf50;
  opacity: 0;
  transition: opacity 0.2s;
}
.org-copied-toast.show {
  opacity: 1;
}
</style>
