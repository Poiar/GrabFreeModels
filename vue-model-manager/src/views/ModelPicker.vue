<template>
  <div class="mp-page">
    <div class="page-header">
      <h2>Model Picker</h2>
      <p>Find the best free model for your task</p>
    </div>

    <!-- Progress indicator -->
    <div class="mp-progress">
      <div
        v-for="s in steps"
        :key="s.step"
        class="mp-progress-step"
        :class="{ active: step === s.step, done: step > s.step }"
        @click="goToStep(s.step)"
      >
        <span class="mp-progress-circle">{{ step > s.step ? '✓' : s.step }}</span>
        <span class="mp-progress-label">{{ s.label }}</span>
      </div>
    </div>

    <!-- Step content -->
    <div class="mp-step-content">
      <!-- Step 1: Task -->
      <div v-if="step === 1" class="mp-step">
        <h3 class="mp-step-title">What are you building?</h3>
        <p class="mp-step-subtitle">Pick the task that best matches your project</p>
        <div class="mp-task-grid">
          <button
            v-for="t in taskOptions"
            :key="t.id"
            class="mp-task-card"
            :class="{ selected: selections.task === t.id }"
            @click="
              selections.task = t.id;
              nextStep();
            "
          >
            <span class="mp-task-icon" v-html="t.icon"></span>
            <span class="mp-task-label">{{ t.label }}</span>
            <span class="mp-task-desc">{{ t.desc }}</span>
          </button>
        </div>
      </div>

      <!-- Step 2: Capabilities -->
      <div v-if="step === 2" class="mp-step">
        <h3 class="mp-step-title">Required capabilities</h3>
        <p class="mp-step-subtitle">Which features does your use case need?</p>
        <div class="mp-cap-grid">
          <label
            v-for="c in capabilityOptions"
            :key="c.id"
            class="mp-cap-item"
            :class="{ selected: selections.capabilities.has(c.id) }"
          >
            <input
              type="checkbox"
              :checked="selections.capabilities.has(c.id)"
              @change="toggleCapability(c.id)"
            />
            <span class="mp-cap-name">{{ c.label }}</span>
            <span class="mp-cap-desc">{{ c.desc }}</span>
          </label>
        </div>
        <div class="mp-nav">
          <button class="mp-btn mp-btn-secondary" @click="prevStep">Back</button>
          <button class="mp-btn mp-btn-primary" @click="nextStep">Next</button>
        </div>
      </div>

      <!-- Step 3: Context size -->
      <div v-if="step === 3" class="mp-step">
        <h3 class="mp-step-title">Context window size</h3>
        <p class="mp-step-subtitle">How much context do you need per request?</p>
        <div class="mp-ctx-buttons">
          <button
            v-for="c in contextOptions"
            :key="c.value"
            class="mp-ctx-btn"
            :class="{ selected: selections.minContext === c.value }"
            @click="selections.minContext = c.value"
          >
            <span class="mp-ctx-val">{{ c.label }}</span>
            <span class="mp-ctx-desc">{{ c.desc }}</span>
          </button>
        </div>
        <div class="mp-nav">
          <button class="mp-btn mp-btn-secondary" @click="prevStep">Back</button>
          <button class="mp-btn mp-btn-primary" @click="nextStep">Next</button>
        </div>
      </div>

      <!-- Step 4: Preferences -->
      <div v-if="step === 4" class="mp-step">
        <h3 class="mp-step-title">Preferences</h3>
        <p class="mp-step-subtitle">Fine-tune your search criteria</p>
        <div class="mp-prefs">
          <label class="mp-pref-item">
            <input type="checkbox" v-model="selections.openWeightsOnly" />
            <div>
              <span class="mp-pref-name">Open weights only</span>
              <span class="mp-pref-desc">Only show models with open-weight providers</span>
            </div>
          </label>
          <label class="mp-pref-item">
            <input type="checkbox" v-model="selections.freeOnly" />
            <div>
              <span class="mp-pref-name">Free only</span>
              <span class="mp-pref-desc">Only show models available at no cost</span>
            </div>
          </label>
          <div class="mp-pref-item mp-pref-slider">
            <div class="mp-pref-slider-header">
              <span class="mp-pref-name">Minimum working providers</span>
              <span class="mp-pref-value">{{ selections.minWorkingProviders }}</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              v-model.number="selections.minWorkingProviders"
              class="mp-range"
            />
            <div class="mp-range-labels">
              <span>Any</span>
              <span>5+</span>
            </div>
          </div>
        </div>
        <div class="mp-nav">
          <button class="mp-btn mp-btn-secondary" @click="prevStep">Back</button>
          <button class="mp-btn mp-btn-accent" @click="runPicker">Find models</button>
        </div>
      </div>
    </div>

    <!-- Results -->
    <div v-if="results.length > 0" class="mp-results">
      <div class="mp-results-header">
        <h3>{{ results.length }} recommendation{{ results.length !== 1 ? 's' : '' }}</h3>
        <div class="mp-results-actions">
          <button v-if="results.length >= 2" class="mp-btn mp-btn-accent" @click="compareTopTwo">
            Compare top 2
          </button>
          <button class="mp-btn mp-btn-outline" @click="copyAsMarkdown" :title="copyTooltip">
            Copy as Markdown
          </button>
        </div>
      </div>
      <div class="mp-result-list">
        <div v-for="r in results" :key="r.model.super_id" class="mp-result-card">
          <div class="mp-result-top">
            <div class="mp-result-info">
              <router-link :to="`/supermodel/${r.model.slug}`" class="mp-result-name">{{
                r.model.name
              }}</router-link>
              <span class="mp-result-creator">{{ r.model.creator }}</span>
              <span v-if="r.model.best_context" class="mp-result-ctx">{{
                formatContext(r.model.best_context)
              }}</span>
              <span v-if="paramSize(r.model)" class="mp-result-params">{{
                paramSize(r.model)
              }}</span>
            </div>
            <div class="mp-result-score" :title="'Relevance score: ' + r.score.toFixed(1)">
              <span class="mp-score-value">{{ r.score.toFixed(1) }}</span>
              <span class="mp-score-label">score</span>
            </div>
          </div>

          <div class="mp-result-providers" v-if="r.topProviders.length">
            <span
              v-for="p in r.topProviders"
              :key="p.full_id"
              class="mp-provider-chip"
              :class="statusClass(p.status.result)"
            >
              {{ p.provider }}
              <span class="mp-provider-status">{{ p.status.result }}</span>
            </span>
          </div>

          <div class="mp-result-tags" v-if="r.model.best_for?.length">
            <span v-for="tag in r.model.best_for.slice(0, 5)" :key="tag" class="mp-tag">{{
              tag
            }}</span>
          </div>

          <router-link :to="`/supermodel/${r.model.slug}`" class="mp-result-detail-link"
            >View details &rarr;</router-link
          >
        </div>
      </div>
    </div>

    <!-- No results -->
    <div v-if="ran && results.length === 0" class="mp-empty">
      <h3>No models match your criteria</h3>
      <p>Try broadening your preferences or removing some capability requirements.</p>
      <button class="mp-btn mp-btn-secondary" @click="resetAll">Start over</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useModelsStore } from '@/store/models';
import type { ModelData, ProviderDatapoint } from '@/types';

const store = useModelsStore();
const router = useRouter();

// ── Step definitions ──
const steps = [
  { step: 1, label: 'Task' },
  { step: 2, label: 'Capabilities' },
  { step: 3, label: 'Context' },
  { step: 4, label: 'Preferences' },
];

const step = ref(1);
const ran = ref(false);
const copyTooltip = ref('Copy recommended list as Markdown');

// ── Task options ──
const taskOptions = [
  {
    id: 'model',
    label: 'Coding / Code Generation',
    desc: 'Write, explain, debug, or refactor code',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>',
  },
  {
    id: 'general',
    label: 'General Chat / Assistant',
    desc: 'Conversational agent, Q&A, content writing',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>',
  },
  {
    id: 'explore',
    label: 'Exploration / Research',
    desc: 'Deep analysis, summarization, fact-checking',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>',
  },
  {
    id: 'small_model',
    label: 'Small / Edge Deployment',
    desc: 'Low-latency, resource-constrained environments',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" /></svg>',
  },
  {
    id: 'build',
    label: 'Build / Automation',
    desc: 'Agent workflows, multi-step tasks, tool calling',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>',
  },
];

// ── Capability options ──
const capabilityOptions = [
  { id: 'tools', label: 'Tool use', desc: 'Function calling and external tool integration' },
  { id: 'reasoning', label: 'Reasoning / Thinking', desc: 'Chain-of-thought and deep reasoning' },
  { id: 'vision', label: 'Vision / Image input', desc: 'Process images and visual content' },
  {
    id: 'structured_output',
    label: 'Structured JSON output',
    desc: 'Reliable JSON mode / structured generation',
  },
  { id: 'streaming', label: 'Streaming required', desc: 'Real-time token-by-token output' },
];

// ── Context options ──
const contextOptions = [
  { value: 4096, label: '4K', desc: 'Short prompts, simple tasks' },
  { value: 8192, label: '8K', desc: 'Standard conversations' },
  { value: 32768, label: '32K', desc: 'Long documents, codebases' },
  { value: 131072, label: '128K', desc: 'Large codebases, research papers' },
  { value: 1048576, label: '1M+', desc: 'Massive context workloads' },
];

// ── Role to best_for mapping ──
const roleBestForMap: Record<string, string[]> = {
  model: ['code', 'coding', 'programming', 'developer'],
  general: ['general', 'chat', 'assistant', 'conversation'],
  explore: ['research', 'analysis', 'reasoning', 'deep-think'],
  small_model: ['edge', 'lightweight', 'fast', 'mobile', 'low-latency'],
  build: ['agent', 'automation', 'tool-use', 'multi-step', 'function-calling'],
};

// ── User selections ──
const selections = reactive({
  task: '',
  capabilities: new Set<string>(),
  minContext: 8192,
  openWeightsOnly: false,
  freeOnly: true,
  minWorkingProviders: 1,
});

// ── Results ──
interface PickerResult {
  model: ModelData;
  score: number;
  breakdown: {
    rankScore: number;
    bestForScore: number;
    capScore: number;
    ctxScore: number;
    providerScore: number;
  };
  topProviders: ProviderDatapoint[];
  workingProviderCount: number;
}

const results = ref<PickerResult[]>([]);

// ── Navigation ──
function nextStep() {
  if (step.value < 4) step.value++;
}

function prevStep() {
  if (step.value > 1) step.value--;
}

function goToStep(s: number) {
  if (s < step.value) step.value = s;
}

function toggleCapability(id: string) {
  if (selections.capabilities.has(id)) {
    selections.capabilities.delete(id);
  } else {
    selections.capabilities.add(id);
  }
}

// ── Scoring ──
function computeBestForOverlap(model: ModelData): number {
  const task = selections.task;
  const keywords = roleBestForMap[task] || [];
  if (!keywords.length) return 0;
  const tags = model.best_for || [];
  let matches = 0;
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) matches++;
  }
  return tags.length > 0 ? matches / Math.max(keywords.length, tags.length) : 0;
}

function computeCapabilityScore(model: ModelData): number {
  const wanted = selections.capabilities;
  if (wanted.size === 0) return 1;

  // Aggregate across all providers: a super model has a capability if any provider supports it
  const hasTool = model.providers.some((p) => p.supports_tools === true);
  const hasReasoning = model.providers.some((p) => p.supports_reasoning === true);
  const hasVision = model.providers.some((p) => p.supports_attachment === true);
  const hasStructured = model.providers.some((p) => p.supports_structured_output === true);
  const hasStreaming = model.providers.some((p) => p.supports_streaming === true);

  const capMap: Record<string, boolean> = {
    tools: hasTool,
    reasoning: hasReasoning,
    vision: hasVision,
    structured_output: hasStructured,
    streaming: hasStreaming,
  };

  // Penalize missing capabilities but don't exclude — the wizard guides, doesn't gate
  let hits = 0;
  let total = 0;
  for (const w of wanted) {
    total++;
    if (capMap[w]) hits++;
  }
  return total > 0 ? hits / total : 0;
}

function computeContextScore(model: ModelData): number {
  const needed = selections.minContext;
  const best = model.best_context;
  if (!best) return 0.3; // unknown context — neutral
  if (best >= needed) return 1;
  // Partial score: how close is best to needed?
  return best / needed;
}

function computeProviderScore(model: ModelData): number {
  const active = model.providers.filter((p) => !p._removed);
  const working = active.filter((p) => p.status.result === 'working');
  const minReq = selections.minWorkingProviders;
  if (minReq > 0 && working.length < minReq) return 0;
  // Score grows with working providers, up to 5
  return Math.min(1, working.length / 5);
}

function getTopProviders(model: ModelData): ProviderDatapoint[] {
  const working = model.providers
    .filter((p) => !p._removed && p.status.result === 'working')
    .sort((a, b) => {
      // Prefer higher context, then alphabetically
      const ctxA = a.context_length || 0;
      const ctxB = b.context_length || 0;
      if (ctxB !== ctxA) return ctxB - ctxA;
      return a.provider.localeCompare(b.provider);
    });
  // Also pull in any rate_limited if not enough working
  if (working.length < 3) {
    const others = model.providers
      .filter((p) => !p._removed && p.status.result !== 'working')
      .sort((a, b) => a.provider.localeCompare(b.provider));
    return [...working, ...others].slice(0, 3);
  }
  return working.slice(0, 3);
}

function countWorkingProviders(model: ModelData): number {
  return model.providers.filter((p) => !p._removed && p.status.result === 'working').length;
}

function computeScore(model: ModelData): PickerResult | null {
  const task = selections.task;
  if (!task) return null;

  // Role ranking position (lower is better)
  let rankScore = 0.5;
  const rankings = model.role_rankings;
  if (rankings && typeof rankings[task] === 'number') {
    const rank = rankings[task];
    // Normalize: rank 1 → 1.0, rank ~50 → 0.0
    rankScore = Math.max(0, 1 - (rank - 1) / 50);
  }

  const bestForScore = computeBestForOverlap(model);
  const capScore = computeCapabilityScore(model);
  const ctxScore = computeContextScore(model);
  const providerScore = computeProviderScore(model);

  // Composite: rank is most important, then task match, then capabilities, then context, then providers
  const score =
    rankScore * 0.3 + bestForScore * 0.25 + capScore * 0.2 + ctxScore * 0.15 + providerScore * 0.1;

  return {
    model,
    score,
    breakdown: { rankScore, bestForScore, capScore, ctxScore, providerScore },
    topProviders: getTopProviders(model),
    workingProviderCount: countWorkingProviders(model),
  };
}

function modelPassesFilters(model: ModelData): boolean {
  // Free only
  if (selections.freeOnly && !model.providers.some((p) => !p._removed && p.is_free)) return false;
  // Open weights only
  if (
    selections.openWeightsOnly &&
    !model.providers.some((p) => !p._removed && p.open_weights === true)
  )
    return false;
  // Context minimum
  if (model.best_context && model.best_context < selections.minContext) return false;
  // Min working providers
  const working = model.providers.filter(
    (p) => !p._removed && p.status.result === 'working',
  ).length;
  if (working < selections.minWorkingProviders) return false;
  return true;
}

function runPicker() {
  ran.value = true;
  const scored: PickerResult[] = [];

  for (const model of store.allModels) {
    if (!modelPassesFilters(model)) continue;
    const result = computeScore(model);
    if (result) scored.push(result);
  }

  scored.sort((a, b) => b.score - a.score);
  results.value = scored.slice(0, 30);
}

// ── Formatting ──
function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return (ctx / 1_000_000).toFixed(0) + 'M';
  if (ctx >= 1_000) return (ctx / 1_000).toFixed(0) + 'K';
  return String(ctx);
}

function paramSize(model: ModelData): string | null {
  // Grab param_count_b from any provider
  for (const p of model.providers) {
    if (p.param_count_b != null) {
      const v = p.param_count_b;
      if (v >= 1000) return (v / 1000).toFixed(1) + 'T';
      return v < 1 ? (v * 1000).toFixed(0) + 'M' : v.toFixed(1) + 'B';
    }
  }
  return null;
}

function statusClass(status: string): string {
  if (status === 'working') return 'status-ok';
  if (status === 'rate_limited') return 'status-warn';
  if (status === 'broken' || status === 'not_found') return 'status-err';
  return 'status-unk';
}

function resetAll() {
  step.value = 1;
  ran.value = false;
  results.value = [];
  selections.task = '';
  selections.capabilities.clear();
  selections.minContext = 8192;
  selections.openWeightsOnly = false;
  selections.freeOnly = true;
  selections.minWorkingProviders = 1;
}

// ── Compare top two ──
function compareTopTwo() {
  if (results.value.length < 2) return;
  const left = results.value[0].model.slug;
  const right = results.value[1].model.slug;
  router.push({ path: '/compare', query: { left, right } });
}

// ── Copy as Markdown ──
async function copyAsMarkdown() {
  const lines: string[] = [
    `# Model Recommendations (${new Date().toISOString().split('T')[0]})`,
    '',
    `**Task:** ${taskOptions.find((t) => t.id === selections.task)?.label || selections.task}`,
    `**Min context:** ${contextOptions.find((c) => c.value === selections.minContext)?.label || selections.minContext}`,
    selections.capabilities.size > 0
      ? `**Capabilities:** ${[...selections.capabilities].map((c) => capabilityOptions.find((o) => o.id === c)?.label || c).join(', ')}`
      : '',
    '',
    '| # | Model | Creator | Score | Context | Providers |',
    '|---|-------|---------|-------|---------|-----------|',
  ];

  results.value.forEach((r, i) => {
    const provs = r.topProviders.map((p) => p.provider).join(', ');
    lines.push(
      `| ${i + 1} | ${r.model.name} | ${r.model.creator || '—'} | ${r.score.toFixed(1)} | ${formatContext(r.model.best_context)} | ${provs} |`,
    );
  });

  try {
    await navigator.clipboard.writeText(lines.filter((l) => l !== '').join('\n'));
    copyTooltip.value = 'Copied!';
    setTimeout(() => {
      copyTooltip.value = 'Copy recommended list as Markdown';
    }, 2000);
  } catch {
    copyTooltip.value = 'Copy failed';
  }
}
</script>

<style scoped>
.mp-page {
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
  margin: 0 0 20px;
}

/* ── Progress indicator ── */
.mp-progress {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 28px;
  justify-content: center;
}

.mp-progress-step {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: default;
  padding: 0 16px;
  position: relative;
}

.mp-progress-step:not(:last-child)::after {
  content: '';
  display: block;
  width: 40px;
  height: 2px;
  background: var(--border);
  margin-left: 16px;
}

.mp-progress-step.done:not(:last-child)::after,
.mp-progress-step.active:not(:last-child)::after {
  background: var(--accent);
}

.mp-progress-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 0.72rem;
  font-weight: 700;
  border: 2px solid var(--border);
  color: var(--text-muted);
  background: var(--bg-card);
  transition: all 0.15s;
}

.mp-progress-step.active .mp-progress-circle {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.mp-progress-step.done .mp-progress-circle {
  border-color: var(--accent);
  background: var(--accent-subtle);
  color: var(--accent);
}

.mp-progress-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 500;
}

.mp-progress-step.active .mp-progress-label {
  color: var(--accent);
  font-weight: 700;
}

.mp-progress-step.done .mp-progress-label {
  color: var(--text);
}

/* ── Step container ── */
.mp-step-content {
  margin-bottom: 24px;
}

.mp-step-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0 0 6px;
  color: var(--text);
}

.mp-step-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0 0 20px;
}

/* ── Task cards (Step 1) ── */
.mp-task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.mp-task-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
  font-family: inherit;
  color: var(--text);
}

.mp-task-card:hover {
  border-color: var(--accent);
  background: var(--bg-hover, rgba(99, 102, 241, 0.04));
}

.mp-task-card.selected {
  border-color: var(--accent);
  background: var(--accent-subtle);
  box-shadow: 0 0 0 1px var(--accent);
}

.mp-task-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: var(--accent);
}

.mp-task-label {
  font-size: 0.82rem;
  font-weight: 600;
}

.mp-task-desc {
  font-size: 0.68rem;
  color: var(--text-muted);
  line-height: 1.3;
}

/* ── Capabilities (Step 2) ── */
.mp-cap-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 500px;
}

.mp-cap-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.12s;
}

.mp-cap-item:hover {
  border-color: var(--accent);
}

.mp-cap-item.selected {
  border-color: var(--accent);
  background: var(--accent-subtle);
}

.mp-cap-item input {
  margin-top: 2px;
  accent-color: var(--accent);
  cursor: pointer;
}

.mp-cap-name {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
}

.mp-cap-desc {
  display: block;
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-top: 2px;
}

/* ── Context buttons (Step 3) ── */
.mp-ctx-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mp-ctx-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.12s;
  font-family: inherit;
  min-width: 100px;
}

.mp-ctx-btn:hover {
  border-color: var(--accent);
}

.mp-ctx-btn.selected {
  border-color: var(--accent);
  background: var(--accent-subtle);
  box-shadow: 0 0 0 1px var(--accent);
}

.mp-ctx-val {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text);
}

.mp-ctx-desc {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-align: center;
}

/* ── Preferences (Step 4) ── */
.mp-prefs {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 450px;
}

.mp-pref-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.mp-pref-item input[type='checkbox'] {
  margin-top: 3px;
  accent-color: var(--accent);
  cursor: pointer;
}

.mp-pref-name {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
}

.mp-pref-desc {
  display: block;
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.mp-pref-slider {
  flex-direction: column;
  gap: 8px;
  cursor: default;
}

.mp-pref-slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.mp-pref-value {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--accent);
  font-family: 'JetBrains Mono', monospace;
}

.mp-range {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}

.mp-range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  color: var(--text-muted);
}

/* ── Navigation buttons ── */
.mp-nav {
  display: flex;
  gap: 10px;
  margin-top: 24px;
}

.mp-btn {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  font-weight: 600;
  border: 1px solid var(--border);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;
}

.mp-btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.mp-btn-primary:hover {
  filter: brightness(1.1);
}

.mp-btn-accent {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  font-size: 0.82rem;
  padding: 10px 28px;
}

.mp-btn-accent:hover {
  filter: brightness(1.1);
}

.mp-btn-secondary {
  background: var(--bg-card);
  color: var(--text);
}

.mp-btn-secondary:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.mp-btn-outline {
  background: transparent;
  color: var(--accent);
  border-color: var(--accent);
}

.mp-btn-outline:hover {
  background: var(--accent-subtle);
}

/* ── Results ── */
.mp-results {
  margin-top: 24px;
}

.mp-results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.mp-results-header h3 {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  color: var(--text);
}

.mp-result-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mp-result-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  padding: 14px 16px;
  transition: border-color 0.12s;
}

.mp-result-card:hover {
  border-color: var(--accent);
}

.mp-result-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.mp-result-info {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.mp-result-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--accent);
  text-decoration: none;
}

.mp-result-name:hover {
  text-decoration: underline;
}

.mp-result-creator {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.mp-result-ctx,
.mp-result-params {
  font-size: 0.68rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg-elevated, var(--border));
  padding: 0 6px;
  border-radius: 3px;
}

.mp-result-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  margin-left: 12px;
}

.mp-score-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent);
  font-family: 'JetBrains Mono', monospace;
}

.mp-score-label {
  font-size: 0.6rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── Provider chips ── */
.mp-result-providers {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.mp-provider-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-elevated, var(--bg-card));
  border: 1px solid var(--border);
  color: var(--text);
}

.mp-provider-status {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.8;
}

.status-ok .mp-provider-status {
  color: #22c55e;
}
.status-warn .mp-provider-status {
  color: #eab308;
}
.status-err .mp-provider-status {
  color: #ef4444;
}
.status-unk .mp-provider-status {
  color: var(--text-muted);
}

/* ── Tags ── */
.mp-result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.mp-tag {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
  border: 1px solid transparent;
}

/* ── Detail link ── */
.mp-result-detail-link {
  font-size: 0.72rem;
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}

.mp-result-detail-link:hover {
  text-decoration: underline;
}

/* ── Empty ── */
.mp-empty {
  text-align: center;
  padding: 60px 24px;
  color: var(--text-muted);
}

.mp-empty h3 {
  font-size: 1rem;
  margin: 0 0 6px;
  color: var(--text);
}

.mp-empty p {
  font-size: 0.78rem;
  margin: 0 0 16px;
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .mp-page {
    padding: 12px;
  }
  .mp-task-grid {
    grid-template-columns: 1fr 1fr;
  }
  .mp-task-card {
    padding: 14px 10px;
  }
  .mp-ctx-buttons {
    flex-wrap: wrap;
  }
  .mp-ctx-btn {
    flex: 1;
    min-width: 80px;
  }
  .mp-progress-step:not(:last-child)::after {
    width: 20px;
  }
  .mp-progress-label {
    display: none;
  }
  .mp-cap-grid {
    max-width: 100%;
  }
  .mp-prefs {
    max-width: 100%;
  }
}
</style>
