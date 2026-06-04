<template>
  <div class="layout">
    <!-- Skip to content link for accessibility -->
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <!-- Mobile top bar -->
    <MobileHeader :open="mobileDrawerOpen" :theme="theme" @toggle="mobileDrawerOpen = !mobileDrawerOpen" @toggle-theme="toggleTheme" />

    <!-- Sidebar backdrop (mobile only) -->
    <div class="sidebar-backdrop" :class="{ visible: mobileDrawerOpen }" @click="mobileDrawerOpen = false" aria-hidden="true"></div>

    <aside class="sidebar" :class="{ 'drawer-open': mobileDrawerOpen }">
      <div class="brand">
        <div class="brand-icon-wrap">
          <span class="brand-icon">⚡</span>
        </div>
        <div>
          <h1>GrabFreeModels</h1>
          <p class="brand-sub">Free LLM Intelligence</p>
        </div>
      </div>
      <nav aria-label="Main navigation">
        <router-link to="/" active-class="active">
          <span class="nav-icon">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </span>
          <span>Models</span>
        </router-link>
        <router-link to="/dashboard" active-class="active">
          <span class="nav-icon">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </span>
          <span>Dashboard</span>
        </router-link>
        <router-link to="/creators" active-class="active">
          <span class="nav-icon">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <span>Creators</span>
        </router-link>
        <router-link to="/issues" active-class="active">
          <span class="nav-icon">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <span>Issues</span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <div class="footer-status" v-if="store.lastLoaded">
          <span class="status-dot" :class="{ 'is-stale': store.isStale }"></span>
          <span>Updated {{ timeAgo(store.lastLoaded) }}</span>
        </div>
        <div class="footer-actions">
          <button class="theme-toggle" @click="toggleTheme" :title="theme === 'dark' ? 'Switch to light mode (T)' : 'Switch to dark mode (T)'" :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'" :aria-pressed="theme !== 'dark'">
            <svg aria-hidden="true" v-if="theme === 'dark'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <svg aria-hidden="true" v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <button @click="store.loadData()" class="refresh-btn" :disabled="store.loading">
            <svg aria-hidden="true" v-if="!store.loading" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            <span v-else class="btn-spinner"></span>
            {{ store.loading ? 'Loading…' : 'Refresh' }}
          </button>
        </div>
        <button class="footer-shortcuts-hint" @click="shortcutsModalOpen = true" title="Keyboard shortcuts (?)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/><line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="6" y1="16" x2="6" y2="16"/><line x1="18" y1="16" x2="18" y2="16"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
          <span>? shortcuts</span>
        </button>
      </div>
    </aside>
    <main id="main-content" class="content" tabindex="-1">
      <div v-if="store.loading" class="center-message">
        <SkeletonLoader />
      </div>
      <div v-else-if="store.error" class="center-message error-box">
        <div class="error-icon">⚠</div>
        <h2>Failed to load data</h2>
        <p class="error-message">{{ store.error }}</p>
        <p v-if="store.lastLoaded" class="error-last-loaded">
          Last successful load: {{ timeAgo(store.lastLoaded) }}
        </p>
        <button @click="store.loadData()" class="refresh-btn">Retry</button>
      </div>
      <router-view v-else v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>

  <!-- Keyboard shortcuts modal -->
  <KeyboardShortcutsModal :open="shortcutsModalOpen" @close="shortcutsModalOpen = false" />

  <!-- Toast container -->
  <ToastContainer />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useModelsStore } from '@/store/models'
import { useTheme } from '@/composables/useTheme'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import KeyboardShortcutsModal from '@/components/KeyboardShortcutsModal.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import MobileHeader from '@/components/MobileHeader.vue'

const route = useRoute()
const store = useModelsStore()
const { theme, toggle: toggleTheme } = useTheme()
const { shortcutsModalOpen } = useKeyboardShortcuts()

const mobileDrawerOpen = ref(false)

// Close drawer on route change
watch(() => route.path, () => { mobileDrawerOpen.value = false })

// Close drawer on Escape key
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && mobileDrawerOpen.value) {
    mobileDrawerOpen.value = false
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
})

onMounted(() => store.loadData())

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}


</script>

<style scoped>
.skip-link {
  position: absolute;
  top: -100px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  padding: 8px 20px;
  background: var(--accent);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 0 0 var(--radius) var(--radius);
  text-decoration: none;
  transition: top 0.2s;
}

.skip-link:focus {
  top: 0;
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.brand-icon-wrap {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-subtle);
  border-radius: var(--radius);
  flex-shrink: 0;
}

.brand-icon {
  font-size: 22px;
  filter: none;
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 0.68rem;
  color: var(--text-muted);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
  flex-shrink: 0;
  box-shadow: 0 0 6px var(--green-glow);
  transition: all 0.3s;
}

.status-dot.is-stale {
  background: var(--orange);
  box-shadow: 0 0 6px var(--orange-glow);
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  padding: 6px 12px;
}

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.footer-shortcuts-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.65rem;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 0;
  background: none;
  border: none;
  font-family: inherit;
  transition: color 0.15s;
}

.footer-shortcuts-hint:hover {
  color: var(--accent);
}

.error-icon {
  font-size: 2.5rem;
  margin-bottom: 4px;
}

/* Focus styles for main content area */
.content:focus {
  outline: none;
}

/* ── Mobile drawer (≤ 768px) ── */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 56px;
    left: 0;
    bottom: 0;
    width: 280px;
    height: calc(100dvh - 56px);
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 200;
    border-right: none;
    box-shadow: none;
  }

  .sidebar.drawer-open {
    transform: translateX(0);
    box-shadow: var(--shadow-xl);
  }

  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    top: 56px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 199;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
  }

  .sidebar-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
