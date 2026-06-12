<template>
  <div class="ad-page">
    <div class="page-header">
      <h2>Admin Panel</h2>
      <p>Trigger nightly pipeline tasks from the browser</p>
    </div>
    <div v-if="!authenticated" class="ad-auth">
      <input
        v-model="token"
        type="password"
        class="ad-token-input"
        placeholder="Enter admin token"
        @keydown.enter="authenticate"
      />
      <button class="ad-auth-btn" @click="authenticate">Unlock</button>
      <p v-if="authError" class="ad-auth-error">{{ authError }}</p>
    </div>
    <div v-else class="ad-actions">
      <div v-for="action in actions" :key="action.key" class="ad-action-card">
        <div class="ad-action-info">
          <h3>{{ action.label }}</h3>
          <p>{{ action.desc }}</p>
        </div>
        <button
          class="ad-run-btn"
          :disabled="running === action.key"
          @click="runAction(action.key)"
        >
          {{ running === action.key ? 'Running…' : 'Run' }}
        </button>
        <div
          v-if="results[action.key]"
          class="ad-result"
          :class="results[action.key].ok ? 'ad-ok' : 'ad-err'"
        >
          {{ results[action.key].text }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const ADMIN_TOKEN = 'gfm-admin-2026';
const authenticated = ref(false);
const token = ref('');
const authError = ref('');
const running = ref<string | null>(null);
const results = ref<Record<string, { ok: boolean; text: string }>>({});

const actions = [
  {
    key: 'sync',
    label: 'Sync Models',
    desc: 'Fetch free models from all providers, diff against DB',
  },
  {
    key: 'validate',
    label: 'Validate Models',
    desc: 'Test all free models against live API endpoints',
  },
  { key: 'rank', label: 'Rank Free Models', desc: 'Rebuild free role rankings from current data' },
  {
    key: 'rankPaid',
    label: 'Rank Paid Models',
    desc: 'Rebuild paid role rankings from current data',
  },
  {
    key: 'financials',
    label: 'Import Financials',
    desc: 'Scrape AI company financials from isaiprofitable.com',
  },
  { key: 'nightly', label: 'Full Nightly', desc: 'Validate → re-rank → check → export → commit' },
  {
    key: 'export',
    label: 'Export JSON',
    desc: 'Export current DB snapshot to available-models.json',
  },
];

function authenticate() {
  if (token.value === ADMIN_TOKEN) {
    authenticated.value = true;
    authError.value = '';
  } else {
    authError.value = 'Invalid token';
  }
}

async function runAction(key: string) {
  running.value = key;
  results.value[key] = { ok: false, text: 'Sending…' };
  try {
    const resp = await fetch('/api/admin/' + key, {
      method: 'POST',
      headers: { 'x-admin-token': token.value },
    });
    const data = await resp.json();
    results.value[key] = {
      ok: resp.ok,
      text: data.message || data.error || (resp.ok ? 'Done' : 'Failed'),
    };
  } catch (e: unknown) {
    results.value[key] = { ok: false, text: String(e) };
  }
  running.value = null;
}
</script>

<style scoped>
.ad-page {
  max-width: 700px;
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
  margin: 0 0 20px;
}
.ad-auth {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 300px;
}
.ad-token-input {
  font-size: 0.8rem;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  font-family: monospace;
}
.ad-token-input:focus {
  outline: none;
  border-color: var(--accent);
}
.ad-auth-btn {
  padding: 8px 16px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--accent-subtle);
  color: var(--accent);
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
}
.ad-auth-error {
  font-size: 0.72rem;
  color: var(--red);
}
.ad-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ad-action-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  flex-wrap: wrap;
}
.ad-action-info {
  flex: 1;
  min-width: 200px;
}
.ad-action-info h3 {
  font-size: 0.85rem;
  font-weight: 700;
  margin: 0 0 2px;
}
.ad-action-info p {
  font-size: 0.68rem;
  color: var(--text-muted);
  margin: 0;
}
.ad-run-btn {
  padding: 6px 16px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  font-size: 0.72rem;
}
.ad-run-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.ad-result {
  width: 100%;
  font-size: 0.7rem;
  padding: 6px 10px;
  border-radius: 4px;
}
.ad-result.ad-ok {
  background: rgba(52, 211, 153, 0.08);
  color: var(--green);
}
.ad-result.ad-err {
  background: rgba(239, 68, 68, 0.08);
  color: var(--red);
}
@media (max-width: 768px) {
  .ad-page {
    padding: 12px;
  }
}
</style>
