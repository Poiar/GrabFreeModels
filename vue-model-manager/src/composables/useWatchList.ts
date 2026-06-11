import { ref, computed } from 'vue';
import type { ModelData } from '@/types';
import { useModelsStore } from '@/store/models';
import { useToast } from './useToast';

interface WatchedModel { super_id: number; slug: string; name: string; added_at: string; last_status: string | null; }

const STORAGE_KEY = 'gf_watch_list';

function loadWatchList(): WatchedModel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveWatchList(list: WatchedModel[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

export function useWatchList() {
  const store = useModelsStore();
  const { success: toastSuccess } = useToast();
  const items = ref<WatchedModel[]>(loadWatchList());

  const watched = computed(() => items.value);
  const watchedIds = computed(() => new Set(items.value.map(i => i.super_id)));

  function isWatched(superId: number): boolean { return watchedIds.value.has(superId); }

  function add(model: ModelData) {
    if (isWatched(model.super_id)) return;
    const entry: WatchedModel = { super_id: model.super_id, slug: model.slug, name: model.name, added_at: new Date().toISOString(), last_status: null };
    items.value.push(entry);
    saveWatchList(items.value);
    toastSuccess('Added "' + model.name + '" to watch list');
  }

  function remove(superId: number) {
    const idx = items.value.findIndex(i => i.super_id === superId);
    if (idx < 0) return;
    const name = items.value[idx].name;
    items.value.splice(idx, 1);
    saveWatchList(items.value);
    toastSuccess('Removed "' + name + '" from watch list');
  }

  function toggle(model: ModelData) {
    if (isWatched(model.super_id)) remove(model.super_id);
    else add(model);
  }

  // Compute status changes since last check
  const changes = computed(() => {
    const result: { model: ModelData; prev: string | null; curr: string }[] = [];
    const modelMap = new Map(store.allModels.map(m => [m.super_id, m]));
    for (const item of items.value) {
      const model = modelMap.get(item.super_id);
      if (!model) continue;
      const curr = model.providers.some(p => !p._removed && p.status.result === 'working') ? 'working'
        : model.providers.some(p => !p._removed && p.status.result === 'rate_limited') ? 'rate_limited' : 'broken';
      if (item.last_status && item.last_status !== curr) {
        result.push({ model, prev: item.last_status, curr });
      }
    }
    // Update last_status
    for (const item of items.value) {
      const model = modelMap.get(item.super_id);
      if (!model) continue;
      const curr = model.providers.some(p => !p._removed && p.status.result === 'working') ? 'working'
        : model.providers.some(p => !p._removed && p.status.result === 'rate_limited') ? 'rate_limited' : 'broken';
      item.last_status = curr;
    }
    if (result.length > 0) saveWatchList(items.value);
    return result;
  });

  return { items, watched, watchedIds, isWatched, add, remove, toggle, changes };
}
