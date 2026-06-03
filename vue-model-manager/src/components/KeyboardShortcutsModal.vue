<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-overlay" @click.self="$emit('close')" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div class="modal-content shortcuts-modal">
          <div class="modal-header">
            <h2>Keyboard Shortcuts</h2>
            <button class="modal-close" @click="$emit('close')" aria-label="Close shortcuts">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="shortcuts-body">
            <div class="shortcut-group">
              <h3>Navigation</h3>
              <div class="shortcut-row">
                <kbd>g</kbd><kbd>d</kbd>
                <span>Go to Dashboard</span>
              </div>
              <div class="shortcut-row">
                <kbd>g</kbd><kbd>a</kbd>
                <span>Go to All Models</span>
              </div>
              <div class="shortcut-row">
                <kbd>g</kbd><kbd>f</kbd>
                <span>Go to Free Models</span>
              </div>
              <div class="shortcut-row">
                <kbd>g</kbd><kbd>p</kbd>
                <span>Go to Paid Models</span>
              </div>
              <div class="shortcut-row">
                <kbd>g</kbd><kbd>s</kbd>
                <span>Go to Super Models</span>
              </div>
              <div class="shortcut-row">
                <kbd>g</kbd><kbd>i</kbd>
                <span>Go to Issues</span>
              </div>
            </div>
            <div class="shortcut-group">
              <h3>Actions</h3>
              <div class="shortcut-row">
                <kbd>/</kbd>
                <span>Focus search</span>
              </div>
              <div class="shortcut-row">
                <kbd>?</kbd>
                <span>Show this help</span>
              </div>
              <div class="shortcut-row">
                <kbd>Esc</kbd>
                <span>Close modal / Clear search</span>
              </div>
              <div class="shortcut-row">
                <kbd>Enter</kbd>
                <span>Open selected model</span>
              </div>
            </div>
            <div class="shortcut-group">
              <h3>Theme</h3>
              <div class="shortcut-row">
                <kbd>t</kbd>
                <span>Toggle dark/light mode</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <span class="footer-hint">Press <kbd>?</kbd> anytime to show this help</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{ open: boolean }>()
defineEmits<{ close: [] }>()
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-content {
  background: var(--bg-elevated, #161b26);
  border: 1px solid var(--border, #1e2538);
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-lg, 0 20px 25px -5px rgba(0,0,0,0.4));
  max-width: 520px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border, #1e2538);
}

.modal-header h2 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text, #e8ecf4);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-muted, #4d5668);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 6px;
  transition: all 0.15s;
}

.modal-close:hover {
  color: var(--text, #e8ecf4);
  background: var(--bg-hover, #1e2538);
}

.shortcuts-body {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.shortcut-group h3 {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted, #4d5668);
  margin: 0 0 10px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
}

.shortcut-row span {
  font-size: 0.82rem;
  color: var(--text, #e8ecf4);
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 24px;
  padding: 0 6px;
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text, #e8ecf4);
  background: var(--bg, #0d1117);
  border: 1px solid var(--border, #1e2538);
  border-bottom-width: 2px;
  border-radius: 5px;
  line-height: 1;
}

.modal-footer {
  padding: 12px 22px 16px;
  border-top: 1px solid var(--border, #1e2538);
}

.footer-hint {
  font-size: 0.72rem;
  color: var(--text-muted, #4d5668);
}

/* Transition */
.modal-enter-active { transition: all 0.2s ease-out; }
.modal-leave-active { transition: all 0.15s ease-in; }
.modal-enter-from { opacity: 0; }
.modal-enter-from .modal-content { transform: scale(0.95) translateY(10px); }
.modal-leave-to { opacity: 0; }
.modal-leave-to .modal-content { transform: scale(0.98); }
</style>
