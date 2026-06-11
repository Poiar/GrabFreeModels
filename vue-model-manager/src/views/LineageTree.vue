<template>
  <div class="lt-page">
    <div class="page-header">
      <h2>Lineage Tree</h2>
      <p>Family tree of fine-tuned models — derivation paths from foundation to fine-tunes</p>
    </div>
    <div v-if="store.loading" class="lt-empty"><p>Loading…</p></div>
    <div v-else-if="treeNodes.length === 0" class="lt-empty"><p>No lineage chains found.</p></div>
    <div v-else class="lt-tree-wrap">
      <svg :viewBox="'0 0 ' + svgW + ' ' + svgH" class="lt-svg">
        <line v-for="e in treeEdges" :key="e.key" :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2" class="lt-edge"/>
        <g v-for="n in treeNodes" :key="n.slug" :transform="'translate(' + n.x + ',' + n.y + ')'" class="lt-node-group" @click="goModel(n.slug)">
          <rect :x="-n.w/2" y="-12" :width="n.w" height="24" rx="4" class="lt-node-rect" :class="n.isRoot ? 'lt-root' : 'lt-derived'"/>
          <text x="0" y="3" text-anchor="middle" class="lt-node-text">{{ n.label }}</text>
          <title>{{ n.fullName }}</title>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useModelsStore } from '@/store/models';

const router = useRouter();
const store = useModelsStore();
interface TreeNode { slug: string; label: string; fullName: string; isRoot: boolean; x: number; y: number; w: number; }
interface TreeEdge { key: string; x1: number; y1: number; x2: number; y2: number; }

const treeNodes = computed((): TreeNode[] => {
  const result: TreeNode[] = [];
  const seen = new Set<string>();
  let col = 0;
  for (const model of store.allModels) {
    if (!model.base_model || seen.has(model.slug)) continue;
    seen.add(model.slug);
    let rootSlug: string = model.base_model;
    const visited = new Set([model.slug]);
    while (true) {
      const parent = store.modelBySlug.get(rootSlug);
      if (!parent?.base_model || visited.has(parent.base_model)) break;
      visited.add(parent.base_model);
      rootSlug = parent.base_model;
    }
    if (!seen.has(rootSlug)) {
      seen.add(rootSlug);
      const rm = store.modelBySlug.get(rootSlug);
      const rn = rm?.name || rootSlug;
      const rl = rn.length > 18 ? rn.slice(0, 16) + '…' : rn;
      result.push({ slug: rootSlug, label: rl, fullName: rn, isRoot: true, x: 40 + col * 210, y: 40, w: Math.min(rl.length * 7.5 + 14, 160) });
    }
    const ln = model.name.length > 18 ? model.name.slice(0, 16) + '…' : model.name;
    result.push({ slug: model.slug, label: ln, fullName: model.name, isRoot: false, x: 40 + col * 210, y: 95, w: Math.min(ln.length * 7.5 + 14, 160) });
    col++; if (col >= 4) col = 0;
  }
  return result;
});

const treeEdges = computed((): TreeEdge[] => {
  const result: TreeEdge[] = [];
  for (const model of store.allModels) {
    if (!model.base_model) continue;
    const child = treeNodes.value.find(n => n.slug === model.slug);
    const parent = treeNodes.value.find(n => n.slug === model.base_model);
    if (child && parent) result.push({ key: parent.slug, x1: parent.x, y1: parent.y + 12, x2: child.x, y2: child.y - 12 });
  }
  return result;
});

const svgW = computed(() => Math.max(900, ...treeNodes.value.map(n => n.x + 120), 0));
const svgH = computed(() => Math.max(500, ...treeNodes.value.map(n => n.y + 60), 0));
function goModel(slug: string) { router.push('/model/' + slug); }
</script>

<style scoped>
.lt-page { max-width: 1200px; margin: 0 auto; padding: 20px; }
.page-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.page-header p { font-size: 0.78rem; color: var(--text-muted); margin: 0 0 16px; }
.lt-empty { text-align: center; padding: 60px; color: var(--text-muted); font-size: 0.85rem; }
.lt-tree-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); }
.lt-svg { width: 100%; min-height: 500px; }
.lt-edge { stroke: var(--text-muted); stroke-width: 1; opacity: 0.2; }
.lt-node-group { cursor: pointer; }
.lt-node-rect { fill: var(--bg-elevated); stroke: var(--border); stroke-width: 1; }
.lt-node-rect.lt-root { fill: rgba(99,102,241,0.15); stroke: #6366f1; }
.lt-node-rect.lt-derived { fill: rgba(168,85,247,0.1); stroke: rgba(168,85,247,0.35); }
.lt-node-group:hover .lt-node-rect { filter: brightness(1.3); }
.lt-node-text { fill: var(--text); font-size: 9px; font-family: 'Inter', sans-serif; font-weight: 500; pointer-events: none; }
@media (max-width: 768px) { .lt-page { padding: 12px; } }
</style>
