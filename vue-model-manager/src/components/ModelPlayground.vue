<template>
  <div class="mpg-wrap" v-if="model">
    <button class="mpg-toggle" @click="open = !open">
      {{ open ? 'Hide' : 'Test' }} Playground
    </button>
    <div v-if="open" class="mpg-panel">
      <div class="mpg-controls">
        <select v-model="selectedProvider" class="mpg-select">
          <option value="">All working providers</option>
          <option v-for="dp in workingDps" :key="dp.provider_slug" :value="dp.provider_slug">
            {{ dp.provider }}
          </option>
        </select>
        <button class="mpg-send-btn" @click="sendPrompt" :disabled="!prompt || sending">
          {{ sending ? 'Sending…' : 'Send' }}
        </button>
      </div>
      <textarea
        v-model="prompt"
        class="mpg-input"
        rows="4"
        placeholder="Enter a test prompt…"
        @keydown.ctrl.enter="sendPrompt"
      ></textarea>
      <div v-if="response" class="mpg-response">
        <div class="mpg-resp-header">
          <span class="mpg-resp-provider">{{ response.provider }}</span>
          <span class="mpg-resp-latency">{{ response.latencyMs }}ms</span>
          <span class="mpg-resp-status" :class="response.ok ? 'ok' : 'fail'">{{
            response.ok ? 'OK' : 'Failed'
          }}</span>
        </div>
        <pre class="mpg-resp-body">{{ response.body }}</pre>
      </div>
      <p class="mpg-note">
        Tests run against the validator endpoint. Works only when the API server is running locally.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ModelData } from '@/types';

const props = defineProps<{ model: ModelData }>();

const open = ref(false);
const prompt = ref('');
const selectedProvider = ref('');
const sending = ref(false);
const response = ref<{ provider: string; latencyMs: number; ok: boolean; body: string } | null>(
  null,
);

const workingDps = computed(() =>
  props.model.providers.filter((p) => !p._removed && p.status.result === 'working'),
);

async function sendPrompt() {
  if (!prompt.value.trim()) return;
  sending.value = true;
  response.value = null;
  const start = performance.now();
  try {
    const providers = selectedProvider.value
      ? [selectedProvider.value]
      : workingDps.value.map((p) => p.provider_slug);
    if (providers.length === 0) {
      response.value = {
        provider: 'none',
        latencyMs: 0,
        ok: false,
        body: 'No working providers available.',
      };
      return;
    }
    const provider = providers[0];
    const dp = props.model.providers.find((p) => p.provider_slug === provider);
    const fullId = dp?.full_id || '';
    // Try the local validator endpoint
    const resp = await fetch('/api/test-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_id: fullId, prompt: prompt.value.trim() }),
    });
    const text = await resp.text();
    response.value = {
      provider,
      latencyMs: Math.round(performance.now() - start),
      ok: resp.ok,
      body: text.slice(0, 2000),
    };
  } catch (e: unknown) {
    response.value = {
      provider: selectedProvider.value || 'any',
      latencyMs: Math.round(performance.now() - start),
      ok: false,
      body: String(e),
    };
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped>
.mpg-wrap {
  margin-top: 16px;
}
.mpg-toggle {
  font-size: 0.7rem;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--accent);
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
}
.mpg-toggle:hover {
  border-color: var(--accent);
}
.mpg-panel {
  margin-top: 8px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
}
.mpg-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.mpg-select {
  flex: 1;
  font-size: 0.68rem;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--text);
  font-family: inherit;
}
.mpg-send-btn {
  font-size: 0.7rem;
  padding: 4px 14px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--accent-subtle);
  color: var(--accent);
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  white-space: nowrap;
}
.mpg-send-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.mpg-input {
  width: 100%;
  font-size: 0.72rem;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}
.mpg-input:focus {
  outline: none;
  border-color: var(--accent);
}
.mpg-response {
  margin-top: 10px;
}
.mpg-resp-header {
  display: flex;
  gap: 8px;
  font-size: 0.65rem;
  margin-bottom: 6px;
  align-items: center;
}
.mpg-resp-provider {
  font-weight: 700;
  color: var(--text);
}
.mpg-resp-latency {
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-dim);
}
.mpg-resp-status {
  padding: 0 4px;
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 3px;
  text-transform: uppercase;
}
.mpg-resp-status.ok {
  background: rgba(52, 211, 153, 0.12);
  color: var(--green);
}
.mpg-resp-status.fail {
  background: rgba(239, 68, 68, 0.12);
  color: var(--red);
}
.mpg-resp-body {
  font-size: 0.68rem;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
  background: var(--bg-card);
  border-radius: 4px;
  border: 1px solid var(--border);
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
  line-height: 1.4;
}
.mpg-note {
  font-size: 0.58rem;
  color: var(--text-muted);
  margin-top: 8px;
}
</style>
