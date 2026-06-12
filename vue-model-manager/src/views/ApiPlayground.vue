<template>
  <div class="ap-page">
    <div class="page-header">
      <h2>API Playground</h2>
      <p>Ready-to-use code snippets for every model × provider combination — copy, paste, run</p>
    </div>

    <!-- Search + filters -->
    <div class="ap-controls">
      <input v-model="search" type="text" class="ap-search" placeholder="Search models…" />
      <select v-model="providerFilter" class="ap-select">
        <option value="">All providers</option>
        <option v-for="p in providerOptions" :key="p.slug" :value="p.slug">
          {{ p.name }} ({{ p.count }})
        </option>
      </select>
      <select v-model="langFilter" class="ap-select">
        <option value="python">Python (OpenAI SDK)</option>
        <option value="curl">cURL</option>
        <option value="js">JavaScript (OpenAI SDK)</option>
      </select>
    </div>

    <!-- Count -->
    <div class="ap-count">
      {{ filteredSnippets.length }} snippet{{ filteredSnippets.length !== 1 ? 's' : '' }}
    </div>

    <!-- Snippets grouped by provider -->
    <div v-for="group in groupedSnippets" :key="group.providerSlug" class="ap-provider-group">
      <div class="ap-provider-header">
        <ProviderIcon
          :slug="group.providerSlug"
          :size="20"
          :alt="group.providerName"
          cls="ap-prov-icon"
        />
        <h3>{{ group.providerName }}</h3>
        <span class="ap-prov-meta">
          {{ group.isOpenAICompat ? 'OpenAI-compatible' : 'Custom API' }}
          · {{ group.authLabel }}
        </span>
      </div>

      <div
        v-for="snippet in group.snippets"
        :key="snippet.modelSlug + '|' + snippet.providerSlug"
        class="ap-snippet-card"
      >
        <div class="ap-snippet-header">
          <router-link :to="`/model/${snippet.modelSlug}`" class="ap-model-link">{{
            snippet.modelName
          }}</router-link>
          <span class="ap-snippet-status" :class="snippet.status">{{ snippet.status }}</span>
          <button class="ap-copy-btn" @click="copySnippet(snippet)" title="Copy snippet">
            📋 Copy
          </button>
          <span v-if="copiedId === snippet.modelSlug + snippet.providerSlug" class="ap-copied"
            >Copied!</span
          >
        </div>
        <pre class="ap-code"><code>{{ generateSnippet(snippet) }}</code></pre>
        <div class="ap-snippet-meta">
          <span v-if="snippet.contextLength">Context: {{ formatCtx(snippet.contextLength) }}</span>
          <span v-if="snippet.maxRpm">Rate: {{ snippet.maxRpm }} RPM</span>
          <span v-if="snippet.maxTpm">· {{ formatTpm(snippet.maxTpm) }} TPM</span>
        </div>
      </div>
    </div>

    <div v-if="filteredSnippets.length === 0" class="ap-empty">
      No snippets match the current filters.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '@/store/models';
import ProviderIcon from '@/components/ProviderIcon.vue';

const store = useModelsStore();
const search = ref('');
const providerFilter = ref('');
const langFilter = ref('python');
const copiedId = ref('');

interface Snippet {
  modelSlug: string;
  modelName: string;
  providerSlug: string;
  providerName: string;
  modelId: string;
  baseUrl: string;
  isOpenAICompat: boolean;
  requiresAccount: boolean;
  requiresCard: boolean;
  status: string;
  contextLength: number | null;
  maxRpm: number | null;
  maxTpm: number | null;
}

// ── Build all snippets ──
const allSnippets = computed(() => {
  const snippets: Snippet[] = [];
  for (const m of store.allModels) {
    for (const dp of m.providers) {
      if (dp._removed) continue;
      const prov = store.providerRefs.find((p) => p.slug === dp.provider_slug);
      if (!prov?.base_url) continue;
      snippets.push({
        modelSlug: m.slug,
        modelName: m.name,
        providerSlug: dp.provider_slug,
        providerName: dp.provider,
        modelId: dp.full_id.split('/').slice(1).join('/'),
        baseUrl: prov.base_url,
        isOpenAICompat: prov.is_openai_compat === true,
        requiresAccount: prov.requires_account_id === true,
        requiresCard: prov.requires_card === true,
        status: dp.status.result,
        contextLength: dp.context_length,
        maxRpm: prov.max_rpm,
        maxTpm: prov.max_tpm,
      });
    }
  }
  return snippets;
});

const providerOptions = computed(() => {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const s of allSnippets.value) {
    counts.set(s.providerSlug, (counts.get(s.providerSlug) || 0) + 1);
    names.set(s.providerSlug, s.providerName);
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, name: names.get(slug)!, count }))
    .sort((a, b) => b.count - a.count);
});

const filteredSnippets = computed(() => {
  let list = allSnippets.value;
  if (search.value) {
    const q = search.value.toLowerCase();
    list = list.filter(
      (s) => s.modelName.toLowerCase().includes(q) || s.providerName.toLowerCase().includes(q),
    );
  }
  if (providerFilter.value) list = list.filter((s) => s.providerSlug === providerFilter.value);
  return list;
});

const groupedSnippets = computed(() => {
  const groups: {
    providerSlug: string;
    providerName: string;
    isOpenAICompat: boolean;
    authLabel: string;
    snippets: Snippet[];
  }[] = [];
  const map = new Map<string, Snippet[]>();
  for (const s of filteredSnippets.value) {
    if (!map.has(s.providerSlug)) map.set(s.providerSlug, []);
    map.get(s.providerSlug)!.push(s);
  }
  for (const [slug, snippets] of map) {
    const first = snippets[0];
    let authLabel = 'No auth';
    if (first.requiresCard) authLabel = 'Card required';
    else if (first.requiresAccount) authLabel = 'API key required';
    groups.push({
      providerSlug: slug,
      providerName: first.providerName,
      isOpenAICompat: first.isOpenAICompat,
      authLabel,
      snippets,
    });
  }
  return groups.sort((a, b) => a.providerName.localeCompare(b.providerName));
});

// ── Generate snippets ──
function generateSnippet(s: Snippet): string {
  if (langFilter.value === 'curl') return generateCurl(s);
  if (langFilter.value === 'js') return generateJS(s);
  return generatePython(s);
}

function generatePython(s: Snippet): string {
  const baseUrl = s.baseUrl.replace(/\/+$/, '');
  const apiBase = s.isOpenAICompat ? `${baseUrl}/v1` : baseUrl;
  const authLine = s.requiresAccount
    ? `    api_key="your-${s.providerSlug}-api-key",`
    : '    api_key="not-needed",';
  return `from openai import OpenAI

client = OpenAI(
    base_url="${apiBase}",
${authLine}
)

response = client.chat.completions.create(
    model="${s.modelId}",
    messages=[{"role": "user", "content": "Hello!"}],
    max_tokens=1024${s.isOpenAICompat ? '' : ',\n    extra_body={}'}
)

print(response.choices[0].message.content)`;
}

function generateCurl(s: Snippet): string {
  const baseUrl = s.baseUrl.replace(/\/+$/, '');
  const apiBase = s.isOpenAICompat ? `${baseUrl}/v1` : baseUrl;
  const authHeader = s.requiresAccount
    ? `-H "Authorization: Bearer YOUR_${s.providerSlug.toUpperCase().replace(/-/g, '_')}_KEY" `
    : '';
  return `curl ${apiBase}/chat/completions \\
  ${authHeader}-H "Content-Type: application/json" \\
  -d '{
    "model": "${s.modelId}",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 1024
  }'`;
}

function generateJS(s: Snippet): string {
  const baseUrl = s.baseUrl.replace(/\/+$/, '');
  const apiBase = s.isOpenAICompat ? `${baseUrl}/v1` : baseUrl;
  const authLine = s.requiresAccount
    ? `  apiKey: process.env.${s.providerSlug.toUpperCase().replace(/-/g, '_')}_API_KEY,`
    : '  apiKey: "not-needed",';
  return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiBase}",
${authLine}
});

const response = await client.chat.completions.create({
  model: "${s.modelId}",
  messages: [{ role: "user", content: "Hello!" }],
  max_tokens: 1024,
});

console.log(response.choices[0].message.content);`;
}

function copySnippet(s: Snippet) {
  navigator.clipboard.writeText(generateSnippet(s));
  copiedId.value = s.modelSlug + s.providerSlug;
  setTimeout(() => (copiedId.value = ''), 1500);
}

function formatCtx(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`;
  return `${Math.round(ctx / 1000)}K`;
}
function formatTpm(tpm: number | null): string {
  if (!tpm) return '—';
  return tpm >= 1000000 ? `${(tpm / 1000000).toFixed(1)}M` : String(tpm);
}
</script>

<style scoped>
.ap-page {
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

.ap-controls {
  display: flex;
  gap: 8px;
  margin: 16px 0;
  flex-wrap: wrap;
}
.ap-search {
  flex: 1;
  min-width: 180px;
  padding: 6px 10px;
  font-size: 0.8rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  font-family: inherit;
}
.ap-select {
  padding: 6px 10px;
  font-size: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  font-family: inherit;
}
.ap-count {
  font-size: 0.72rem;
  color: var(--text-dim);
  margin-bottom: 12px;
}

.ap-provider-group {
  margin-bottom: 20px;
}
.ap-provider-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.ap-provider-header h3 {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
}
.ap-prov-icon {
  border-radius: 4px;
  flex-shrink: 0;
}
.ap-prov-meta {
  font-size: 0.62rem;
  color: var(--text-dim);
}

.ap-snippet-card {
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-card);
}
.ap-snippet-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
}
.ap-model-link {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}
.ap-model-link:hover {
  text-decoration: underline;
}
.ap-snippet-status {
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 3px;
}
.ap-snippet-status.working {
  color: var(--green);
  background: rgba(52, 211, 153, 0.1);
}
.ap-snippet-status.rate_limited {
  color: var(--orange);
  background: rgba(251, 146, 60, 0.1);
}
.ap-snippet-status.broken {
  color: var(--red);
  background: rgba(239, 68, 68, 0.1);
}
.ap-snippet-status.untested {
  color: var(--accent);
  background: var(--accent-subtle);
}
.ap-snippet-status.not_found {
  color: var(--text-dim);
  background: var(--bg-elevated);
}
.ap-copy-btn {
  font-size: 0.6rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-family: inherit;
  margin-left: auto;
  transition: all 0.12s;
}
.ap-copy-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.ap-copied {
  font-size: 0.6rem;
  font-weight: 600;
  color: var(--green);
}
.ap-code {
  margin: 0;
  padding: 10px 14px;
  background: #0d1117;
  overflow-x: auto;
}
.ap-code code {
  font-size: 0.68rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #e6edf3;
  line-height: 1.6;
  white-space: pre;
}
.ap-snippet-meta {
  display: flex;
  gap: 8px;
  padding: 5px 12px;
  font-size: 0.6rem;
  color: var(--text-dim);
}
.ap-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .ap-page {
    padding: 12px;
  }
}
</style>
