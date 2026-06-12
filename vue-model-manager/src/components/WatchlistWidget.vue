<template>
  <div class="wl-widget card" v-if="wl.watched.value.length">
    <div class="wl-header">
      <span class="wl-title">⭐ My Models</span>
      <span class="wl-count"
        >{{ wl.watched.value.length }} watched · {{ wl.changes.value.length }} changed</span
      >
    </div>

    <div v-if="wl.changes.value.length" class="wl-changes">
      <div
        v-for="c in wl.changes.value"
        :key="c.model.slug"
        class="wl-change"
        :class="c.curr === 'working' ? 'good' : 'bad'"
      >
        <router-link :to="`/model/${c.model.slug}`" class="wl-change-link">{{
          c.model.name
        }}</router-link>
        <span class="wl-change-arrow">{{ c.prev }} → {{ c.curr }}</span>
      </div>
    </div>

    <div class="wl-grid">
      <div
        v-for="item in wl.watched.value.slice(0, 8)"
        :key="item.super_id"
        class="wl-card"
        :class="statusClass(item.super_id)"
      >
        <router-link :to="`/model/${item.slug}`" class="wl-name">{{ item.name }}</router-link>
        <span class="wl-status">{{ statusLabel(item.super_id) }}</span>
        <button class="wl-remove" @click="wl.remove(item.super_id)" title="Remove">✕</button>
      </div>
    </div>

    <router-link v-if="wl.watched.value.length > 8" to="/" class="wl-more"
      >+{{ wl.watched.value.length - 8 }} more →</router-link
    >
  </div>
</template>

<script setup lang="ts">
import { useWatchList } from '@/composables/useWatchList';
import { useModelsStore } from '@/store/models';

const wl = useWatchList();
const store = useModelsStore();

function statusClass(superId: number): string {
  const model = [...store.allModels].find((m) => m.super_id === superId);
  if (!model) return '';
  const working = model.providers.some((p) => !p._removed && p.status.result === 'working');
  const rateLimited = model.providers.some(
    (p) => !p._removed && p.status.result === 'rate_limited',
  );
  if (working) return 'status-working';
  if (rateLimited) return 'status-rate-limited';
  return 'status-down';
}

function statusLabel(superId: number): string {
  const model = [...store.allModels].find((m) => m.super_id === superId);
  if (!model) return 'unknown';
  const working = model.providers.filter(
    (p) => !p._removed && p.status.result === 'working',
  ).length;
  const total = model.providers.filter((p) => !p._removed).length;
  if (working > 0) return `${working}/${total} working`;
  if (model.providers.some((p) => !p._removed && p.status.result === 'rate_limited'))
    return 'rate limited';
  return 'down';
}
</script>

<style scoped>
.wl-widget {
  padding: 14px;
  margin-bottom: 16px;
}
.wl-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.wl-title {
  font-size: 0.85rem;
  font-weight: 700;
}
.wl-count {
  font-size: 0.62rem;
  color: var(--text-dim);
}

.wl-changes {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 10px;
  padding: 8px;
  border-radius: 6px;
  background: var(--bg-elevated);
}
.wl-change {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.68rem;
}
.wl-change.good {
  color: var(--green);
}
.wl-change.bad {
  color: var(--orange);
}
.wl-change-link {
  color: inherit;
  font-weight: 600;
}
.wl-change-arrow {
  font-size: 0.6rem;
  opacity: 0.7;
}

.wl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px;
}
.wl-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 0.7rem;
}
.wl-card.status-working {
  border-left: 3px solid var(--green);
}
.wl-card.status-rate-limited {
  border-left: 3px solid var(--orange);
}
.wl-card.status-down {
  border-left: 3px solid var(--red);
}
.wl-name {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wl-name:hover {
  text-decoration: underline;
}
.wl-status {
  font-size: 0.58rem;
  color: var(--text-dim);
  white-space: nowrap;
}
.wl-remove {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.6rem;
  padding: 0 2px;
  opacity: 0;
  transition: opacity 0.12s;
}
.wl-card:hover .wl-remove {
  opacity: 1;
}
.wl-remove:hover {
  color: var(--red);
}
.wl-more {
  font-size: 0.65rem;
  color: var(--accent);
  display: block;
  margin-top: 6px;
  text-align: right;
}
</style>
