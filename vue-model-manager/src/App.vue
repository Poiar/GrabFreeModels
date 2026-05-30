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
      <nav>
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
          Last updated: {{ store.lastLoaded.toLocaleString() }}
        </p>
        <button @click="store.loadData()" class="refresh-btn" :disabled="store.loading">
          {{ store.loading ? 'Loading…' : '↻ Refresh' }}
        </button>
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

const store = useModelsStore()
onMounted(() => store.loadData())
</script>
