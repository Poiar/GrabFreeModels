<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-icon">🧠</span>
        <div>
          <h1>GrabFreeModels</h1>
          <p class="brand-sub">Free LLM Tracker</p>
        </div>
      </div>
      <nav aria-label="Main navigation">
        <router-link to="/" active-class="active">
          <span class="nav-icon">📊</span> Dashboard
        </router-link>
        <router-link to="/models" active-class="active">
          <span class="nav-icon">🤖</span> Models
        </router-link>
        <router-link to="/rankings" active-class="active">
          <span class="nav-icon">🏆</span> Rankings
        </router-link>
        <router-link to="/issues" active-class="active">
          <span class="nav-icon">⚠️</span> Issues
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <p v-if="store.lastLoaded">
          Last updated: {{ timeAgo(store.lastLoaded) }}
        </p>
        <div class="footer-actions">
          <button class="theme-toggle" @click="toggleTheme" :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'">
            {{ theme === 'dark' ? '☀️' : '🌙' }}
          </button>
          <button @click="store.loadData()" class="refresh-btn" :disabled="store.loading">
            {{ store.loading ? 'Loading…' : '↻ Refresh' }}
          </button>
        </div>
      </div>
    </aside>
    <main class="content">
      <div v-if="store.loading" class="center-message">
        <div class="spinner"></div>
        <p>Loading model data…</p>
      </div>
      <div v-else-if="store.error" class="center-message error-box">
        <h2>Failed to load data</h2>
        <p>{{ store.error }}</p>
        <button @click="store.loadData()" class="refresh-btn">Retry</button>
      </div>
      <router-view v-else v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useModelsStore } from '@/store/models'
import { useTheme } from '@/composables/useTheme'

const store = useModelsStore()
const { theme, toggle: toggleTheme } = useTheme()
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
