<template>
  <div class="lt-page">
    <div class="page-header">
      <h2>Lineage Tree</h2>
      <p>Family tree of fine-tuned models — derivation paths from foundation to fine-tunes</p>
      <div class="lt-toolbar">
        <div class="lt-search-wrap">
          <span class="lt-search-icon">&#x1F50D;</span>
          <input
            v-model="search"
            placeholder="Search models…"
            class="lt-search"
            @input="onSearch"
          />
          <button v-if="search" class="lt-search-clear" @click="clearSearch">&#x00D7;</button>
        </div>
        <span class="lt-stats"
          >{{ forestRoots.length }} trees · {{ allTreeNodes.length }} nodes</span
        >
        <div class="lt-zoom-group">
          <button @click="zoomOut" class="lt-btn" title="Zoom out">-</button>
          <span class="lt-zoom-pct">{{ Math.round(zoom * 100) }}%</span>
          <button @click="zoomIn" class="lt-btn" title="Zoom in">+</button>
          <button @click="resetView" class="lt-btn lt-btn-reset" title="Reset view">Reset</button>
        </div>
      </div>
    </div>

    <div v-if="store.loading" class="lt-empty"><p>Loading model data…</p></div>
    <div v-else-if="forestRoots.length === 0" class="lt-empty">
      <p>No lineage chains found.</p>
      <p class="lt-empty-hint">Lineage requires models with base_model links.</p>
    </div>
    <div
      v-else
      class="lt-svg-wrap"
      ref="wrapRef"
      @wheel.prevent="onWheel"
      @mousedown="startPan"
      @mousemove="doPan"
      @mouseup="endPan"
      @mouseleave="endPan"
    >
      <svg :viewBox="'0 0 ' + svgW + ' ' + svgH" class="lt-svg">
        <g :transform="'translate(' + panX + ',' + panY + ') scale(' + zoom + ')'">
          <g class="lt-edges">
            <path
              v-for="e in allEdges"
              :key="e.key"
              :d="edgePath(e)"
              class="lt-edge"
              :class="{
                'lt-edge-highlight': e.highlighted,
                'lt-edge-dim': highlightActive && !e.highlighted,
                'lt-edge-confident': !e.highlighted && confidence(e.derivationSource) === 'high',
                'lt-edge-weak': !e.highlighted && confidence(e.derivationSource) === 'low',
              }"
            />
          </g>
          <g
            v-for="n in allTreeNodes"
            :key="n.slug"
            :transform="'translate(' + n.x + ',' + n.y + ')'"
            class="lt-node-group"
            :class="{
              'lt-match': n.matches,
              'lt-dim': highlightActive && !n.matches && !n.onMatchPath,
              'lt-on-path': n.onMatchPath && !n.matches,
            }"
            @click.stop="goModel(n.slug)"
            @mouseenter="hoveredNodeId = n.slug"
            @mouseleave="hoveredNodeId = null"
          >
            <rect
              :x="-n.w / 2 - 4"
              :y="-n.h / 2 - 4"
              :width="n.w + 8"
              :height="n.h + 8"
              rx="8"
              class="lt-node-glow"
              :class="{ visible: hoveredNodeId === n.slug }"
            />
            <rect
              :x="-n.w / 2"
              :y="-n.h / 2"
              :width="n.w"
              :height="n.h"
              rx="6"
              class="lt-node-rect"
              :class="n.cssClass"
            />
            <line
              v-if="n.hasExternalParent"
              :x1="-n.w / 2 + 6"
              :y1="-n.h / 2"
              :x2="n.w / 2 - 6"
              :y2="-n.h / 2"
              class="lt-external-marker"
            />
            <text
              x="0"
              y="1"
              text-anchor="middle"
              class="lt-node-text"
              :class="{ 'lt-text-highlight': n.matches }"
            >
              {{ n.label }}
            </text>
            <g
              v-if="n.childCount > 0 && n.childCount <= 9"
              :transform="'translate(' + (n.w / 2 + 8) + ',0)'"
            >
              <circle r="8" class="lt-badge-circle" />
              <text y="1" text-anchor="middle" class="lt-badge-text">{{ n.childCount }}</text>
            </g>
            <g v-else-if="n.childCount > 9" :transform="'translate(' + (n.w / 2 + 10) + ',0)'">
              <rect x="-10" y="-7" width="20" height="14" rx="7" class="lt-badge-circle" />
              <text y="1" text-anchor="middle" class="lt-badge-text">{{ n.childCount }}</text>
            </g>
            <title>
              {{
                n.fullName +
                ' | depth:' +
                n.depth +
                ' children:' +
                n.childCount +
                (n.creator ? ' by ' + n.creator : '')
              }}
            </title>
          </g>
        </g>
      </svg>
      <div
        v-if="tooltipNode"
        class="lt-tooltip"
        :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
      >
        <div class="lt-tt-name">{{ tooltipNode.fullName }}</div>
        <div class="lt-tt-rows">
          <div class="lt-tt-row">
            <span>Depth</span><span>{{ tooltipNode.depth }}</span>
          </div>
          <div class="lt-tt-row">
            <span>Children</span><span>{{ tooltipNode.childCount }}</span>
          </div>
          <div v-if="tooltipNode.creator" class="lt-tt-row">
            <span>Creator</span><span>{{ tooltipNode.creator }}</span>
          </div>
          <div v-if="tooltipNode.family" class="lt-tt-row">
            <span>Family</span><span>{{ tooltipNode.family }}</span>
          </div>
          <div v-if="tooltipNode.derivationSource" class="lt-tt-row">
            <span>Edge</span><span>{{ sourceLabel(tooltipNode.derivationSource) }}</span>
          </div>
          <div v-if="tooltipNode.hasExternalParent" class="lt-tt-row">
            <span>Parent</span><span>external</span>
          </div>
        </div>
        <div class="lt-tt-click">Click to open detail</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useModelsStore } from '@/store/models';
import type { ModelData } from '@/types';

const router = useRouter();
const store = useModelsStore();

// ── Constants ──
const H_GAP = 220;
const V_GAP = 48;
const TREE_PAD = 80;
const NODE_H = 36;
const NODE_PAD_X = 18;
const CHAR_W = 7.8;

// ── Search state ──
const search = ref('');
const highlightActive = computed(() => search.value.trim().length > 0);
const matchSlugs = ref(new Set<string>());
const matchPathSlugs = ref(new Set<string>());

// ── Zoom / pan state ──
const zoom = ref(1);
const panX = ref(40);
const panY = ref(40);
const panning = ref(false);
const panStartX = ref(0);
const panStartY = ref(0);
const panStartPX = ref(0);
const panStartPY = ref(0);

// ── Tooltip state ──
const hoveredNodeId = ref<string | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);
const wrapRef = ref<HTMLElement | null>(null);
const wrapW = ref(1100);
const wrapH = ref(700);

// ── Types ──
interface LayoutNode {
  slug: string;
  label: string;
  fullName: string;
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
  childCount: number;
  creator: string | null;
  family: string | null;
  derivationSource: string | null;
  hasExternalParent: boolean;
  isRoot: boolean;
  isLeaf: boolean;
  cssClass: string;
  matches: boolean;
  onMatchPath: boolean;
}

interface LayoutEdge {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  highlighted: boolean;
  derivationSource: string | null;
}

interface ForestEdge {
  from: string;
  to: string;
}

// ── Forest builder ──
const forestData = computed(() => {
  const slugToModel = new Map<string, ModelData>();
  for (const m of store.allModels) slugToModel.set(m.slug, m);

  const allSlugs = new Set(slugToModel.keys());

  const childrenOf = new Map<string, string[]>();
  const hasParentInDB = new Set<string>();

  for (const m of store.allModels) {
    const parent = m.base_model;
    if (!parent) continue;
    if (allSlugs.has(parent)) {
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(m.slug);
      hasParentInDB.add(m.slug);
    }
  }

  for (const [, kids] of childrenOf) {
    kids.sort((a, b) =>
      (slugToModel.get(a)?.name || a).localeCompare(slugToModel.get(b)?.name || b),
    );
  }

  const rootSlugs: string[] = [];
  const seenAsRoot = new Set<string>();

  for (const m of store.allModels) {
    const hasKids = childrenOf.has(m.slug) && childrenOf.get(m.slug)!.length > 0;
    const hasParent = hasParentInDB.has(m.slug);
    if (hasKids && !hasParent && !seenAsRoot.has(m.slug)) {
      rootSlugs.push(m.slug);
      seenAsRoot.add(m.slug);
    }
  }

  for (const m of store.allModels) {
    if (seenAsRoot.has(m.slug)) continue;
    if (!m.base_model || allSlugs.has(m.base_model)) continue;
    if (childrenOf.has(m.slug) || hasParentInDB.has(m.slug)) {
      rootSlugs.push(m.slug);
      seenAsRoot.add(m.slug);
    }
  }

  rootSlugs.sort((a, b) =>
    (slugToModel.get(a)?.name || a).localeCompare(slugToModel.get(b)?.name || b),
  );

  const laidOut = new Map<string, LayoutNode>();
  const edgeList: ForestEdge[] = [];
  let nextTreeY = 0;

  function makeNode(
    model: ModelData,
    label: string,
    fullName: string,
    depth: number,
    y: number,
    w: number,
    childCount: number,
    isRoot: boolean,
    isLeaf: boolean,
  ): LayoutNode {
    const hasExternalParent = !!model.base_model && !allSlugs.has(model.base_model);
    let cssClass = '';
    if (isRoot && hasExternalParent) cssClass = 'lt-root-external';
    else if (isRoot) cssClass = 'lt-root';
    else if (isLeaf) cssClass = 'lt-leaf';
    else cssClass = 'lt-branch';

    return {
      slug: model.slug,
      label,
      fullName,
      depth,
      x: depth * H_GAP,
      y,
      w,
      h: NODE_H,
      childCount,
      creator: model.creator,
      family: model.family,
      derivationSource: model.derivation_source || null,
      hasExternalParent,
      isRoot,
      isLeaf,
      cssClass,
      matches: false,
      onMatchPath: false,
    };
  }

  function layoutSubtree(
    slug: string,
    depth: number,
    startY: number,
    visited: Set<string>,
  ): number {
    if (visited.has(slug)) return V_GAP;
    visited.add(slug);

    const model = slugToModel.get(slug);
    if (!model) return V_GAP;

    const name = model.name || slug;
    const label = name.length > 22 ? name.slice(0, 20) + '…' : name;
    const w = Math.min(label.length * CHAR_W + NODE_PAD_X * 2, 200);

    const kids = childrenOf.get(slug) || [];
    const childCount = kids.length;

    if (childCount === 0) {
      const y = startY + V_GAP / 2;
      laidOut.set(slug, makeNode(model, label, name, depth, y, w, childCount, false, true));
      return V_GAP;
    }

    let currentY = startY;
    for (const childSlug of kids) {
      const h = layoutSubtree(childSlug, depth + 1, currentY, visited);
      edgeList.push({ from: slug, to: childSlug });
      currentY += h;
    }

    const totalHeight = currentY - startY;
    const y = startY + totalHeight / 2;
    const isRoot = depth === 0 || (!!model.base_model && !slugToModel.has(model.base_model));
    laidOut.set(slug, makeNode(model, label, name, depth, y, w, childCount, isRoot, false));
    return totalHeight;
  }

  for (const rootSlug of rootSlugs) {
    const visited = new Set<string>();
    const treeHeight = layoutSubtree(rootSlug, 0, 0, visited);
    for (const slug of visited) {
      const n = laidOut.get(slug);
      if (n) n.y += nextTreeY;
    }
    nextTreeY += treeHeight + TREE_PAD;
  }

  return { roots: rootSlugs, nodeMap: laidOut, edges: edgeList };
});

const forestRoots = computed(() => forestData.value.roots);
const forestNodeMap = computed(() => forestData.value.nodeMap);
const forestEdgesRef = computed(() => forestData.value.edges);

const allTreeNodes = computed((): LayoutNode[] => {
  const nodes = [...forestNodeMap.value.values()];
  for (const n of nodes) {
    n.matches = matchSlugs.value.has(n.slug);
    n.onMatchPath = !n.matches && matchPathSlugs.value.has(n.slug);
  }
  return nodes;
});

// ── Edge confidence ──
const HIGH_CONFIDENCE = new Set(['hf_card', 'hf_tag', 'crfm', 'version_chain']);
const LOW_CONFIDENCE = new Set(['name_heuristic']);
function confidence(src: string | null): 'high' | 'medium' | 'low' {
  if (!src) return 'medium';
  if (HIGH_CONFIDENCE.has(src)) return 'high';
  if (LOW_CONFIDENCE.has(src)) return 'low';
  return 'medium';
}

function sourceLabel(src: string | null): string {
  if (!src) return 'unknown';
  const labels: Record<string, string> = {
    hf_card: 'HF card',
    hf_tag: 'HF tag',
    crfm: 'Stanford CRFM',
    fastchat: 'LMSYS FastChat',
    openrouter_desc: 'OpenRouter desc',
    version_chain: 'version chain',
    creator_match: 'creator match',
    sync_ingest: 'sync ingest',
    name_heuristic: 'name heuristic',
  };
  return labels[src] || src;
}

const allEdges = computed((): LayoutEdge[] => {
  // Force re-compute when search state changes (mutates node.match fields)
  const _trigger = matchSlugs.value.size + matchPathSlugs.value.size;
  void _trigger;
  return forestEdgesRef.value.map((e) => {
    const from = forestNodeMap.value.get(e.from);
    const to = forestNodeMap.value.get(e.to);
    const highlighted = !!(from?.matches || to?.matches);
    return {
      key: e.from + '->' + e.to,
      x1: from?.x ?? 0,
      y1: from?.y ?? 0,
      x2: to?.x ?? 0,
      y2: to?.y ?? 0,
      highlighted,
      derivationSource: to?.derivationSource || null,
    };
  });
});

const svgW = computed(() => {
  let maxX = 900;
  for (const n of forestNodeMap.value.values()) maxX = Math.max(maxX, n.x + 150);
  return maxX + 40;
});

const svgH = computed(() => {
  // Match container aspect ratio exactly — 1 SVG unit = 1 CSS px at zoom 1.0
  // Trees below the fold are reached by panning
  return wrapH.value > 0 ? svgW.value * (wrapH.value / wrapW.value) : 800;
});

function edgePath(e: LayoutEdge): string {
  const midX = (e.x1 + e.x2) / 2;
  const parentNode = forestNodeMap.value.get(e.key.split('->')[0]);
  const childNode = forestNodeMap.value.get(e.key.split('->')[1]);
  const sx = e.x1 + (parentNode?.w ?? 100) / 2;
  const ex = e.x2 - (childNode?.w ?? 100) / 2;
  return (
    'M' +
    sx +
    ',' +
    e.y1 +
    ' C' +
    midX +
    ',' +
    e.y1 +
    ' ' +
    midX +
    ',' +
    e.y2 +
    ' ' +
    ex +
    ',' +
    e.y2
  );
}

// ── Tooltip ──
const tooltipNode = computed(() => {
  if (!hoveredNodeId.value) return null;
  return forestNodeMap.value.get(hoveredNodeId.value) || null;
});

function onMouseMoveForTooltip(e: MouseEvent) {
  tooltipX.value = e.clientX + 16;
  tooltipY.value = e.clientY - 8;
}

let resizeObs: ResizeObserver | null = null;
onMounted(() => {
  window.addEventListener('mousemove', onMouseMoveForTooltip);
  if (wrapRef.value) {
    wrapW.value = wrapRef.value.clientWidth;
    wrapH.value = wrapRef.value.clientHeight;
    resizeObs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0) {
        wrapW.value = width;
        wrapH.value = height;
      }
    });
    resizeObs.observe(wrapRef.value);
  }
});
onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMoveForTooltip);
  resizeObs?.disconnect();
});

// ── Search ──
function clearSearch() {
  search.value = '';
  onSearch();
}

function onSearch() {
  const q = search.value.trim().toLowerCase();
  if (!q) {
    matchSlugs.value = new Set();
    matchPathSlugs.value = new Set();
    return;
  }

  const matched = new Set<string>();
  for (const [slug, node] of forestNodeMap.value) {
    if (node.fullName.toLowerCase().includes(q) || slug.toLowerCase().includes(q)) {
      matched.add(slug);
    }
  }

  const pathSlugs = new Set<string>();
  for (const slug of matched) {
    let current = slug;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      if (!matched.has(current)) pathSlugs.add(current);
      const parentEdge = forestEdgesRef.value.find((pe) => pe.to === current);
      current = parentEdge?.from || '';
    }
  }

  matchSlugs.value = matched;
  matchPathSlugs.value = pathSlugs;

  if (matched.size > 0) {
    const firstMatch = [...matched][0];
    const node = forestNodeMap.value.get(firstMatch);
    if (node) panToNode(node);
  }
}

function panToNode(node: LayoutNode) {
  const wrap = wrapRef.value;
  if (!wrap) return;
  panX.value = wrap.clientWidth / 2 - node.x * zoom.value;
  panY.value = wrap.clientHeight / 2 - node.y * zoom.value;
}

// ── Zoom ──
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 10;
const ZOOM_STEP = 0.15;

function zoomIn() {
  zoom.value = Math.min(MAX_ZOOM, zoom.value + ZOOM_STEP);
}
function zoomOut() {
  zoom.value = Math.max(MIN_ZOOM, zoom.value - ZOOM_STEP);
}
function resetView() {
  zoom.value = 1;
  panX.value = 40;
  panY.value = 40;
}

function onWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom.value + delta));
  const wrap = wrapRef.value;
  if (wrap) {
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scale = newZoom / zoom.value;
    panX.value = mx - scale * (mx - panX.value);
    panY.value = my - scale * (my - panY.value);
  }
  zoom.value = newZoom;
}

// ── Pan ──
function startPan(e: MouseEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
  panning.value = true;
  panStartX.value = e.clientX;
  panStartY.value = e.clientY;
  panStartPX.value = panX.value;
  panStartPY.value = panY.value;
}
function doPan(e: MouseEvent) {
  if (!panning.value) return;
  panX.value = panStartPX.value + (e.clientX - panStartX.value);
  panY.value = panStartPY.value + (e.clientY - panStartY.value);
}
function endPan() {
  panning.value = false;
}

function goModel(slug: string) {
  router.push('/model/' + slug);
}
</script>

<style scoped>
/* layout */
.lt-page {
  max-width: 100%;
  margin: 0 auto;
  padding: 20px 24px;
  height: calc(100vh - 52px);
  display: flex;
  flex-direction: column;
}
.page-header {
  flex-shrink: 0;
  margin-bottom: 12px;
}
.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0 0 2px;
  color: var(--text);
}
.page-header > p {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0 0 10px;
}

/* toolbar */
.lt-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.lt-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.lt-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
  font-size: 0.75rem;
}
.lt-search {
  width: 220px;
  font-size: 0.78rem;
  padding: 7px 28px 7px 30px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
  transition: border-color 0.2s;
}
.lt-search:focus {
  border-color: var(--accent, #6366f1);
}
.lt-search-clear {
  position: absolute;
  right: 4px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1rem;
  padding: 2px 6px;
  line-height: 1;
}
.lt-search-clear:hover {
  color: var(--text);
}
.lt-stats {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.lt-zoom-group {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.lt-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  font-size: 0.85rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.lt-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--accent, #6366f1);
}
.lt-btn-reset {
  width: auto;
  padding: 0 10px;
  font-size: 0.72rem;
  margin-left: 4px;
}
.lt-zoom-pct {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  text-align: center;
}

/* empty */
.lt-empty {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-muted);
  font-size: 0.85rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.lt-empty-hint {
  font-size: 0.72rem;
  margin-top: 4px;
  opacity: 0.7;
}

/* svg */
.lt-svg-wrap {
  flex: 1;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-card);
  cursor: grab;
  position: relative;
}
.lt-svg-wrap:active {
  cursor: grabbing;
}
.lt-svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* edges */
.lt-edge {
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1.5;
  opacity: 0.18;
  stroke-linecap: round;
  transition:
    opacity 0.2s,
    stroke 0.2s;
}
.lt-edge-highlight {
  stroke: var(--accent, #6366f1);
  opacity: 0.6;
  stroke-width: 2;
}
.lt-edge-dim {
  opacity: 0.05;
}
/* Confidence-based edge styling */
.lt-edge-confident {
  opacity: 0.28;
  stroke-width: 1.8;
}
.lt-edge-weak {
  opacity: 0.08;
  stroke-dasharray: 4 3;
}

/* nodes */
.lt-node-group {
  cursor: pointer;
  transition: opacity 0.2s;
}
.lt-node-group.lt-dim {
  opacity: 0.2;
}
.lt-node-group.lt-on-path {
  opacity: 0.55;
}
.lt-node-glow {
  fill: none;
  stroke: transparent;
  stroke-width: 2;
  transition: stroke 0.2s;
}
.lt-node-glow.visible {
  stroke: var(--accent, #6366f1);
}
.lt-node-rect {
  fill: var(--bg-elevated);
  stroke: var(--border);
  stroke-width: 1;
  transition:
    fill 0.15s,
    stroke 0.15s,
    filter 0.15s;
}
.lt-node-rect.lt-root {
  fill: rgba(99, 102, 241, 0.12);
  stroke: rgba(99, 102, 241, 0.45);
}
.lt-node-rect.lt-root-external {
  fill: rgba(99, 102, 241, 0.08);
  stroke: rgba(99, 102, 241, 0.3);
  stroke-dasharray: 4 2;
}
.lt-node-rect.lt-branch {
  fill: rgba(168, 85, 247, 0.08);
  stroke: rgba(168, 85, 247, 0.3);
}
.lt-node-rect.lt-leaf {
  fill: var(--bg-elevated);
  stroke: var(--border);
}
.lt-match .lt-node-rect {
  fill: rgba(250, 176, 5, 0.18) !important;
  stroke: rgba(250, 176, 5, 0.7) !important;
  stroke-width: 1.8 !important;
}
.lt-node-group:hover .lt-node-rect {
  filter: brightness(1.25);
  stroke-width: 1.3;
}
.lt-match.lt-node-group:hover .lt-node-rect {
  filter: brightness(1.2);
}
.lt-external-marker {
  stroke: var(--text-muted);
  stroke-width: 1;
  stroke-dasharray: 2 2;
  opacity: 0.4;
}

/* text */
.lt-node-text {
  fill: var(--text);
  font-size: 12px;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  font-weight: 500;
  pointer-events: none;
  dominant-baseline: central;
  user-select: none;
}
.lt-text-highlight {
  fill: #b45309;
  font-weight: 600;
}

/* badge */
.lt-badge-circle {
  fill: var(--bg-elevated);
  stroke: var(--border);
  stroke-width: 0.8;
}
.lt-badge-text {
  fill: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  dominant-baseline: central;
  pointer-events: none;
}

/* tooltip */
.lt-tooltip {
  position: fixed;
  z-index: 9999;
  background: var(--bg-card, #1e1e2e);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 14px;
  pointer-events: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  max-width: 260px;
}
.lt-tt-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
  word-break: break-word;
  line-height: 1.3;
}
.lt-tt-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lt-tt-row {
  font-size: 0.68rem;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.lt-tt-row span:last-child {
  color: var(--text);
  font-weight: 500;
  text-align: right;
}
.lt-tt-click {
  font-size: 0.62rem;
  color: var(--accent, #6366f1);
  margin-top: 6px;
  font-style: italic;
}

/* responsive */
@media (max-width: 768px) {
  .lt-page {
    padding: 10px 8px;
  }
  .lt-toolbar {
    gap: 6px;
  }
  .lt-search {
    width: 150px;
    font-size: 0.72rem;
  }
  .lt-stats {
    font-size: 0.65rem;
  }
  .lt-zoom-group {
    gap: 2px;
  }
  .lt-btn {
    width: 24px;
    height: 24px;
    font-size: 0.75rem;
  }
}
</style>
