<template>
  <Transition name="error-console">
    <div v-if="isOpen" id="vibe-error-console" class="vibe-error-console">
      <div class="vibe-error-head">
        <strong>Error Console</strong>
        <div class="vibe-error-actions">
          <button @click="handleCopy">Copy Errors</button>
          <button @click="clear">Clear</button>
          <button @click="close">Close</button>
        </div>
      </div>
      <div id="vibe-error-list" class="vibe-error-list">
        <div v-for="err in errors" :key="err.id" class="vibe-error-item">
          <b>{{ err.message }}</b>
          <div class="vibe-error-meta">
            {{ err.source || 'inline/runtime' }}
            <template v-if="err.line"> line {{ err.line }}</template>
            <template v-if="err.col">:{{ err.col }}</template>
            · {{ err.time }}
          </div>
          <pre>{{ err.stack || err.message }}</pre>
        </div>
        <div v-if="errors.length === 0" class="vibe-error-empty">No errors captured yet.</div>
      </div>
      <div class="vibe-error-note">
        This panel opens automatically when JavaScript throws an error. Copy the error and paste it
        back to your AI.
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useErrorConsole } from '@/composables/useErrorConsole';

const { errors, isOpen, clear, close, copyToClipboard } = useErrorConsole();

async function handleCopy() {
  await copyToClipboard();
}
</script>

<style scoped>
.vibe-error-console {
  position: fixed;
  right: 18px;
  bottom: 18px;
  width: min(760px, calc(100vw - 36px));
  max-height: min(560px, calc(100vh - 36px));
  background: rgba(10, 11, 16, 0.97);
  color: #f7efdf;
  border: 1px solid rgba(255, 127, 145, 0.55);
  border-radius: 16px;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.72);
  z-index: 999999;
  overflow: hidden;
  font-family: system-ui, sans-serif;
  display: flex;
  flex-direction: column;
}

.vibe-error-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #444;
  background: #2a1118;
  flex-shrink: 0;
}

.vibe-error-head strong {
  color: #ffd8de;
  font-size: 13px;
}

.vibe-error-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.vibe-error-actions button {
  border: 1px solid #555;
  background: #1d1f2a;
  color: #f7efdf;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: background 0.15s;
}

.vibe-error-actions button:hover {
  background: #2a2d3a;
}

.vibe-error-list {
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  max-height: 420px;
}

.vibe-error-item {
  border: 1px solid #444;
  background: #111;
  padding: 10px;
  border-radius: 10px;
  margin-bottom: 10px;
}

.vibe-error-item b {
  color: #ffd8de;
  word-break: break-word;
}

.vibe-error-meta {
  color: #aaa;
  font-size: 12px;
  margin-top: 4px;
}

.vibe-error-item pre {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow: auto;
  margin: 8px 0 0;
  color: #f7efdf;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.vibe-error-empty {
  color: #888;
  font-size: 13px;
  text-align: center;
  padding: 24px;
}

.vibe-error-note {
  color: #aaa;
  font-size: 12px;
  padding: 0 12px 12px;
  line-height: 1.35;
  flex-shrink: 0;
}

/* ── Transition ── */
.error-console-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.error-console-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.error-console-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.97);
}

.error-console-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
