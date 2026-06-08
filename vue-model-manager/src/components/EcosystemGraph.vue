<template>
  <div
    class="ecosystem-graph"
    ref="containerRef"
    @mousemove="onMouseMove"
    @mouseleave="hovered = null"
    @click="onClick"
  >
    <canvas ref="canvasRef" class="eco-canvas"></canvas>
    <div v-if="hovered && hoveredType === 'star'" class="eco-tooltip" :style="tooltipStyle">
      <span class="eco-tt-name">{{ (hovered as ProviderStar).name }}</span>
      <span class="eco-tt-count">{{ (hovered as ProviderStar).workingCount }}/{{ (hovered as ProviderStar).totalCount }} working</span>
    </div>
    <div v-if="hovered && hoveredType === 'moon'" class="eco-tooltip" :style="tooltipStyle">
      <span class="eco-tt-name">{{ (hovered as ModelMoon).name }}</span>
      <span class="eco-tt-count">{{ (hovered as ModelMoon).parentSlug }}</span>
    </div>
    <div class="eco-overlay">
      <span class="eco-label">Model Ecosystem</span>
      <span class="eco-sub">{{ nodeCount }} models across {{ providerCount }} providers</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useModelsStore } from '@/store/models';
import type { ModelData } from '@/types';

const store = useModelsStore();

interface ProviderStar {
  id: string;
  slug: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  workingCount: number;
  totalCount: number;
  healthRatio: number;
}

interface ModelMoon {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  status: 'working' | 'broken' | 'rate_limited' | 'untested' | 'down';
  parentSlug: string;
  orbitRadius: number;
}

interface ConnectionArc {
  fromSlug: string;
  toSlug: string;
  modelName: string;
}

const containerRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const selectedStar = ref<string | null>(null);
const hovered = ref<ProviderStar | ModelMoon | null>(null);
const hoveredType = ref<'star' | 'moon' | null>(null);
const tooltipStyle = ref({ left: '0px', top: '0px' });
const mouseX = ref(0);
const mouseY = ref(0);

let animId = 0;
let stars: ProviderStar[] = [];
let moons: ModelMoon[] = [];
let arcs: ConnectionArc[] = [];
let width = 0;
let height = 0;
let reducedMotion = false;
let frozen = false;
let tickCount = 0;
let unfreezeUntil = 0;
const EQUILIBRIUM_ENERGY = 0.3;
const MAX_SETTLE_TICKS = 400;
const HOVER_UNFREEZE_TICKS = 90;

function hashFromId(id: number, offset: number): number {
  return ((id * 2654435761 + offset * 7919) % 10000) / 10000;
}

const nodeCount = computed(() => store.allModels.length);
const providerCount = computed(() => store.providerRefs.length);

const statusColor: Record<string, string> = {
  working: '#34d399',
  broken: '#f87171',
  rate_limited: '#fbbf24',
  untested: '#8b95a8',
  down: '#4d5668',
};

const statusGlow: Record<string, string> = {
  working: 'rgba(52,211,153,0.3)',
  broken: 'rgba(248,113,113,0.25)',
  rate_limited: 'rgba(251,191,36,0.25)',
  untested: 'rgba(139,149,168,0.15)',
  down: 'rgba(77,86,104,0.10)',
};

function getModelStatus(model: ModelData): ModelMoon['status'] {
  const active = model.providers.filter((p) => !p._removed);
  if (!active.length) return 'down';
  const working = active.filter((p) => p.status.result === 'working').length;
  if (working === active.length) return 'working';
  if (working > 0) return 'rate_limited';
  const broken = active.filter((p) => p.status.result === 'broken').length;
  if (broken === active.length) return 'broken';
  return 'untested';
}

function getPrimaryProvider(model: ModelData): string {
  const active = model.providers.filter((p) => !p._removed);
  if (!active.length) return '';
  const working = active.filter((p) => p.status.result === 'working');
  if (working.length) return working[0].provider_slug;
  return active[0].provider_slug;
}

function getProviderSlugsForModel(model: ModelData): string[] {
  return model.providers
    .filter((p) => !p._removed)
    .map((p) => p.provider_slug);
}

function buildLayout() {
  const models = store.allModels
    .filter(m => m.providers.some(p => !p._removed))
    .slice(0, 220);
  const provs = store.providerRefs.filter((p) => p.model_count > 0);

  if (!provs.length || !width || !height) return;

  const cx = width / 2;
  const cy = height / 2;
  const layoutRadius = Math.min(width, height) * 0.35;

  // Position provider stars in a circle - healthiest providers at the top
  stars = provs
    .sort((a, b) => {
      const aRatio = a.model_count > 0 ? a.working_count / a.model_count : 0;
      const bRatio = b.model_count > 0 ? b.working_count / b.model_count : 0;
      return bRatio - aRatio;
    })
    .map((prov, i) => {
      const angle = (i / provs.length) * Math.PI * 2 - Math.PI / 2;
      const r = Math.max(8, Math.min(22, 8 + prov.working_count * 0.6));
      return {
        id: prov.id,
        slug: prov.slug,
        name: prov.name,
        x: cx + Math.cos(angle) * layoutRadius,
        y: cy + Math.sin(angle) * layoutRadius,
        radius: r,
        workingCount: prov.working_count,
        totalCount: prov.model_count,
        healthRatio: prov.model_count > 0 ? prov.working_count / prov.model_count : 0,
      };
    });

  const starBySlug = new Map(stars.map((s) => [s.slug, s]));

  // Assign models as moons to their primary provider (deterministic positions)
  moons = [];
  const usedNames = new Set<string>();
  const statusPriority: Record<string, number> = { working: 0, rate_limited: 1, untested: 2, broken: 3, down: 4 };
  const sortedModels = [...models].sort((a, b) => {
    const pa = statusPriority[getModelStatus(a)] ?? 99;
    const pb = statusPriority[getModelStatus(b)] ?? 99;
    return pa - pb;
  });
  for (const model of sortedModels) {
    if (usedNames.has(model.name)) continue;
    usedNames.add(model.name);
    const parentSlug = getPrimaryProvider(model);
    const star = starBySlug.get(parentSlug);
    if (!star) continue;
    const ctxLen = model.best_context ?? 8192;
    const moonR = Math.max(2.5, Math.min(8, Math.log2(ctxLen) * 0.8));
    const angle = hashFromId(model.super_id, 0) * Math.PI * 2;
    const orbitR = star.radius + 14 + Math.min(50, Math.log2(ctxLen || 8192) * 3);
    moons.push({
      id: String(model.super_id),
      name: model.name,
      x: star.x + Math.cos(angle) * orbitR,
      y: star.y + Math.sin(angle) * orbitR,
      vx: 0,
      vy: 0,
      radius: moonR,
      status: getModelStatus(model),
      parentSlug,
      orbitRadius: orbitR,
    });
  }

  // Build shared-model arcs: connect providers that host the same model
  const arcMap = new Map<string, ConnectionArc>();
  for (const model of models) {
    const slugs = getProviderSlugsForModel(model);
    for (let i = 0; i < slugs.length; i++) {
      for (let j = i + 1; j < slugs.length; j++) {
        const aSlug = slugs[i] < slugs[j] ? slugs[i] : slugs[j];
        const bSlug = slugs[i] < slugs[j] ? slugs[j] : slugs[i];
        const key = `${aSlug}|||${bSlug}`;
        if (!arcMap.has(key)) {
          arcMap.set(key, { fromSlug: aSlug, toSlug: bSlug, modelName: model.name });
        }
      }
    }
  }
  arcs = [...arcMap.values()];
}

function tick() {
  const ctx = canvasRef.value?.getContext('2d');
  if (!ctx || !width || !height) return;

  const starBySlug = new Map(stars.map((s) => [s.slug, s]));
  const selectedSlug = selectedStar.value;

  ctx.clearRect(0, 0, width, height);

  // Draw shared-model arcs first (behind everything)
  for (const arc of arcs) {
    const from = starBySlug.get(arc.fromSlug);
    const to = starBySlug.get(arc.toSlug);
    if (!from || !to) continue;
    const dimmed = selectedSlug && selectedSlug !== arc.fromSlug && selectedSlug !== arc.toSlug;
    const alpha = dimmed ? 0.06 : 0.18;
    ctx.beginPath();
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 - 20;
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(midX, midY, to.x, to.y);
    ctx.strokeStyle = `rgba(99,128,247,${alpha})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // Update moon physics (skip if reduced motion or frozen)
  const shouldAnimate = !reducedMotion && (!frozen || tickCount < unfreezeUntil);
  if (shouldAnimate) {
    let totalEnergy = 0;
    for (const moon of moons) {
      const star = starBySlug.get(moon.parentSlug);
      if (!star) continue;

      // Gravitational pull toward parent star
      const dx = star.x - moon.x;
      const dy = star.y - moon.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const targetDist = moon.orbitRadius;
      const distDiff = dist - targetDist;
      const gravityForce = distDiff * 0.001;
      moon.vx += (dx / dist) * gravityForce;
      moon.vy += (dy / dist) * gravityForce;

      // Orbital velocity (perpendicular to gravitational direction)
      const orbitSpeed = 0.25 / Math.sqrt(targetDist);
      moon.vx += (-dy / dist) * orbitSpeed;
      moon.vy += (dx / dist) * orbitSpeed;

      // Repulsion from other moons of same star
      for (const other of moons) {
        if (other === moon || other.parentSlug !== moon.parentSlug) continue;
        const odx = moon.x - other.x;
        const ody = moon.y - other.y;
        const odist = Math.sqrt(odx * odx + ody * ody) + 0.01;
        const minDist = moon.radius + other.radius + 6;
        if (odist < minDist) {
          const force = (minDist - odist) * 0.05;
          moon.vx += (odx / odist) * force;
          moon.vy += (ody / odist) * force;
        }
      }

      // Boundary push
      const margin = moon.radius + 4;
      if (moon.x < margin) moon.vx += 0.15;
      if (moon.x > width - margin) moon.vx -= 0.15;
      if (moon.y < margin) moon.vy += 0.15;
      if (moon.y > height - margin) moon.vy -= 0.15;

      // Damping
      moon.vx *= 0.99;
      moon.vy *= 0.99;
      moon.x += moon.vx;
      moon.y += moon.vy;
      totalEnergy += moon.vx * moon.vx + moon.vy * moon.vy;
    }

    tickCount++;
    // Freeze when settled or max ticks reached
    if (!frozen && tickCount >= 30 && totalEnergy < EQUILIBRIUM_ENERGY) {
      frozen = true;
    }
    if (!frozen && tickCount >= MAX_SETTLE_TICKS) {
      frozen = true;
    }
  }

  // Draw moons
  for (const moon of moons) {
    const dimmed = selectedSlug && moon.parentSlug !== selectedSlug;
    const alpha = dimmed ? 0.15 : 1;
    const hoveredMoon = hovered.value && hoveredType.value === 'moon' && (hovered.value as ModelMoon).id === moon.id;
    const r = hoveredMoon ? moon.radius * 1.6 : moon.radius;

    // Glow
    const glow = ctx.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, r * 2.5);
    glow.addColorStop(0, statusGlow[moon.status]);
    glow.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, r * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Node body
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, r, 0, Math.PI * 2);
    ctx.fillStyle = statusColor[moon.status];
    ctx.fill();

    // Inner highlight
    const hl = ctx.createRadialGradient(moon.x - r * 0.3, moon.y - r * 0.3, 0, moon.x, moon.y, r);
    hl.addColorStop(0, 'rgba(255,255,255,0.18)');
    hl.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, r, 0, Math.PI * 2);
    ctx.fillStyle = hl;
    ctx.fill();

    // Hovered ring
    if (hoveredMoon) {
      ctx.beginPath();
      ctx.arc(moon.x, moon.y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // Draw provider stars (on top)
  for (const star of stars) {
    const dimmed = selectedSlug && star.slug !== selectedSlug;
    const alpha = dimmed ? 0.25 : 1;
    const hoveredStar = hovered.value && hoveredType.value === 'star' && (hovered.value as ProviderStar).slug === star.slug;
    const r = hoveredStar ? star.radius * 1.2 : star.radius;

    // Outer glow
    const outerGlow = ctx.createRadialGradient(star.x, star.y, r * 0.5, star.x, star.y, r * 3);
    const glowColor = star.healthRatio >= 0.7
      ? 'rgba(52,211,153,0.25)' : star.healthRatio >= 0.3
      ? 'rgba(251,191,36,0.25)' : 'rgba(248,113,113,0.2)';
    outerGlow.addColorStop(0, glowColor);
    outerGlow.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(star.x, star.y, r * 3, 0, Math.PI * 2);
    ctx.fillStyle = outerGlow;
    ctx.fill();

    // Star body
    const bodyGrad = ctx.createRadialGradient(star.x - r * 0.2, star.y - r * 0.2, 0, star.x, star.y, r);
    bodyGrad.addColorStop(0, 'rgba(200,210,240,0.9)');
    bodyGrad.addColorStop(0.6, 'rgba(99,128,247,0.6)');
    bodyGrad.addColorStop(1, 'rgba(99,128,247,0.1)');
    ctx.beginPath();
    ctx.arc(star.x, star.y, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Star core
    ctx.beginPath();
    ctx.arc(star.x, star.y, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();

    // Hovered/selected ring
    if (hoveredStar || star.slug === selectedSlug) {
      ctx.beginPath();
      ctx.arc(star.x, star.y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = star.slug === selectedSlug ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = star.slug === selectedSlug ? 1.5 : 1;
      ctx.stroke();
    }

    // Name label
    if (hoveredStar || star.slug === selectedSlug) {
      ctx.font = '600 9px Inter, sans-serif';
      ctx.fillStyle = `rgba(232,236,244,${alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(star.name, star.x, star.y - r - 8);
    }
  }

  ctx.globalAlpha = 1;
  if (reducedMotion || frozen) {
    if (frozen && tickCount < unfreezeUntil) {
      animId = requestAnimationFrame(tick);
    } else {
      animId = 0;
      return;
    }
  }
  animId = requestAnimationFrame(tick);
}

function hitTest(px: number, py: number): { type: 'star'; item: ProviderStar } | { type: 'moon'; item: ModelMoon } | null {
  // Check stars first (they're on top)
  for (const star of stars) {
    const dx = px - star.x;
    const dy = py - star.y;
    if (Math.sqrt(dx * dx + dy * dy) <= star.radius + 4) {
      return { type: 'star', item: star };
    }
  }
  // Then moons
  for (const moon of moons) {
    const dx = px - moon.x;
    const dy = py - moon.y;
    if (Math.sqrt(dx * dx + dy * dy) <= moon.radius + 4) {
      return { type: 'moon', item: moon };
    }
  }
  return null;
}

function onMouseMove(e: MouseEvent) {
  const container = containerRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  mouseX.value = px;
  mouseY.value = py;

  const hit = hitTest(px, py);
  if (hit) {
    hovered.value = hit.item;
    hoveredType.value = hit.type;
    tooltipStyle.value = { left: px + 12 + 'px', top: py - 10 + 'px' };
    // Briefly wake the simulation on star hover
    if (hit.type === 'star' && frozen && !reducedMotion) {
      frozen = false;
      unfreezeUntil = tickCount + HOVER_UNFREEZE_TICKS;
      if (!animId) animId = requestAnimationFrame(tick);
    }
  } else {
    hovered.value = null;
    hoveredType.value = null;
  }
}

function onClick(e: MouseEvent) {
  const container = containerRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const hit = hitTest(px, py);
  if (hit?.type === 'star') {
    selectedStar.value = selectedStar.value === hit.item.slug ? null : hit.item.slug;
    if (frozen && !reducedMotion) {
      frozen = false;
      unfreezeUntil = tickCount + HOVER_UNFREEZE_TICKS;
      if (!animId) animId = requestAnimationFrame(tick);
    }
  } else {
    selectedStar.value = null;
  }
}

function resize() {
  const container = containerRef.value;
  const canvas = canvasRef.value;
  if (!container || !canvas) return;
  const rect = container.getBoundingClientRect();
  const dpr = reducedMotion ? 1 : window.devicePixelRatio || 1;
  width = rect.width;
  height = rect.height;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.scale(dpr, dpr);
}

let resizeObs: ResizeObserver | null = null;
let visible = true;

function onVisibility() {
  visible = document.visibilityState === 'visible';
  if (visible && !animId) {
    animId = requestAnimationFrame(tick);
  }
}

const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
function onReducedMotion(e: MediaQueryListEvent | { matches: boolean }) {
  reducedMotion = e.matches;
  if (reducedMotion) {
    cancelAnimationFrame(animId);
    animId = 0;
    resize();
    buildLayout();
    // Static render
    const canvas = canvasRef.value;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) { ctx.clearRect(0, 0, canvas.width, canvas.height); }
    if (!animId) {
      animId = requestAnimationFrame(tick);
      animId = 0; // single frame
    }
  } else if (!animId) {
    animId = requestAnimationFrame(tick);
  }
}

onMounted(() => {
  reducedMotion = mqReduced.matches;
  mqReduced.addEventListener('change', onReducedMotion);

  resize();
  buildLayout();
  if (stars.length) {
    tickCount = 0;
    frozen = false;
    // Let simulation settle to equilibrium, then freeze
    animId = requestAnimationFrame(tick);
  }

  resizeObs = new ResizeObserver(() => {
    resize();
    // Render one frame on resize after frozen
    if (frozen && !animId) {
      animId = requestAnimationFrame(tick);
    }
  });
  if (containerRef.value) resizeObs.observe(containerRef.value);
  document.addEventListener('visibilitychange', onVisibility);
});

onUnmounted(() => {
  cancelAnimationFrame(animId);
  resizeObs?.disconnect();
  document.removeEventListener('visibilitychange', onVisibility);
  mqReduced.removeEventListener('change', onReducedMotion);
});

watch(() => store.allModels, () => {
  buildLayout();
  if (stars.length && !animId && !reducedMotion) {
    animId = requestAnimationFrame(tick);
  }
}, { deep: false });

watch(() => store.providerRefs, () => {
  buildLayout();
  if (stars.length && !animId && !reducedMotion) {
    animId = requestAnimationFrame(tick);
  }
}, { deep: false });
</script>

<style scoped>
.ecosystem-graph {
  position: relative;
  width: 100%;
  height: 220px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-0, #080a10);
  border: 1px solid var(--border, #1e2538);
  cursor: crosshair;
}

.eco-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.eco-overlay {
  position: absolute;
  bottom: 10px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  pointer-events: none;
  padding: 4px 10px 4px 0;
  background: linear-gradient(0deg, var(--surface-0, #080a10) 60%, transparent 100%);
}

.eco-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.eco-sub {
  font-size: 0.62rem;
  color: var(--text-muted);
  opacity: 0.7;
}

.eco-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 10;
  background: var(--glass-bg, rgba(22,27,38,0.85));
  backdrop-filter: blur(6px);
  border: 1px solid var(--glass-border-light, rgba(255,255,255,0.06));
  border-radius: var(--radius-sm, 4px);
  padding: 4px 10px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  box-shadow: var(--shadow-elevation-2, 0 4px 16px rgba(0,0,0,0.4));
}

.eco-tt-name {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text);
}

.eco-tt-count {
  font-size: 0.6rem;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .ecosystem-graph {
    height: 170px;
  }
}
</style>
