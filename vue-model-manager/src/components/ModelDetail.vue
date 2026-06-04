<template>
  <transition name="panel">
    <div v-if="model" class="detail-overlay" @click.self="close">
      <aside ref="panelRef" class="detail-panel" role="dialog" aria-modal="true" :aria-label="model.name">
        <header class="detail-header">
          <div class="detail-header-info">
            <div class="detail-status-row">
              <span class="badge" :class="`badge-${model.status.result}`">{{ formatStatus(model.status.result) }}</span>
              <span class="badge" :class="model.is_free ? 'badge-free-type' : 'badge-paid-type'">
                {{ model.is_free ? 'Free' : 'Paid' }}
              </span>
            </div>
            <h2 class="detail-name" :title="model.name">{{ model.name }}</h2>
            <div class="detail-id-wrap">
              <span class="detail-id">{{ model.id }}</span>
              <button class="copy-btn" :class="{ copied: copied }" :title="copied ? 'Copied!' : 'Copy ID'" aria-label="Copy model ID" @click="doCopy">
                {{ copied ? '✓ Copied' : '📋 Copy' }}
              </button>
            </div>
          </div>
          <button class="detail-close" @click="close" aria-label="Close">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div class="detail-body">
          <!-- Stats grid -->
          <div class="detail-stats">
            <div class="detail-stat">
              <span class="detail-stat-label">Provider</span>
              <span class="detail-stat-value">{{ model.provider }}</span>
              <span v-if="providerUsedUp" class="used-up-badge" title="Provider used up for this month">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Used up
              </span>
            </div>
            <div class="detail-stat">
              <span class="detail-stat-label">Context</span>
              <span class="detail-stat-value">{{ model.context_length ? formatContext(model.context_length) : '—' }}</span>
            </div>
            <div class="detail-stat">
              <span class="detail-stat-label">Price In</span>
              <span class="detail-stat-value">{{ model.input_price_per_million != null ? '$' + model.input_price_per_million + '/M' : '—' }}</span>
            </div>
            <div class="detail-stat">
              <span class="detail-stat-label">Price Out</span>
              <span class="detail-stat-value">{{ model.output_price_per_million != null ? '$' + model.output_price_per_million + '/M' : '—' }}</span>
            </div>
          </div>

          <!-- Best For -->
          <div class="detail-section" v-if="model.best_for.length > 0">
            <span class="detail-label">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Best For
            </span>
            <div class="best-for-tags">
              <span v-for="tag in model.best_for" :key="tag" class="tag">{{ tag }}</span>
            </div>
          </div>

          <!-- Test Result -->
          <div class="detail-section">
            <span class="detail-label">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Latest Test Result
            </span>
            <p class="detail-text">{{ model.status.detail || 'No details' }}</p>
          </div>

          <!-- Test Date -->
          <div class="detail-section" v-if="model.status.tested">
            <span class="detail-label">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Last Tested
            </span>
            <p class="detail-text">{{ model.status.tested }}</p>
          </div>

          <!-- Notes -->
          <div class="detail-section" v-if="model.notes">
            <span class="detail-label">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Notes
            </span>
            <p class="detail-text">{{ model.notes }}</p>
          </div>

          <!-- Removal notice -->
          <div class="detail-section removal-notice" v-if="model._removed">
            <div class="removal-header">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>No longer offered as free</span>
            </div>
            <p class="detail-text" v-if="model._removedDate">Detected on {{ model._removedDate }}.</p>
          </div>

          <!-- Known Issues for this model -->
          <div class="detail-section" v-if="modelIssues.length > 0">
            <span class="detail-label">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Known Issues
            </span>
            <div v-for="issue in modelIssues" :key="issue.issue" class="issue-mini">
              <div class="issue-mini-header">
                <span class="badge" :class="`badge-severity-${issue.severity}`">{{ issue.severity }}</span>
                <span class="issue-mini-title">{{ issue.issue }}</span>
              </div>
              <p><span class="mini-label">Impact:</span> {{ issue.impact }}</p>
              <p><span class="mini-label">Workaround:</span> {{ issue.workaround }}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted, onMounted } from 'vue'
import type { Model } from '@/types'
import { useModelsStore } from '@/store/models'

const props = defineProps<{ model: Model | null }>()
const emit = defineEmits<(e: 'close') => void>()
const store = useModelsStore()

const copied = ref(false)
const panelRef = ref<HTMLElement | null>(null)
let copyTimer: ReturnType<typeof setTimeout> | null = null

// Swipe-to-dismiss (mobile bottom sheet)
let touchStartY = 0
let touchCurrentY = 0
let touchStartTime = 0
let isDragging = false

function onTouchStart(e: TouchEvent) {
  touchStartY = e.touches[0].clientY
  touchCurrentY = touchStartY
  touchStartTime = Date.now()
  isDragging = true
  if (panelRef.value) panelRef.value.style.transition = 'none'
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging) return
  touchCurrentY = e.touches[0].clientY
  const delta = touchCurrentY - touchStartY
  if (delta > 0 && panelRef.value) {
    panelRef.value.style.transform = `translateY(${delta}px)`
  }
}

function onTouchEnd() {
  if (!isDragging) return
  isDragging = false
  const delta = touchCurrentY - touchStartY
  const elapsed = Date.now() - touchStartTime
  const velocity = delta / Math.max(elapsed, 1)
  if (panelRef.value) panelRef.value.style.transition = ''
  if (delta > 80 || velocity > 0.5) {
    close()
  } else if (panelRef.value) {
    panelRef.value.style.transform = ''
  }
}

const providerUsedUp = computed(() => props.model ? store.isModelProviderUsedUp(props.model.id) : false)

const modelIssues = computed(() => {
  if (!props.model) return []
  return store.knownIssues.filter(i => i.model_id === props.model!.id)
})

function close() { emit('close') }

onMounted(() => {
  if (panelRef.value && props.model) {
    panelRef.value.addEventListener('touchstart', onTouchStart, { passive: true })
    panelRef.value.addEventListener('touchmove', onTouchMove, { passive: true })
    panelRef.value.addEventListener('touchend', onTouchEnd)
  }
})

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

watch(() => props.model, (m, old) => {
  if (old) document.removeEventListener('keydown', onKey)
  if (m) {
    document.addEventListener('keydown', onKey)
    // Re-attach touch listeners when panel re-mounts for a new model
    const panel = panelRef.value
    if (panel) {
      panel.addEventListener('touchstart', onTouchStart, { passive: true })
      panel.addEventListener('touchmove', onTouchMove, { passive: true })
      panel.addEventListener('touchend', onTouchEnd)
    }
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  if (copyTimer) clearTimeout(copyTimer)
  if (panelRef.value) {
    panelRef.value.removeEventListener('touchstart', onTouchStart)
    panelRef.value.removeEventListener('touchmove', onTouchMove)
    panelRef.value.removeEventListener('touchend', onTouchEnd)
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
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
}

[data-theme="light"] .detail-overlay::before {
  background: rgba(0,0,0,0.25);
}

.detail-panel {
  position: relative;
  width: 500px;
  max-width: 92vw;
  height: 100%;
  background: var(--bg-elevated);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
}

.detail-header {
  padding: 24px 28px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  position: sticky;
  top: 0;
  background: var(--bg-elevated);
  z-index: 1;
}

.detail-header-info {
  flex: 1;
  min-width: 0;
}

.detail-status-row {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.detail-name {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.02em;
}

.detail-id-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-id {
  font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  font-size: 0.72rem;
  color: var(--accent);
  max-width: 340px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-close {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.detail-close:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--text-dim);
}

.detail-body {
  padding: 20px 28px 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.detail-stat {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.2s;
}

.detail-stat:hover {
  border-color: var(--border-focus);
}

.detail-stat-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.detail-stat-value {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text);
}

.used-up-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.65rem;
  color: var(--orange);
  font-weight: 600;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.detail-text {
  font-size: 0.85rem;
  color: var(--text);
  line-height: 1.6;
}

.best-for-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  background: var(--bg-hover);
  border: 1px solid var(--border);
  padding: 3px 9px;
  border-radius: var(--radius-full);
  font-size: 0.68rem;
  color: var(--text-dim);
  font-weight: 500;
}

.issue-mini {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.issue-mini-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.issue-mini-title {
  font-weight: 600;
  font-size: 0.82rem;
}

.issue-mini p {
  font-size: 0.78rem;
  color: var(--text-dim);
  line-height: 1.5;
}

.mini-label {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.removal-notice {
  background: var(--orange-subtle);
  border: 1px solid rgba(251,191,36,0.25);
  border-radius: var(--radius);
  padding: 14px 16px;
}

.removal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 0.82rem;
  color: var(--orange);
  margin-bottom: 4px;
}

/* Panel transition */
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.25s ease;
}

.panel-enter-active .detail-panel,
.panel-leave-active .detail-panel {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
}

.panel-enter-from .detail-panel,
.panel-leave-to .detail-panel {
  transform: translateX(100%);
}

/* ── Mobile bottom sheet (≤ 768px) ── */
@media (max-width: 768px) {
  .detail-overlay {
    justify-content: center;
    align-items: flex-end;
  }

  .detail-panel {
    width: 100%;
    max-width: 100%;
    height: 85dvh;
    border-left: none;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    border-top: 3px solid var(--border);
    padding-bottom: calc(40px + env(safe-area-inset-bottom, 0px));
  }

  /* Drag handle */
  .detail-panel::before {
    content: '';
    display: block;
    width: 36px;
    height: 4px;
    background: var(--text-muted);
    border-radius: 2px;
    margin: 12px auto 0;
    flex-shrink: 0;
  }

  /* Close button: 44px touch target */
  .detail-close {
    width: 44px;
    height: 44px;
  }

  /* Mobile panel transition: slide from bottom */
  .panel-enter-from .detail-panel,
  .panel-leave-to .detail-panel {
    transform: translateY(100%);
  }

  /* Header padding tighter on mobile */
  .detail-header {
    padding: 16px 16px 14px;
  }

  /* Body padding tighter */
  .detail-body {
    padding: 16px;
  }

  /* ID wrap: allow text to break */
  .detail-id {
    max-width: 200px;
    word-break: break-all;
    white-space: normal;
  }
}
</style>
