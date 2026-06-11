<template>
  <div class="ft-tree">
    <!-- Root header – only shown once at the top level -->
    <div v-if="depth === 0" class="ft-section">
      <h3 class="ft-section-title">
        Fine-tune Tree
        <span v-if="totalCount > 0" class="ft-count-badge">{{ totalCount }}</span>
      </h3>
      <p v-if="totalCount === 0" class="ft-empty-text">No fine-tunes of this model</p>
    </div>

    <template v-if="children.length > 0">
      <div v-for="child in children" :key="child.super_id" class="ft-node">
        <div class="ft-row" :style="{ paddingLeft: indentPx + 'px' }">
          <!-- Expand / collapse toggle (only for nodes that have grandchildren) -->
          <button
            v-if="hasGrandchildren(child.slug)"
            class="ft-toggle"
            @click.stop="toggleNode(child.slug)"
            :aria-expanded="expanded.has(child.slug)"
            :aria-label="expanded.has(child.slug) ? 'Collapse' : 'Expand'"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline v-if="expanded.has(child.slug)" points="6 15 12 9 18 15" />
              <polyline v-else points="9 18 15 12 9 6" />
            </svg>
          </button>
          <span v-else class="ft-toggle-spacer"></span>

          <!-- Model link -->
          <router-link
            :to="`/model/${child.slug}`"
            class="ft-link"
            @click.stop
          >
            <span class="ft-link-name">{{ child.name }}</span>
          </router-link>

          <!-- Derivation method badge -->
          <span class="ft-badge" :class="derivBadgeClass(child)">{{ derivBadgeLabel(child) }}</span>
        </div>

        <!-- Recursive children -->
        <FineTuneTree
          v-if="expanded.has(child.slug)"
          :root-slug="child.slug"
          :depth="depth + 1"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '@/store/models';
import type { ModelData } from '@/types';

const props = withDefaults(defineProps<{
  rootSlug: string;
  depth?: number;
}>(), {
  depth: 0,
});

const store = useModelsStore();
const expanded = ref(new Set<string>());

const children = computed(() => {
  return store.derivedModels.get(props.rootSlug) ?? [];
});

/**
 * Count all descendants recursively (used for the root header count).
 */
function countDescendants(slug: string): number {
  const kids = store.derivedModels.get(slug) ?? [];
  let count = kids.length;
  for (const k of kids) {
    count += countDescendants(k.slug);
  }
  return count;
}

const totalCount = computed(() => countDescendants(props.rootSlug));

function hasGrandchildren(slug: string): boolean {
  return (store.derivedModels.get(slug) ?? []).length > 0;
}

function toggleNode(slug: string) {
  const next = new Set(expanded.value);
  if (next.has(slug)) {
    next.delete(slug);
  } else {
    next.add(slug);
  }
  expanded.value = next;
}

const DERIV_META_TREE: Record<string, { label: string; cssClass: string }> = {
  finetune: { label: 'FT', cssClass: 'deriv-ft' },
  merge: { label: 'M', cssClass: 'deriv-merge' },
  distillation: { label: 'D', cssClass: 'deriv-distill' },
  dpo: { label: 'DPO', cssClass: 'deriv-dpo' },
  continued_pretraining: { label: 'CPT', cssClass: 'deriv-cpt' },
  lora_adapter: { label: 'LoRA', cssClass: 'deriv-lora' },
};

function derivBadgeLabel(child: ModelData): string {
  const method = child.derivation_method;
  if (method && DERIV_META_TREE[method]) return DERIV_META_TREE[method].label;
  return 'FT';
}

function derivBadgeClass(child: ModelData): string {
  const method = child.derivation_method;
  if (method && DERIV_META_TREE[method]) return DERIV_META_TREE[method].cssClass;
  return 'deriv-ft';
}

const indentPx = computed(() => props.depth * 20 + 8);
</script>

<script lang="ts">
/**
 * Named export enables self-reference in the template
 * so <FineTuneTree> can be used recursively.
 */
export default { name: 'FineTuneTree' };
</script>

<style scoped>
.ft-section {
  margin-bottom: 4px;
}

.ft-section-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
}

.ft-count-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
}

.ft-empty-text {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0 0 4px;
}

.ft-node {
  /* Each node wraps a row + optional recursive subtree */
}

.ft-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 0;
  border-radius: 4px;
  transition: background 0.1s;
  min-height: 28px;
}

.ft-row:hover {
  background: var(--bg-hover);
}

.ft-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  border-radius: 3px;
  transition: color 0.12s;
}

.ft-toggle:hover {
  color: var(--text);
  background: var(--bg-elevated);
}

.ft-toggle-spacer {
  display: block;
  width: 16px;
  flex-shrink: 0;
}

.ft-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.12s;
  flex: 1;
  min-width: 0;
}

.ft-link:hover {
  color: var(--accent);
}

.ft-link-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.ft-badge {
  font-size: 0.55rem;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(99, 102, 241, 0.12);
  color: var(--deriv-ft);
  letter-spacing: 0.03em;
  flex-shrink: 0;
  line-height: 1.4;
}
.ft-badge.deriv-ft { background: rgba(99, 102, 241, 0.12); color: var(--deriv-ft); }
.ft-badge.deriv-merge { background: rgba(168, 85, 247, 0.12); color: var(--deriv-merge); }
.ft-badge.deriv-distill { background: rgba(236, 72, 153, 0.12); color: var(--deriv-distill); }
.ft-badge.deriv-dpo { background: rgba(34, 211, 238, 0.12); color: var(--deriv-dpo); }
.ft-badge.deriv-cpt { background: rgba(250, 204, 21, 0.12); color: var(--deriv-cpt); }
.ft-badge.deriv-lora { background: rgba(52, 211, 153, 0.12); color: var(--deriv-lora); }

</style>
