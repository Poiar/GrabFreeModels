/**
 * useDerivationChips.ts — Shared derivation method and parameter bucket
 * constants + helpers used by ModelList.vue and SuperModels.vue.
 *
 * Previously these were copy-pasted constants and computed properties
 * duplicated across both views.
 */

export const DERIV_META: Record<string, { label: string; icon: string; order: number }> = {
  finetune: { label: 'Fine-tune', icon: '🔧', order: 1 },
  merge: { label: 'Merge', icon: '🔀', order: 2 },
  distillation: { label: 'Distillation', icon: '💧', order: 3 },
  dpo: { label: 'DPO', icon: '↔', order: 4 },
  continued_pretraining: { label: 'Cont. Pretrain', icon: '⟳', order: 5 },
  lora_adapter: { label: 'LoRA', icon: '🔌', order: 6 },
  quantization: { label: 'Quantized', icon: '📐', order: 7 },
  foundation: { label: 'Foundation', icon: '🏗', order: 8 },
  unknown: { label: 'Unknown', icon: '❓', order: 9 },
};

export const DERIV_CHIPS = Object.entries(DERIV_META)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([key, meta]) => ({ key, ...meta }));

interface ParamBucket {
  readonly label: string;
  readonly min?: number;
  readonly max?: number;
  readonly key: string;
}

export const PARAM_BUCKETS: ParamBucket[] = [
  { label: '<1B', max: 1, key: 'tiny' },
  { label: '1-7B', min: 1, max: 7, key: 'small' },
  { label: '7-30B', min: 7, max: 30, key: 'medium' },
  { label: '30-70B', min: 30, max: 70, key: 'large' },
  { label: '70B+', min: 70, key: 'xl' },
] as const;

export interface DerivationCount {
  key: string;
  label: string;
  icon: string;
  count: number;
}

export interface ParamCount {
  key: string;
  label: string;
  count: number;
}

/**
 * Count active models grouped by derivation method.
 * @param models Array of models with a derivation_method field
 */
export function modelDerivationCounts(
  models: { derivation_method?: string | null }[],
): DerivationCount[] {
  const counts = new Map<string, number>();
  for (const m of models) {
    const method = m.derivation_method || 'unknown';
    counts.set(method, (counts.get(method) || 0) + 1);
  }
  return DERIV_CHIPS.map((chip) => ({ ...chip, count: counts.get(chip.key) || 0 })).filter(
    (c) => c.count > 0,
  );
}

/**
 * Count active models grouped by parameter size bucket.
 * @param models Array of models with a param_count_b field
 */
export function paramCounts(models: { param_count_b?: number | null }[]): ParamCount[] {
  const counts: Record<string, number> = {};
  for (const bucket of PARAM_BUCKETS) counts[bucket.key] = 0;

  for (const m of models) {
    const p = m.param_count_b;
    if (p === null || p === undefined) continue;
    for (const bucket of PARAM_BUCKETS) {
      const aboveMin = !bucket.min || p >= bucket.min;
      const belowMax = !bucket.max || p < bucket.max;
      if (aboveMin && belowMax) {
        counts[bucket.key]++;
        break;
      }
    }
  }

  return PARAM_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: counts[b.key] || 0,
  })).filter((c) => c.count > 0);
}
