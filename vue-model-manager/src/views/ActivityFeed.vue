<template>
  <div class="af-page">
    <div class="page-header"><h2>Activity Feed</h2><p>Recent model status changes across all providers</p></div>
    <div class="af-filters">
      <input v-model="search" type="text" class="af-search" placeholder="Filter by model or provider…"/>
      <select v-model="eventFilter" class="af-select">
        <option value="">All events</option>
        <option value="broken">Newly broken</option>
        <option value="fixed">Newly fixed</option>
        <option value="rate_limited">Rate limited</option>
      </select>
    </div>
    <div v-if="filteredEvents.length === 0" class="af-empty">No events found.</div>
    <div v-else class="af-timeline">
      <div v-for="(evt, i) in filteredEvents" :key="i" class="af-event">
        <span class="af-event-date">{{ evt.date }}</span>
        <span class="af-event-dot" :class="'af-dot-' + evt.type"></span>
        <router-link :to="'/model/' + evt.slug" class="af-event-model">{{ evt.name }}</router-link>
        <span class="af-event-type" :class="'af-type-' + evt.type">{{ evt.type === 'broken' ? '↓ went broken' : evt.type === 'fixed' ? '↑ came back' : '~ rate limited' }}</span>
        <span class="af-event-provider">via {{ evt.provider }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useModelsStore } from '@/store/models';
const store = useModelsStore();
const search = ref('');
const eventFilter = ref('');

interface FeedEvent { date: string; slug: string; name: string; provider: string; type: 'broken' | 'fixed' | 'rate_limited'; }

const events = computed((): FeedEvent[] => {
  const result: FeedEvent[] = [];
  // Recently broken
  for (const r of store.recentlyBroken) result.push({ date: 'latest', slug: r.slug, name: r.name, provider: r.provider, type: 'broken' });
  // Recently fixed
  for (const r of store.recentlyFixed) result.push({ date: 'latest', slug: r.slug, name: r.name, provider: r.provider, type: 'fixed' });
  // Sort: broken first, then fixed
  result.sort((a, b) => { const o: Record<string, number> = { broken: 0, fixed: 1, rate_limited: 2 }; return o[a.type] - o[b.type]; });
  return result;
});

const filteredEvents = computed(() => {
  let list = events.value;
  const q = search.value.trim().toLowerCase();
  if (q) list = list.filter(e => e.name.toLowerCase().includes(q) || e.provider.toLowerCase().includes(q));
  if (eventFilter.value) list = list.filter(e => e.type === eventFilter.value);
  return list;
});
</script>

<style scoped>
.af-page { max-width: 900px; margin: 0 auto; padding: 20px; }
.page-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.page-header p { font-size: 0.78rem; color: var(--text-muted); margin: 0 0 16px; }
.af-filters { display: flex; gap: 8px; margin-bottom: 16px; }
.af-search { flex: 1; font-size: 0.72rem; padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card); color: var(--text); font-family: inherit; max-width: 300px; }
.af-search:focus { outline: none; border-color: var(--accent); }
.af-select { font-size: 0.72rem; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card); color: var(--text-dim); font-family: inherit; }
.af-empty { text-align: center; padding: 40px; color: var(--text-muted); font-size: 0.85rem; }
.af-timeline { display: flex; flex-direction: column; gap: 2px; }
.af-event { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 6px; background: var(--bg-elevated); font-size: 0.75rem; }
.af-event-date { font-size: 0.62rem; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; width: 72px; flex-shrink: 0; }
.af-event-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.af-dot-broken { background: var(--red); }
.af-dot-fixed { background: var(--green); }
.af-dot-rate_limited { background: var(--orange); }
.af-event-model { font-weight: 600; color: var(--accent); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.af-event-model:hover { text-decoration: underline; }
.af-event-type { font-weight: 600; white-space: nowrap; font-size: 0.7rem; }
.af-type-broken { color: var(--red); }
.af-type-fixed { color: var(--green); }
.af-type-rate_limited { color: var(--orange); }
.af-event-provider { font-size: 0.65rem; color: var(--text-muted); margin-left: auto; white-space: nowrap; }
@media (max-width: 768px) { .af-page { padding: 12px; } }
</style>
