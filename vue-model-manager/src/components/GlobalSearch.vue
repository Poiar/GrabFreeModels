<template>
  <Teleport to="body">
    <div v-if="open" class="gsc-backdrop" @click="close">
      <div class="gsc-modal" @click.stop>
        <input
          ref="inputEl"
          v-model="query"
          placeholder="Search models, creators, families, providers..."
          class="gsc-input"
          @keydown="onKeydown"
        />
        <div v-if="query.length >= 1" class="gsc-results">
          <template v-for="group in resultGroups" :key="group.label">
            <div class="gsc-group-label">{{ group.label }}</div>
            <div
              v-for="item in group.items"
              :key="item.id"
              class="gsc-item"
              :class="{ 'gsc-item-active': activeIndex === item.flatIndex }"
              @click="select(item)"
              @mouseenter="activeIndex = item.flatIndex"
            >
              <div class="gsc-item-main">
                <span class="gsc-item-name">{{ item.name }}</span>
                <span class="gsc-item-meta">{{ item.meta }}</span>
              </div>
              <span class="gsc-item-type">{{ item.typeLabel }}</span>
            </div>
          </template>
          <div v-if="totalCount === 0" class="gsc-empty">No results for "{{ query }}"</div>
        </div>
        <div class="gsc-footer">
          <kbd>↑↓</kbd> navigate <kbd>↵</kbd> select <kbd>esc</kbd> close
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useModelsStore } from '@/store/models';

interface SearchItem {
  id: string;
  name: string;
  meta: string;
  route: string;
  typeLabel: string;
  category: string;
  flatIndex: number;
}

const router = useRouter();
const store = useModelsStore();
const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

function close() {
  open.value = false;
  query.value = '';
  activeIndex.value = 0;
}

const flatItems = computed<SearchItem[]>(() => {
  const items: SearchItem[] = [];
  const q = query.value.toLowerCase().trim();
  if (!q) return items;

  function match(text: string): boolean {
    return text.toLowerCase().includes(q);
  }

  // Models
  for (const creator of store.creators) {
    for (const model of creator.models) {
      if (match(model.name) || match(model.slug) || match(creator.name)) {
        items.push({
          id: `model:${model.super_id}`,
          name: model.name,
          meta: creator.name,
          route: `/supermodels`,
          typeLabel: 'Model',
          category: 'Models',
          flatIndex: 0,
        });
      }
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  const modelItems = items.splice(0, 5);

  // Creators
  const creatorItems: SearchItem[] = [];
  for (const c of store.creators) {
    if (match(c.name) || match(c.id)) {
      creatorItems.push({
        id: `creator:${c.id}`,
        name: c.name,
        meta: `${c.model_count} models`,
        route: `/creator/${c.id}`,
        typeLabel: 'Creator',
        category: 'Creators',
        flatIndex: 0,
      });
    }
  }
  creatorItems.sort((a, b) => a.name.localeCompare(b.name));

  // Derivatives
  const derivItems: SearchItem[] = [];
  for (const c of store.creators) {
    if (!c.models.some((m) => m.base_model && m.base_model !== m.slug)) continue;
    if (match(c.name) || match(c.id)) {
      derivItems.push({
        id: `derivative:${c.id}`,
        name: c.name,
        meta: `${c.model_count} derivatives`,
        route: `/derivative/${c.id}`,
        typeLabel: 'Derivative',
        category: 'Derivatives',
        flatIndex: 0,
      });
    }
  }
  derivItems.sort((a, b) => a.name.localeCompare(b.name));

  // Families
  const familyItems: SearchItem[] = [];
  for (const f of store.visibleFamilies) {
    if (match(f.name)) {
      familyItems.push({
        id: `family:${f.name}`,
        name: f.name,
        meta: `${f.model_count} models`,
        route: `/family/${encodeURIComponent(f.name)}`,
        typeLabel: 'Family',
        category: 'Families',
        flatIndex: 0,
      });
    }
  }
  familyItems.sort((a, b) => a.name.localeCompare(b.name));

  // Providers
  const providerItems: SearchItem[] = [];
  for (const p of store.providerRefs) {
    if (match(p.name) || match(p.slug)) {
      providerItems.push({
        id: `provider:${p.slug}`,
        name: p.name,
        meta: `${p.model_count} models`,
        route: `/provider/${p.slug}`,
        typeLabel: 'Provider',
        category: 'Providers',
        flatIndex: 0,
      });
    }
  }
  providerItems.sort((a, b) => a.name.localeCompare(b.name));

  // Assemble with category limits
  const all = [
    ...modelItems.slice(0, 5),
    ...creatorItems.slice(0, 5),
    ...derivItems.slice(0, 5),
    ...familyItems.slice(0, 5),
    ...providerItems.slice(0, 5),
  ];
  all.forEach((item, i) => (item.flatIndex = i));
  return all;
});

const resultGroups = computed(() => {
  const groups: Record<string, SearchItem[]> = {};
  for (const item of flatItems.value) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  return Object.entries(groups).map(([label, items]) => ({ label, items }));
});

const totalCount = computed(() => flatItems.value.length);

function select(item: SearchItem) {
  router.push(item.route);
  close();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % Math.max(flatItems.value.length, 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value =
      (activeIndex.value - 1 + flatItems.value.length) % Math.max(flatItems.value.length, 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = flatItems.value[activeIndex.value];
    if (item) select(item);
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    open.value = !open.value;
    if (open.value) nextTick(() => inputEl.value?.focus());
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown));
</script>

<style scoped>
.gsc-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  justify-content: center;
}
.gsc-modal {
  width: 560px;
  max-width: 90vw;
  margin-top: 15vh;
  align-self: flex-start;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.gsc-input {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--border);
  font-size: 1.05rem;
  padding: 16px 20px;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}
.gsc-input::placeholder {
  color: var(--text-muted);
}
.gsc-results {
  max-height: 380px;
  overflow-y: auto;
}
.gsc-group-label {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 10px 20px 4px;
  font-weight: 700;
}
.gsc-item {
  padding: 9px 20px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-left: 3px solid transparent;
  transition:
    background 0.08s,
    border-color 0.08s;
}
.gsc-item-active {
  background: var(--bg-elevated);
  border-left-color: var(--accent);
}
.gsc-item-main {
  min-width: 0;
}
.gsc-item-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gsc-item-meta {
  font-size: 0.7rem;
  color: var(--text-muted);
  display: block;
  margin-top: 1px;
}
.gsc-item-type {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: 12px;
}
.gsc-empty {
  text-align: center;
  padding: 32px 20px;
  color: var(--text-muted);
  font-size: 0.85rem;
}
.gsc-footer {
  padding: 8px 20px;
  border-top: 1px solid var(--border);
  font-size: 0.62rem;
  color: var(--text-muted);
  display: flex;
  gap: 12px;
  align-items: center;
}
kbd {
  font-size: 0.6rem;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--border);
  font-family: monospace;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}
</style>
