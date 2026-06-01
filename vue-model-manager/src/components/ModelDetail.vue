<template>
  <transition name="panel">
    <div v-if="model" class="detail-overlay" @click.self="close">
      <aside class="detail-panel" role="dialog" aria-modal="true" :aria-label="model.name">
        <header class="detail-header">
          <div class="detail-header-info">
            <h2 class="detail-name" :title="model.name">{{ model.name }}</h2>
            <div class="detail-id-wrap">
              <span class="detail-id">{{ model.id }}</span>
              <button class="copy-btn" :class="{ copied: copied }" :title="copied ? 'Copied!' : 'Copy ID'" @click="doCopy">
                {{ copied ? '✓' : '📋' }}
              </button>
            </div>
          </div>
          <button class="detail-close" @click="close" aria-label="Close">✕</button>
        </header>

        <div class="detail-body">
          <!-- Status & Provider -->
          <div class="detail-row">
            <div class="detail-field">
              <span class="detail-label">Status</span>
              <span class="badge" :class="`badge-${model.status.result}`">{{ formatStatus(model.status.result) }}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Provider</span>
              <span>{{ model.provider }}</span>
              <span v-if="providerUsedUp" class="used-up-icon" title="Provider used up for this month">⚠</span>
            </div>
          </div>

          <!-- Type & Context -->
          <div class="detail-row">
            <div class="detail-field">
              <span class="detail-label">Type</span>
              <span class="badge" :class="model.is_free ? 'badge-free-type' : 'badge-paid-type'">
                {{ model.is_free ? 'Free' : 'Paid' }}
              </span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Context</span>
              <span>{{ model.context_length ? formatContext(model.context_length) : '—' }}</span>
            </div>
          </div>

          <!-- Pricing -->
          <div class="detail-row">
            <div class="detail-field">
              <span class="detail-label">Price In</span>
              <span>{{ model.input_price_per_million != null ? '$' + model.input_price_per_million + '/M' : '—' }}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Price Out</span>
              <span>{{ model.output_price_per_million != null ? '$' + model.output_price_per_million + '/M' : '—' }}</span>
            </div>
          </div>

          <!-- Best For -->
          <div class="detail-section">
            <span class="detail-label">Best For</span>
            <div class="best-for-tags">
              <span v-for="tag in model.best_for" :key="tag" class="tag">{{ tag }}</span>
              <span v-if="!model.best_for.length" class="text-dim">None listed</span>
            </div>
          </div>

          <!-- Test Result -->
          <div class="detail-section">
            <span class="detail-label">Latest Test Result</span>
            <p class="detail-text">{{ model.status.detail || 'No details' }}</p>
          </div>

          <!-- Test Date -->
          <div class="detail-row" v-if="model.status.tested">
            <div class="detail-field">
              <span class="detail-label">Last Tested</span>
              <span>{{ model.status.tested }}</span>
            </div>
          </div>

          <!-- Notes -->
          <div class="detail-section" v-if="model.notes">
            <span class="detail-label">Notes</span>
            <p class="detail-text">{{ model.notes }}</p>
          </div>

          <!-- Known Issues for this model -->
          <div class="detail-section" v-if="modelIssues.length > 0">
            <span class="detail-label">Known Issues</span>
            <div v-for="issue in modelIssues" :key="issue.issue" class="issue-mini">
              <div class="issue-mini-header">
                <span class="badge badge-severity-low">{{ issue.severity }}</span>
                <span class="issue-mini-title">{{ issue.issue }}</span>
              </div>
              <p><span class="detail-label">Impact:</span> {{ issue.impact }}</p>
              <p><span class="detail-label">Workaround:</span> {{ issue.workaround }}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Model } from '@/types'
import { useModelsStore } from '@/store/models'

const props = defineProps<{ model: Model | null }>()
const emit = defineEmits<(e: 'close') => void>()
const store = useModelsStore()

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

const providerUsedUp = computed(() => props.model ? store.isModelProviderUsedUp(props.model.id) : false)

const modelIssues = computed(() => {
  if (!props.model) return []
  return store.knownIssues.filter(i => i.model_id === props.model!.id)
})

function close() { emit('close') }

async function doCopy() {
  if (!props.model) return
  try {
    await navigator.clipboard.writeText(props.model.id)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = props.model!.id
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copied.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copied.value = false }, 1500)
}

function formatStatus(s: string) {
  if (s === 'rate_limited') return 'Rate Limited'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 })
function formatContext(n: number) { return fmt.format(n) }

// Close on Escape
watch(() => props.model, (m) => {
  if (m) {
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('keydown', onKey)
  }
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
</script>

<style scoped>
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}

.detail-overlay::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
}

[data-theme="light"] .detail-overlay::before {
  background: rgba(0,0,0,0.3);
}

.detail-panel {
  position: relative;
  width: 480px;
  max-width: 90vw;
  height: 100%;
  background: var(--bg-elevated);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0,0,0,0.3);
}

.detail-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.detail-header-info {
  flex: 1;
  min-width: 0;
}

.detail-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-id-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.detail-id {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.75rem;
  color: var(--accent);
  max-width: 340px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-close {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.detail-close:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--text-dim);
}

.detail-body {
  padding: 16px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-row {
  display: flex;
  gap: 24px;
}

.detail-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}

.detail-text {
  font-size: 0.85rem;
  color: var(--text);
  line-height: 1.5;
}

.best-for-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  background: var(--bg-hover);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.7rem;
  color: var(--text-dim);
}

.issue-mini {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.issue-mini-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.issue-mini-title {
  font-weight: 600;
  font-size: 0.85rem;
}

.issue-mini p {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.badge-provider {
  background: rgba(88,166,255,0.15);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 600;
}

/* Panel transition */
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s ease;
}

.panel-enter-active .detail-panel,
.panel-leave-active .detail-panel {
  transition: transform 0.25s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
}

.panel-enter-from .detail-panel,
.panel-leave-to .detail-panel {
  transform: translateX(100%);
}
</style>
