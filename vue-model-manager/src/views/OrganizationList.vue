<template>
  <div class="org-list-page">
    <div class="page-header">
      <h1>Organizations</h1>
      <p class="page-subtitle">
        Unified view of model creators and API providers — {{ filteredOrgs.length }} organizations
      </p>
    </div>

    <!-- ── Controls ── -->
    <div class="org-controls">
      <input v-model="search" type="text" class="org-search" placeholder="Search organizations…" />
      <div class="org-kind-filters">
        <button
          v-for="k in kindFilters"
          :key="k.value"
          class="org-kind-btn"
          :class="{ active: kindFilter === k.value }"
          @click="kindFilter = k.value"
        >
          {{ k.label }}
          <span class="kind-count">{{ kindCounts[k.value] ?? 0 }}</span>
        </button>
      </div>
    </div>

    <!-- ── Grid ── -->
    <div v-if="filteredOrgs.length > 0" class="org-grid">
      <router-link
        v-for="org in filteredOrgs"
        :key="org.id"
        :to="`/org/${org.id}`"
        class="org-card"
      >
        <div class="org-card-top">
          <ProviderIcon :slug="org.id" :size="36" cls="org-card-logo" />
          <div class="org-card-header">
            <h3 class="org-card-name">{{ org.name }}</h3>
            <span class="org-card-kind" :class="org.kind">{{ kindLabels[org.kind] }}</span>
          </div>
        </div>

        <p v-if="org.description" class="org-card-desc">{{ org.description }}</p>

        <div class="org-card-stats">
          <div v-if="org.model_count > 0" class="org-card-stat">
            <span class="ocs-value">{{ org.model_count }}</span>
            <span class="ocs-label">models</span>
          </div>
          <div v-if="org.provider_slugs.length > 0" class="org-card-stat">
            <span class="ocs-value">{{ org.provider_slugs.length }}</span>
            <span class="ocs-label">endpoints</span>
          </div>
          <div v-if="org.creator_type" class="org-card-stat">
            <span class="ocs-value">{{ org.creator_type }}</span>
            <span class="ocs-label">type</span>
          </div>
          <div v-if="org.provider_type" class="org-card-stat">
            <span class="ocs-value">{{
              providerTypeLabels[org.provider_type] || org.provider_type
            }}</span>
            <span class="ocs-label">provider type</span>
          </div>
        </div>

        <!-- Provider slugs -->
        <div v-if="org.provider_slugs.length > 0" class="org-card-slugs">
          <span v-for="slug in org.provider_slugs.slice(0, 5)" :key="slug" class="org-card-slug">{{
            slug
          }}</span>
          <span v-if="org.provider_slugs.length > 5" class="org-card-slug-more"
            >+{{ org.provider_slugs.length - 5 }}</span
          >
        </div>

        <!-- Health -->
        <div v-if="org.health_status" class="org-card-health">
          <span class="och-badge" :class="org.health_status">{{ org.health_status }}</span>
          <span class="och-count">{{ org.working_count }} working</span>
        </div>
      </router-link>
    </div>

    <div v-else class="org-empty">
      <p v-if="organizations.length === 0">No organizations loaded yet.</p>
      <p v-else>No organizations matching your search.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ProviderIcon from '@/components/ProviderIcon.vue';
import { useModelsStore } from '@/store/models';

const store = useModelsStore();

const search = ref('');
const kindFilter = ref<string>('all');

const kindLabels: Record<string, string> = {
  creator: 'Creator',
  provider: 'Provider',
  both: 'Creator + Provider',
};

const providerTypeLabels: Record<string, string> = {
  router: 'Router',
  inference: 'Inference',
  local: 'Local',
  discovery: 'Discovery',
};

const kindFilters = [
  { value: 'all', label: 'All' },
  { value: 'both', label: 'Creator + Provider' },
  { value: 'creator', label: 'Creator' },
  { value: 'provider', label: 'Provider' },
];

const organizations = computed(() => store.organizations);

const kindCounts = computed(() => {
  const counts: Record<string, number> = { all: organizations.value.length };
  for (const o of organizations.value) {
    counts[o.kind] = (counts[o.kind] || 0) + 1;
  }
  return counts;
});

const filteredOrgs = computed(() => {
  let list = organizations.value;

  if (kindFilter.value !== 'all') {
    list = list.filter((o) => o.kind === kindFilter.value);
  }

  const q = search.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.provider_slugs.some((s) => s.toLowerCase().includes(q)),
    );
  }

  return list;
});
</script>

<style scoped>
.org-list-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: var(--text);
}

.page-subtitle {
  color: var(--text-dim);
  font-size: 15px;
  margin: 0;
}

/* ── Controls ── */
.org-controls {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.org-search {
  flex: 1;
  min-width: 200px;
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  background: var(--bg-input);
  color: var(--text);
  outline: none;
  transition: border-color 0.2s;
}
.org-search:focus {
  border-color: var(--accent);
}

.org-kind-filters {
  display: flex;
  gap: 6px;
}

.org-kind-btn {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-dim);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}
.org-kind-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.org-kind-btn.active {
  background: var(--accent);
  color: #0b0e14;
  border-color: var(--accent);
}

.kind-count {
  font-size: 11px;
  opacity: 0.75;
}

/* ── Grid ── */
.org-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

/* ── Card ── */
.org-card {
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s;
  gap: 12px;
}
.org-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}

.org-card-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.org-card-logo {
  flex-shrink: 0;
}

.org-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.org-card-name {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
}

.org-card-kind {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  letter-spacing: 0.3px;
}
.org-card-kind.both {
  background: var(--green-subtle);
  color: var(--green);
}
.org-card-kind.creator {
  background: var(--accent-subtle);
  color: var(--accent);
}
.org-card-kind.provider {
  background: var(--orange-subtle);
  color: var(--orange);
}

.org-card-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-dim);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Card stats ── */
.org-card-stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.org-card-stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ocs-value {
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
}

.ocs-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

/* ── Provider slug chips ── */
.org-card-slugs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.org-card-slug {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-hover);
  color: var(--text-dim);
}

.org-card-slug-more {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 4px;
}

/* ── Health ── */
.org-card-health {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.och-badge {
  padding: 2px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}
.och-badge.healthy {
  background: var(--green-subtle);
  color: var(--green);
}
.och-badge.degraded {
  background: var(--orange-subtle);
  color: var(--orange);
}
.och-badge.down {
  background: var(--red-subtle);
  color: var(--red);
}

.och-count {
  font-size: 12px;
  color: var(--text-dim);
}

/* ── Empty ── */
.org-empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-dim);
}
</style>
