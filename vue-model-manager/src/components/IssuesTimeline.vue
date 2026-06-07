<template>
  <div class="issues-timeline">
    <div class="timeline-header">
      <h2>Issue Seismograph</h2>
      <div class="timeline-controls">
        <label class="tl-toggle">
          <input type="checkbox" v-model="hideLowModerate" />
          <span>Hide low / moderate</span>
        </label>
        <span class="tl-count">{{ visibleIssues.length }} issues</span>
      </div>
    </div>

    <div v-if="visibleIssues.length === 0" class="tl-empty">
      <p>No issues to display.</p>
    </div>

    <div v-else class="timeline-canvas-wrap" ref="containerRef">
      <div class="timeline-scroll">
        <svg
          class="timeline-svg"
          :width="svgWidth"
          :height="svgHeight"
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        >
          <!-- Grid lines for severity levels -->
          <line v-for="g in gridLines" :key="'gl'+g.y"
            :x1="0" :y1="g.y" :x2="svgWidth" :y2="g.y"
            class="tl-gridline"
          />
          <text v-for="g in gridLines" :key="'glt'+g.y"
            :x="4" :y="g.y - 4"
            class="tl-gridlabel"
          >{{ g.label }}</text>

          <!-- Baseline -->
          <line :x1="0" :y1="baseY" :x2="svgWidth" :y2="baseY" class="tl-baseline" />

          <!-- Issue spikes -->
          <g v-for="(issue, idx) in visibleIssues" :key="issue.model_id + '|' + issue.issue"
            :transform="`translate(${getX(idx)}, ${baseY})`"
            class="tl-spike-group"
            :class="{ 'tl-selected': selectedIssue === issue }"
            @mouseenter="hoveredIssue = issue"
            @mouseleave="hoveredIssue = null"
            @click="selectedIssue = issue"
            role="button"
            :tabindex="0"
            :aria-label="`${issue.severity} issue: ${issue.issue}`"
            @keydown.enter="selectedIssue = issue"
            @keydown.space.prevent="selectedIssue = issue"
          >
            <!-- Ripple rings for critical -->
            <circle v-if="issue.severity === 'critical'" cx="0" cy="0" :r="spikeW * 0.75"
              class="tl-ripple" />
            <!-- Spike -->
            <rect :x="-spikeW / 2" :y="-getSpikeHeight(issue)"
              :width="spikeW" :height="getSpikeHeight(issue)"
              :rx="spikeW / 2"
              :class="`tl-spike-${issue.severity}`"
            />
            <!-- Glow under spike -->
            <ellipse :cx="0" :cy="0" :rx="spikeW * 3" :ry="spikeW * 0.6"
              :class="`tl-glow-${issue.severity}`" />
          </g>
        </svg>
      </div>

      <!-- Tooltip -->
      <div v-if="hoveredIssue" class="tl-tooltip"
        :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }">
        <span class="tl-tt-model">{{ hoveredIssue.model_id }}</span>
        <span class="tl-tt-severity" :class="`tl-tt-${hoveredIssue.severity}`">{{ hoveredIssue.severity }}</span>
        <p class="tl-tt-summary">{{ hoveredIssue.issue }}</p>
        <span class="tl-tt-date">Reported: {{ hoveredIssue.reported }}</span>
        <span class="tl-tt-date">Last verified: {{ hoveredIssue.last_verified || 'N/A' }}</span>
      </div>
    </div>

    <!-- Expanded card overlay -->
    <Teleport to="body">
      <div v-if="selectedIssue" class="tl-overlay" @click.self="selectedIssue = null">
        <div class="tl-card" role="dialog" aria-modal="true" aria-label="Issue details">
          <button class="tl-close" @click="selectedIssue = null" aria-label="Close">&times;</button>
          <div class="tl-card-header">
            <h3>{{ selectedIssue.model_id }}</h3>
            <span class="tl-card-severity" :class="`tl-tt-${selectedIssue.severity}`">{{ selectedIssue.severity }}</span>
          </div>
          <div class="tl-card-body">
            <p><strong>Issue:</strong> {{ selectedIssue.issue }}</p>
            <p><strong>Impact:</strong> {{ selectedIssue.impact }}</p>
            <p v-if="selectedIssue.workaround"><strong>Workaround:</strong> {{ selectedIssue.workaround }}</p>
          </div>
          <p class="tl-card-footer">
            Reported: {{ selectedIssue.reported }} | Last verified: {{ selectedIssue.last_verified || 'N/A' }}
          </p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useModelsStore } from '@/store/models';
import type { KnownIssue } from '@/types';

const store = useModelsStore();

const hideLowModerate = ref(false);
const hoveredIssue = ref<KnownIssue | null>(null);
const selectedIssue = ref<KnownIssue | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);
const containerRef = ref<HTMLElement | null>(null);
const containerHeight = ref(600);
const containerWidth = ref(800);

let resizeObserver: ResizeObserver | null = null;

const severityRank: Record<string, number> = {
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1,
};

const padding = computed(() => Math.max(40, containerHeight.value * 0.06));
const spikeW = computed(() => Math.max(6, containerHeight.value * 0.018));
const spikeUnit = computed(() => Math.max(14, containerHeight.value * 0.07));
const svgHeight = computed(() => containerHeight.value);
const baseY = computed(() => svgHeight.value - padding.value);

const visibleIssues = computed(() => {
  const all = store.knownIssues;
  if (!hideLowModerate.value) return all;
  return all.filter((i) => i.severity === 'critical' || i.severity === 'high');
});

const svgWidth = computed(() => containerWidth.value);

const gridLines = computed(() => [
  { y: baseY.value - spikeUnit.value * 4, label: 'critical' },
  { y: baseY.value - spikeUnit.value * 3, label: 'high' },
  { y: baseY.value - spikeUnit.value * 2, label: 'moderate' },
  { y: baseY.value - spikeUnit.value, label: 'low' },
]);

function getSpikeHeight(issue: KnownIssue): number {
  return (severityRank[issue.severity] ?? 1) * spikeUnit.value;
}

function getX(idx: number): number {
  const count = visibleIssues.value.length;
  if (count <= 1) return svgWidth.value / 2;
  const usable = svgWidth.value - padding.value * 2;
  return padding.value + (idx / (count - 1)) * usable;
}

function onMouseMove(e: MouseEvent) {
  if (!hoveredIssue.value || !containerRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  tooltipX.value = e.clientX - rect.left + 12;
  // Position tooltip above cursor so it stays in frame
  tooltipY.value = Math.max(8, e.clientY - rect.top - 60);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') selectedIssue.value = null;
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  if (containerRef.value) {
    containerRef.value.addEventListener('mousemove', onMouseMove);
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width;
        containerHeight.value = entry.contentRect.height;
      }
    });
    resizeObserver.observe(containerRef.value);
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  if (containerRef.value) {
    containerRef.value.removeEventListener('mousemove', onMouseMove);
  }
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.issues-timeline {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.timeline-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0;
}

.timeline-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.tl-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: var(--text-muted);
  cursor: pointer;
}

.tl-count {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--accent-subtle);
  color: var(--accent);
}

.tl-empty {
  text-align: center;
  padding: 60px 24px;
  color: var(--text-muted);
}

.timeline-canvas-wrap {
  position: relative;
  background: var(--depth-1, #0b0e14);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  flex: 1;
  min-height: 200px;
}

.timeline-scroll {
  overflow-x: auto;
  overflow-y: hidden;
}

.timeline-svg {
  display: block;
  width: 100%;
}

.tl-gridline {
  stroke: rgba(255,255,255,0.04);
  stroke-width: 1;
  stroke-dasharray: 4 6;
}

.tl-gridlabel {
  fill: var(--text-muted);
  font-size: 9px;
  font-family: Inter, sans-serif;
  opacity: 0.5;
}

.tl-baseline {
  stroke: rgba(255,255,255,0.08);
  stroke-width: 1.5;
}

.tl-spike-group {
  cursor: pointer;
  outline: none;
}

.tl-spike-group:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 4px;
}

.tl-spike-group:hover .tl-spike-critical,
.tl-spike-group:hover .tl-spike-high,
.tl-spike-group:hover .tl-spike-moderate,
.tl-spike-group:hover .tl-spike-low {
  filter: brightness(1.3);
}

.tl-spike-critical { fill: var(--red, #f87171); }
.tl-spike-high { fill: var(--red-dim, #ef4444); opacity: 0.85; }
.tl-spike-moderate { fill: var(--orange, #fbbf24); }
.tl-spike-low { fill: var(--accent, #6380f7); }

.tl-glow-critical { fill: var(--red-glow, rgba(248,113,113,0.3)); }
.tl-glow-high { fill: var(--red-glow-dim, rgba(239,68,68,0.15)); }
.tl-glow-moderate { fill: var(--orange-glow, rgba(251,191,36,0.15)); }
.tl-glow-low { fill: var(--accent-glow, rgba(99,128,247,0.15)); }

.tl-selected .tl-spike-critical,
.tl-selected .tl-spike-high,
.tl-selected .tl-spike-moderate,
.tl-selected .tl-spike-low {
  filter: brightness(1.5) drop-shadow(0 0 4px currentColor);
}

@keyframes ripple-expand {
  0% { transform: scale(1); opacity: 0.35; }
  100% { transform: scale(5); opacity: 0; }
}

.tl-ripple {
  animation: ripple-expand 2.2s var(--ease-out, ease-out) infinite;
  fill: none;
  stroke: var(--red, #f87171);
  stroke-width: 1;
  transform-origin: center;
}

/* Tooltip */
.tl-tooltip {
  position: absolute;
  pointer-events: none;
  background: var(--glass-bg, rgba(22,27,38,0.8));
  backdrop-filter: blur(8px);
  border: 1px solid var(--glass-border-light, rgba(255,255,255,0.06));
  border-radius: var(--radius-sm, 6px);
  padding: 8px 12px;
  box-shadow: var(--shadow-elevation-3, 0 8px 24px rgba(0,0,0,0.4));
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 240px;
}

.tl-tt-model {
  font-weight: 700;
  font-size: 0.72rem;
  word-break: break-all;
}

.tl-tt-severity {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  width: fit-content;
}

.tl-tt-critical { background: rgba(248,113,113,0.2); color: var(--red); }
.tl-tt-high { background: rgba(239,68,68,0.2); color: #ef4444; }
.tl-tt-moderate { background: rgba(251,191,36,0.2); color: var(--orange); }
.tl-tt-low { background: rgba(99,128,247,0.2); color: var(--accent); }

.tl-tt-summary {
  font-size: 0.7rem;
  color: var(--text-dim);
  margin: 0;
  line-height: 1.3;
}

.tl-tt-date {
  font-size: 0.6rem;
  color: var(--text-muted);
}

/* Expanded card overlay */
.tl-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(2px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tl-card {
  background: var(--bg-card, #161b26);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 10px);
  padding: 24px;
  max-width: 480px;
  width: 90%;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-xl, 0 16px 48px rgba(0,0,0,0.5));
  max-height: 80vh;
  overflow-y: auto;
}

.tl-close {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.3rem;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  line-height: 1;
}

.tl-close:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.tl-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.tl-card-header h3 {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
  word-break: break-all;
}

.tl-card-severity {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.tl-card-body p {
  font-size: 0.8rem;
  margin: 0 0 6px;
  color: var(--text-dim);
  line-height: 1.4;
}

.tl-card-body strong {
  color: var(--text);
}

.tl-card-footer {
  font-size: 0.65rem;
  color: var(--text-muted);
  margin: 0;
}

@media (max-width: 768px) {
  .issues-timeline {
    padding: 12px;
    height: 100%;
  }
  .timeline-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .tl-card {
    padding: 18px;
  }
}
</style>
