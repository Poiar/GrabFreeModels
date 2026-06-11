<template>
  <div class="pce-wrap">
    <button class="pce-toggle" @click="open = !open">{{ open ? 'Hide' : 'Export' }} Configs</button>
    <div v-if="open" class="pce-panel">
      <div class="pce-buttons">
        <button class="pce-btn" @click="exportFormat('litellm')">LiteLLM providers.json</button>
        <button class="pce-btn" @click="exportFormat('openai')">OpenAI endpoints.json</button>
        <button class="pce-btn" @click="exportFormat('env')">.env template</button>
      </div>
      <pre v-if="output" class="pce-output">{{ output }}</pre>
    </div>
    <span v-if="copied" class="pce-copied">Copied!</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useModelsStore } from '@/store/models';
const store = useModelsStore();
const open = ref(false);
const output = ref('');
const copied = ref(false);

function exportFormat(fmt: string) {
  let text = '';
  const providers = store.visibleProviderRefs;
  if (fmt === 'litellm') {
    const config = providers.filter(p => p.provider_type === 'inference').map(p => ({
      provider: p.slug,
      base_url: p.base_url || undefined,
      api_key: `os.environ/${p.slug.toUpperCase()}_API_KEY`,
      rpm: p.max_rpm || undefined,
      tpm: p.max_tpm || undefined,
    }));
    text = JSON.stringify({ providers: config }, null, 2);
  } else if (fmt === 'openai') {
    const eps: Record<string, any> = {};
    for (const p of providers) {
      if (p.is_openai_compat && p.base_url) eps[p.slug] = { base_url: p.base_url, api_key_env: p.slug.toUpperCase() + '_API_KEY' };
    }
    text = JSON.stringify({ endpoints: eps }, null, 2);
  } else if (fmt === 'env') {
    const lines: string[] = [];
    for (const p of providers) lines.push(`${p.slug.toUpperCase()}_API_KEY=`);
    text = lines.join('\n');
  }
  output.value = text;
  navigator.clipboard.writeText(text).then(() => { copied.value = true; setTimeout(() => copied.value = false, 2000); });
}
</script>

<style scoped>
.pce-wrap { margin-top: 12px; }
.pce-toggle { font-size: 0.7rem; padding: 5px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card); color: var(--accent); cursor: pointer; font-family: inherit; font-weight: 600; }
.pce-toggle:hover { border-color: var(--accent); }
.pce-panel { margin-top: 8px; }
.pce-buttons { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.pce-btn { font-size: 0.68rem; padding: 4px 10px; border: 1px solid var(--accent); border-radius: 4px; background: var(--accent-subtle); color: var(--accent); cursor: pointer; font-family: inherit; }
.pce-btn:hover { background: var(--accent); color: #fff; }
.pce-output { font-size: 0.65rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 10px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; font-family: 'JetBrains Mono', monospace; color: var(--text); }
.pce-copied { font-size: 0.6rem; color: var(--green); margin-left: 8px; font-weight: 600; }
</style>
