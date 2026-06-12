<template>
  <div class="pulse-wave" ref="containerRef" aria-hidden="true">
    <canvas ref="canvasRef" class="pulse-canvas"></canvas>
    <div v-if="bandCount > 0" class="pulse-labels">
      <div
        v-for="(pw, idx) in waveformData"
        :key="pw.slug"
        class="pulse-label"
        :style="{ top: bandLabelY(idx) + 'px' }"
      >
        <span class="pulse-label-dot" :class="pw.healthClass"></span>
        <span class="pulse-label-name">{{ pw.name }}</span>
      </div>
    </div>
    <div v-if="bandCount === 0" class="pulse-empty">No provider data</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useModelsStore } from '@/store/models';

const store = useModelsStore();
const containerRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

interface WaveformBand {
  name: string;
  slug: string;
  total: number;
  working: number;
  broken: number;
  rateLimited: number;
  healthClass: string;
  amplitude: number;
}

const waveformData = computed((): WaveformBand[] => {
  const models = store.allModels;
  return store.providerRefs
    .map((prov) => {
      let working = 0,
        broken = 0,
        rateLimited = 0;
      for (const m of models) {
        for (const dp of m.providers) {
          if (dp.provider_slug === prov.slug && !dp._removed) {
            if (dp.status.result === 'working') working++;
            else if (dp.status.result === 'broken' || dp.status.result === 'not_found') broken++;
            else if (dp.status.result === 'rate_limited') rateLimited++;
          }
        }
      }
      const total = working + broken + rateLimited;
      const workingRatio = total > 0 ? working / total : 0;
      return {
        name: prov.name,
        slug: prov.slug,
        total,
        working,
        broken,
        rateLimited,
        healthClass: workingRatio >= 0.7 ? 'healthy' : workingRatio >= 0.3 ? 'degraded' : 'down',
        amplitude: Math.min(28, 6 + total * 1.2),
      };
    })
    .filter((p) => p.total > 0);
});

const bandCount = computed(() => waveformData.value.length);

let width = 0;
let height = 0;

function bandLabelY(idx: number): number {
  if (waveformData.value.length === 0) return 0;
  const bandH = height / waveformData.value.length;
  return idx * bandH + bandH / 2 - 7;
}

function draw() {
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext('2d');
  if (!ctx || !canvas || !width || !height) return;

  ctx.clearRect(0, 0, width, height);

  const bands = waveformData.value;
  if (bands.length === 0) return;

  const bandH = height / bands.length;

  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const bandY = i * bandH;
    const centerY = bandY + bandH / 2;
    const phase = i * 1.8;

    // Determine band color based on health
    const workingRatio = band.total > 0 ? band.working / band.total : 0;
    let bandColor: string;
    if (workingRatio >= 0.7) bandColor = 'rgba(52,211,153,0.5)';
    else if (workingRatio >= 0.3) bandColor = 'rgba(251,191,36,0.5)';
    else bandColor = 'rgba(248,113,113,0.5)';

    // Draw waveform path
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    for (let x = 0; x <= width; x += 2) {
      const wave1 = Math.sin(x * 0.015 + phase) * band.amplitude * 0.5;
      const wave2 = Math.sin(x * 0.04 + phase * 1.4) * band.amplitude * 0.3;
      const wave3 = Math.cos(x * 0.008 + phase * 0.6) * band.amplitude * 0.2;
      const y = centerY + wave1 + wave2 + wave3;
      ctx.lineTo(x, y);
    }

    // Fill below wave
    ctx.lineTo(width, centerY + band.amplitude);
    ctx.lineTo(0, centerY + band.amplitude);
    ctx.closePath();

    const fillGrad = ctx.createLinearGradient(
      0,
      centerY - band.amplitude,
      0,
      centerY + band.amplitude,
    );
    if (workingRatio >= 0.7) {
      fillGrad.addColorStop(0, 'rgba(52,211,153,0.15)');
      fillGrad.addColorStop(1, 'rgba(52,211,153,0.02)');
    } else if (workingRatio >= 0.3) {
      fillGrad.addColorStop(0, 'rgba(251,191,36,0.15)');
      fillGrad.addColorStop(1, 'rgba(251,191,36,0.02)');
    } else {
      fillGrad.addColorStop(0, 'rgba(248,113,113,0.15)');
      fillGrad.addColorStop(1, 'rgba(248,113,113,0.02)');
    }
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Stroke the waveform
    ctx.strokeStyle = bandColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Subtle band separator
    if (i < bands.length - 1) {
      ctx.beginPath();
      ctx.moveTo(0, bandY + bandH);
      ctx.lineTo(width, bandY + bandH);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // Left gradient mask to protect label area from waveform overlap
  const maskGrad = ctx.createLinearGradient(0, 0, 100, 0);
  maskGrad.addColorStop(0, '#080a10');
  maskGrad.addColorStop(0.3, '#080a10');
  maskGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = maskGrad;
  ctx.fillRect(0, 0, 100, height);
}

function resize() {
  const container = containerRef.value;
  const canvas = canvasRef.value;
  if (!container || !canvas) return;
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
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

onMounted(() => {
  resize();
  draw();

  resizeObs = new ResizeObserver(() => {
    resize();
    draw();
  });
  if (containerRef.value) resizeObs.observe(containerRef.value);
});

onUnmounted(() => {
  resizeObs?.disconnect();
});
</script>

<style scoped>
.pulse-wave {
  position: relative;
  width: 100%;
  height: 180px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--depth-0, #080a10);
  border: 1px solid var(--border);
}

.pulse-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.pulse-labels {
  position: absolute;
  left: 10px;
  top: 4px;
  bottom: 4px;
  right: 0;
  pointer-events: none;
}

.pulse-label {
  position: absolute;
  left: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim, rgba(232, 236, 244, 0.5));
  text-shadow: 0 0 6px var(--depth-0, #080a10);
}

.pulse-label-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pulse-label-dot.healthy {
  background: var(--green);
  box-shadow: 0 0 4px var(--green-glow);
}
.pulse-label-dot.degraded {
  background: var(--orange);
  box-shadow: 0 0 4px var(--orange-glow);
}
.pulse-label-dot.down {
  background: var(--red);
  box-shadow: 0 0 4px var(--red-glow);
}

.pulse-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 0.72rem;
}

@media (max-width: 768px) {
  .pulse-wave {
    height: 130px;
  }
  .pulse-label {
    font-size: 0.55rem;
  }
}
</style>
