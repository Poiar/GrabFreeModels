<template>
  <div v-if="org" class="org-detail-page">
    <!-- ── Hero Header ── -->
    <div class="org-hero">
      <div class="org-hero-inner">
        <router-link to="/organizations" class="org-back-link">← Organizations</router-link>
        <div class="org-hero-row">
          <div class="org-hero-text">
            <h1 class="org-hero-name">
              <ProviderIcon :slug="org.id" :size="48" cls="org-hero-logo" />
              {{ org.name }}
              <span class="org-kind-badge" :class="org.kind">{{ kindLabel }}</span>
            </h1>
            <p v-if="org.description" class="org-hero-desc">{{ org.description }}</p>
            <div class="org-hero-links">
              <router-link
                v-if="org.kind === 'creator' || org.kind === 'both'"
                :to="`/creator/${org.id}`"
                class="org-hero-cta creator-cta"
              >
                View Creator Page →
              </router-link>
              <template v-if="org.kind === 'provider' || org.kind === 'both'">
                <router-link
                  v-for="slug in org.provider_slugs"
                  :key="slug"
                  :to="`/provider/${slug}`"
                  class="org-hero-cta provider-cta"
                >
                  View {{ slug }} Provider →
                </router-link>
              </template>
            </div>
          </div>
          <div class="org-hero-actions">
            <button class="org-copy-btn" @click="copyOrgAsMarkdown(org)" title="Copy as Markdown">
              ↓ MD
            </button>
            <button class="org-copy-btn" @click="copyAsJson(org)" title="Copy as JSON">
              ↓ JSON
            </button>
            <span v-if="copied" class="org-copied-toast">Copied!</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Stats Row ── -->
    <div class="org-stats-bar">
      <div class="org-stat-card">
        <div class="org-stat-icon">🏷️</div>
        <div class="org-stat-body">
          <span class="org-stat-value">{{ kindLabel }}</span>
          <span class="org-stat-label">Organization Type</span>
        </div>
      </div>
      <div v-if="org.creator_type" class="org-stat-card">
        <div class="org-stat-icon">🏗️</div>
        <div class="org-stat-body">
          <span class="org-stat-value">{{ org.creator_type }}</span>
          <span class="org-stat-label">Classification</span>
        </div>
      </div>
      <div v-if="org.creator_role" class="org-stat-card">
        <div class="org-stat-icon">🎯</div>
        <div class="org-stat-body">
          <span class="org-stat-value">{{ org.creator_role }}</span>
          <span class="org-stat-label">Role</span>
        </div>
      </div>
      <div v-if="org.model_count > 0" class="org-stat-card">
        <div class="org-stat-icon">🧠</div>
        <div class="org-stat-body">
          <span class="org-stat-value">{{ org.model_count }}</span>
          <span class="org-stat-label">Models</span>
        </div>
      </div>
      <div v-if="org.provider_slugs.length > 0" class="org-stat-card">
        <div class="org-stat-icon">🔌</div>
        <div class="org-stat-body">
          <span class="org-stat-value">{{ org.provider_slugs.length }}</span>
          <span class="org-stat-label">API Endpoints</span>
        </div>
      </div>
      <div v-if="org.health_status" class="org-stat-card">
        <div class="org-stat-icon">💚</div>
        <div class="org-stat-body">
          <div class="org-health-inline">
            <span class="org-health-badge" :class="org.health_status">{{ org.health_status }}</span>
            <span class="org-health-ratio"
              >{{ org.working_count }}/{{ modelCountForHealth }} working</span
            >
          </div>
          <span class="org-stat-label">Health</span>
        </div>
      </div>
    </div>

    <!-- ── Health Bar ── -->
    <div v-if="modelCountForHealth > 0" class="org-health-bar-wrap">
      <div class="org-health-bar">
        <div
          class="org-health-seg working"
          :style="{ width: workingPct + '%' }"
          :title="`${org.working_count} working`"
        ></div>
        <div
          class="org-health-seg broken"
          :style="{ width: brokenPct + '%' }"
          :title="`${brokenCount} broken`"
        ></div>
        <div
          class="org-health-seg untested"
          :style="{ width: untestedPct + '%' }"
          :title="`${untestedCount} untested`"
        ></div>
      </div>
      <div class="org-health-legend">
        <span class="legend-dot working"></span> {{ org.working_count }} working
        <span class="legend-dot broken"></span> {{ brokenCount }} broken
        <span class="legend-dot untested"></span> {{ untestedCount }} untested
      </div>
    </div>

    <!-- ── Provider Endpoints (quick nav chips) ── -->
    <div v-if="org.provider_slugs.length > 0" class="org-section org-endpoints-section">
      <h3 class="section-title">API Endpoints</h3>
      <div class="org-endpoint-chips">
        <router-link
          v-for="slug in org.provider_slugs"
          :key="slug"
          :to="`/provider/${slug}`"
          class="org-endpoint-chip"
        >
          <span class="endpoint-chip-icon">🔗</span>
          <span class="endpoint-chip-text">{{ slug }}</span>
          <span class="endpoint-chip-arrow">→</span>
        </router-link>
      </div>
    </div>

    <!-- ── Creator Section: Models ── -->
    <template v-if="org.kind === 'creator' || org.kind === 'both'">
      <div class="org-section org-creator-section">
        <div class="section-header-row">
          <h3 class="section-title">Models</h3>
          <router-link :to="`/creator/${org.id}`" class="section-cta">
            Full creator page →
          </router-link>
        </div>
        <p class="org-section-sub">
          {{ org.model_count }} model{{ org.model_count !== 1 ? 's' : '' }} across
          {{ org.provider_count }} provider{{ org.provider_count !== 1 ? 's' : '' }}
        </p>

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

        <!-- Model cards grid -->
        <div v-if="org.models.length > 0" class="org-models-grid">
          <SuperModelCard
            v-for="model in org.models"
            :key="model.slug"
            :model="model"
            :creator-slug="org.id"
            @click="openDetail(model)"
            @creator-click="() => {}"
          />
        </div>
        <div v-else class="org-empty">No models available.</div>
      </div>
    </template>

    <!-- ── Provider Section ── -->
    <template v-if="org.kind === 'provider' || org.kind === 'both'">
      <div class="org-section org-provider-section">
        <div class="section-header-row">
          <h3 class="section-title">Provider Details</h3>
          <router-link
            v-if="org.provider_slugs[0]"
            :to="`/provider/${org.provider_slugs[0]}`"
            class="section-cta"
          >
            Full provider page →
          </router-link>
        </div>

        <p v-if="org.provider_description" class="org-section-sub">
          {{ org.provider_description }}
        </p>

        <div class="org-provider-meta-grid">
          <div v-if="org.base_url" class="org-meta-item">
            <span class="org-meta-label">Base URL</span>
            <code class="org-meta-code">{{ org.base_url }}</code>
          </div>
          <div v-if="org.npm_package" class="org-meta-item">
            <span class="org-meta-label">npm Package</span>
            <code class="org-meta-code">{{ org.npm_package }}</code>
          </div>
          <div v-if="org.provider_type" class="org-meta-item">
            <span class="org-meta-label">Type</span>
            <span class="org-meta-value">
              <span class="org-type-badge" :class="org.provider_type">
                {{ PROVIDER_TYPE_LABELS[org.provider_type] || org.provider_type }}
              </span>
            </span>
          </div>
          <div
            v-if="org.provider_type === 'inference' && org.serves_third_party !== null"
            class="org-meta-item"
          >
            <span class="org-meta-label">Model Scope</span>
            <span class="org-meta-value">
              <span class="org-scope-badge" :class="org.serves_third_party ? 'host' : 'firstparty'">
                {{ org.serves_third_party ? 'Open-model host' : 'First-party only' }}
              </span>
            </span>
          </div>
          <div v-if="org.hardware && org.hardware !== 'unknown'" class="org-meta-item">
            <span class="org-meta-label">Hardware</span>
            <span class="org-meta-value">
              <span class="org-hw-badge">{{ HARDWARE_LABELS[org.hardware] || org.hardware }}</span>
            </span>
          </div>
          <div class="org-meta-item" v-if="org.is_openai_compat !== null">
            <span class="org-meta-label">API Compatibility</span>
            <span class="org-meta-value">
              <span class="org-flag-badge" :class="org.is_openai_compat ? 'ok' : 'warn'">
                {{ org.is_openai_compat ? 'OpenAI-compatible' : 'Non-standard API' }}
              </span>
            </span>
          </div>
          <div class="org-meta-item" v-if="org.supports_streaming !== null">
            <span class="org-meta-label">Streaming</span>
            <span class="org-meta-value">
              <span class="org-flag-badge" :class="org.supports_streaming ? 'ok' : 'warn'">
                {{ org.supports_streaming ? '✓ Supported' : '✗ Not supported' }}
              </span>
            </span>
          </div>
          <div class="org-meta-item" v-if="org.requires_account_id">
            <span class="org-meta-label">Authentication</span>
            <span class="org-meta-value">
              <span class="org-flag-badge warn">Account ID required</span>
            </span>
          </div>
          <div class="org-meta-item" v-if="org.requires_card !== null">
            <span class="org-meta-label">Payment Required</span>
            <span class="org-meta-value">
              <span class="org-flag-badge" :class="org.requires_card ? 'warn' : 'ok'">
                {{ org.requires_card ? '✓ Card required' : '✗ No card needed' }}
              </span>
            </span>
          </div>
        </div>

        <!-- Rate limits -->
        <div v-if="rateLimitText" class="org-rate-limits">
          <span class="org-rate-label">Rate Limits:</span>
          <span class="org-rate-value">{{ rateLimitText }}</span>
        </div>
      </div>
    </template>

    <!-- ── Model Detail Panel ── -->
    <ModelDetailPanel
      v-if="detailModel && creatorForPanel"
      :open="!!detailModel"
      :model="detailModel"
      :creator="creatorForPanel"
      @close="detailModel = null"
      @navigate-to="detailModel = $event.model"
    />
  </div>

  <!-- ── Not Found ── -->
  <div v-else class="org-not-found">
    <div class="org-not-found-card">
      <h2>Organization not found</h2>
      <p>The organization "{{ orgId }}" doesn't exist or hasn't been indexed yet.</p>
      <router-link to="/organizations" class="org-not-found-link"
        >← Browse all organizations</router-link
      >
    </div>
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
  creator: 'Creator',
  provider: 'Provider',
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

// ── Health breakdown ──
// Paid models are normalized to status.result='working' by builders/index.js
// (the single source of truth). No is_free guard needed here.
const modelCountForHealth = computed(() => {
  const o = org.value;
  if (!o) return 0;
  if (o.kind === 'provider') return o.working_count > 0 ? o.model_count : 0;
  let count = 0;
  for (const m of o.models || []) {
    count += m.providers.filter((dp) => !dp._removed).length;
  }
  return count;
});

const brokenCount = computed(() => {
  const o = org.value;
  if (!o) return 0;
  let count = 0;
  for (const m of o.models || []) {
    count += m.providers.filter(
      (dp) => !dp._removed && (dp.status.result === 'broken' || dp.status.result === 'not_found'),
    ).length;
  }
  return count;
});

const untestedCount = computed(() => {
  const o = org.value;
  if (!o) return 0;
  let count = 0;
  for (const m of o.models || []) {
    count += m.providers.filter((dp) => !dp._removed && dp.status.result === 'untested').length;
  }
  return count;
});

const workingPct = computed(() => {
  const total = modelCountForHealth.value;
  if (!total) return 0;
  return Math.round(((org.value?.working_count || 0) / total) * 100);
});

const brokenPct = computed(() => {
  const total = modelCountForHealth.value;
  if (!total) return 0;
  return Math.round((brokenCount.value / total) * 100);
});

const untestedPct = computed(() => {
  const total = modelCountForHealth.value;
  if (!total) return 0;
  return Math.round((untestedCount.value / total) * 100);
});

// ── Copy as Markdown ──
function copyOrgAsMarkdown(o: NonNullable<typeof org.value>) {
  let md = `# ${o.name}\n\n`;
  md += `**Type:** ${KIND_LABELS[o.kind]}\n\n`;
  if (o.description) md += `${o.description}\n\n`;

  if (o.kind === 'creator' || o.kind === 'both') {
    md += `## Models (${o.model_count})\n\n`;
    for (const m of o.models) {
      md += `- **${m.name}** — ${m.providers[0]?.context_length ? m.providers[0].context_length.toLocaleString() + ' ctx' : 'unknown context'}\n`;
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
    showCopied();
  });
}
</script>

<style scoped>
/* ── Page Layout ── */
.org-detail-page {
  max-width: 1024px;
  margin: 0 auto;
  padding: 0 24px 48px;
}

/* ── Hero Header ── */
.org-hero {
  background: linear-gradient(135deg, #131a2e 0%, #16203e 50%, #1a2a50 100%);
  border: 1px solid var(--border);
  border-radius: 16px;
  margin-top: 24px;
  overflow: hidden;
  color: var(--text);
  box-shadow: var(--shadow-lg);
}

.org-hero-inner {
  padding: 32px;
}

.org-back-link {
  display: inline-block;
  color: var(--text-dim);
  text-decoration: none;
  font-size: 14px;
  margin-bottom: 16px;
  transition: color 0.2s;
}
.org-back-link:hover {
  color: var(--text);
}

.org-hero-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}

.org-hero-text {
  flex: 1;
  min-width: 0;
}

.org-hero-name {
  margin: 0 0 12px 0;
  font-size: 32px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.org-hero-logo {
  border-radius: 8px;
  flex-shrink: 0;
}

.org-hero-desc {
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-dim);
  margin: 0 0 20px 0;
  max-width: 700px;
}

.org-hero-links {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.org-hero-cta {
  display: inline-flex;
  align-items: center;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}
.creator-cta {
  background: var(--accent-subtle);
  color: var(--blue);
  border: 1px solid rgba(96, 165, 250, 0.2);
}
.creator-cta:hover {
  background: rgba(96, 165, 250, 0.15);
  color: #93c5fd;
}
.provider-cta {
  background: var(--orange-subtle);
  color: var(--orange);
  border: 1px solid rgba(251, 191, 36, 0.2);
}
.provider-cta:hover {
  background: rgba(251, 191, 36, 0.15);
  color: #fcd34d;
}

.org-hero-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.org-copy-btn {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-dim);
  cursor: pointer;
  transition: all 0.2s;
}
.org-copy-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--border-focus);
}

.org-copied-toast {
  font-size: 12px;
  color: var(--green);
  font-weight: 600;
}

/* ── Kind Badge ── */
.org-kind-badge {
  font-size: 14px;
  padding: 4px 14px;
  border-radius: 20px;
  font-weight: 600;
  letter-spacing: 0.3px;
  white-space: nowrap;
}
.org-kind-badge.both {
  background: linear-gradient(135deg, var(--green-dim), var(--green));
  color: #fff;
  box-shadow: 0 2px 8px var(--green-glow);
}
.org-kind-badge.creator {
  background: linear-gradient(135deg, #3b82f6, var(--blue));
  color: #fff;
  box-shadow: 0 2px 8px var(--accent-glow);
}
.org-kind-badge.provider {
  background: linear-gradient(135deg, var(--orange-dim), var(--orange));
  color: #0b0e14;
  box-shadow: 0 2px 8px var(--orange-glow);
}

/* ── Stats Bar ── */
.org-stats-bar {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 24px;
}

.org-stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.org-stat-card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
}

.org-stat-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.org-stat-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.org-stat-value {
  font-weight: 700;
  font-size: 16px;
  color: var(--text);
}

.org-stat-label {
  font-size: 12px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

/* ── Health inline ── */
.org-health-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.org-health-ratio {
  font-size: 13px;
  color: var(--text-dim);
}

/* ── Health Bar ── */
.org-health-bar-wrap {
  margin-top: 16px;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.org-health-bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--bg-elevated);
}

.org-health-seg {
  transition: width 0.4s ease;
}
.org-health-seg.working {
  background: linear-gradient(90deg, var(--green-dim), var(--green));
}
.org-health-seg.broken {
  background: linear-gradient(90deg, var(--red-dim), var(--red));
}
.org-health-seg.untested {
  background: var(--border);
}

.org-health-legend {
  display: flex;
  align-items: center;
  gap: 6px 16px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 13px;
  color: var(--text-dim);
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.legend-dot.working {
  background: var(--green);
}
.legend-dot.broken {
  background: var(--red);
}
.legend-dot.untested {
  background: var(--text-muted);
}

/* ── Health Badge ── */
.org-health-badge {
  padding: 3px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
}
.org-health-badge.healthy {
  background: var(--green-subtle);
  color: var(--green);
}
.org-health-badge.degraded {
  background: var(--orange-subtle);
  color: var(--orange);
}
.org-health-badge.broken {
  background: var(--red-subtle);
  color: var(--red);
}

/* ── Sections ── */
.org-section {
  margin-top: 32px;
  padding: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.section-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}

.section-cta {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  transition: all 0.2s;
}
.section-cta:hover {
  background: var(--accent);
  color: #0b0e14;
  border-color: var(--accent);
}

.org-section-sub {
  color: var(--text-dim);
  margin: 0 0 16px 0;
  font-size: 14px;
}

/* ── Endpoint Chips ── */
.org-endpoints-section {
  background: linear-gradient(135deg, #111520, #161b26);
}

.org-endpoint-chips {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.org-endpoint-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}
.org-endpoint-chip:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.endpoint-chip-icon {
  font-size: 16px;
}
.endpoint-chip-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
}
.endpoint-chip-arrow {
  color: var(--text-dim);
  font-size: 13px;
}

/* ── Families ── */
.org-families {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.org-families-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
}
.org-family-tag {
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 16px;
  background: var(--bg-hover);
  color: var(--text-dim);
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
  border: 1px solid var(--border);
}
.org-family-tag:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

/* ── Models Grid ── */
.org-models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.org-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-dim);
  font-size: 14px;
}

/* ── Provider Meta Grid ── */
.org-provider-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.org-meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-radius: 8px;
  border: 1px solid var(--border-light);
}

.org-meta-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.org-meta-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.org-meta-code {
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent);
  word-break: break-all;
  background: transparent;
  padding: 0;
}

/* ── Badges ── */
.org-type-badge {
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
  background: var(--accent-subtle);
  color: var(--accent);
}
.org-type-badge.router {
  background: var(--green-subtle);
  color: var(--green);
}
.org-type-badge.inference {
  background: var(--accent-subtle);
  color: var(--accent);
}
.org-type-badge.local {
  background: var(--purple-subtle);
  color: var(--purple);
}

.org-scope-badge {
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}
.org-scope-badge.host {
  background: var(--green-subtle);
  color: var(--green);
}
.org-scope-badge.firstparty {
  background: var(--accent-subtle);
  color: var(--accent);
}

.org-hw-badge {
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  background: var(--orange-subtle);
  color: var(--orange);
}

.org-flag-badge {
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}
.org-flag-badge.ok {
  background: var(--green-subtle);
  color: var(--green);
}
.org-flag-badge.warn {
  background: var(--orange-subtle);
  color: var(--orange);
}

/* ── Rate Limits ── */
.org-rate-limits {
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-radius: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--border-light);
}
.org-rate-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
}
.org-rate-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

/* ── Not Found ── */
.org-not-found {
  display: flex;
  justify-content: center;
  padding: 80px 24px;
}

.org-not-found-card {
  text-align: center;
  max-width: 480px;
}

.org-not-found-card h2 {
  font-size: 24px;
  margin: 0 0 12px 0;
  color: var(--text);
}

.org-not-found-card p {
  color: var(--text-dim);
  margin: 0 0 24px 0;
  line-height: 1.6;
}

.org-not-found-link {
  display: inline-block;
  padding: 10px 20px;
  background: var(--accent);
  color: #0b0e14;
  text-decoration: none;
  border-radius: 8px;
  font-weight: 600;
  transition: background 0.2s;
}
.org-not-found-link:hover {
  background: var(--accent-hover);
}
</style>
