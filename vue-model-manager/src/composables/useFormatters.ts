/**
 * useFormatters.ts — Shared formatting utilities for Vue components.
 *
 * Consolidates formatFamily(), formatContext(), formatRole(), and roleColor()
 * that were copy-pasted into 20+ component files.
 */

// ── Family name overrides ──
const FAMILY_OVERRIDES: Record<string, string> = {
  llama: 'Llama',
  gpt: 'GPT',
  gemini: 'Gemini',
  grok: 'Grok',
  qwq: 'QwQ',
  qwen: 'Qwen',
  mistral: 'Mistral',
  mixtral: 'Mixtral',
  deepseek: 'DeepSeek',
  gemma: 'Gemma',
  phi: 'Phi',
  claude: 'Claude',
  command: 'Command',
  wizardlm: 'WizardLM',
  codellama: 'Code Llama',
  yi: 'Yi',
  nemotron: 'Nemotron',
  c4ai: 'C4AI',
  aya: 'Aya',
  olmo: 'OLMo',
  dbrx: 'DBRX',
  falcon: 'Falcon',
  mamba: 'Mamba',
  jamba: 'Jamba',
  reka: 'Reka',
  striped: 'StripedHyena',
};

export function formatFamily(raw: string): string {
  if (raw === 'Uncategorized') return raw;
  return raw
    .split('-')
    .map((w) => FAMILY_OVERRIDES[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatContext(ctx: number | null): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(ctx / 1000)}K`;
}

const ROLE_LABELS: Record<string, string> = {
  model: 'Coder',
  build: 'Build',
  general: 'General',
  small_model: 'Small',
  explore: 'Explore',
};

export function formatRole(role: string): string {
  return ROLE_LABELS[role] || role;
}

const ROLE_COLORS: Record<string, string> = {
  model: '#818cf8',
  build: '#34d399',
  general: '#fbbf24',
  small_model: '#f472b6',
  explore: '#a78bfa',
};

export function roleColor(role: string): string {
  return ROLE_COLORS[role] || '#94a3b8';
}

export function formatParams(billions: number | null): string {
  if (!billions) return '?';
  if (billions >= 1) return `${billions.toFixed(0)}B`;
  return `${(billions * 1000).toFixed(0)}M`;
}

export function formatTpm(tpm: number | null): string {
  if (!tpm) return '—';
  return tpm >= 1_000_000 ? `${(tpm / 1_000_000).toFixed(1)}M` : tpm.toLocaleString();
}

export function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '—';
  if (price === 0) return 'Free';
  if (price < 0.01) return `$${price.toFixed(4)}`;
  if (price < 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(2)}`;
}

export function formatKnowledge(k: string | null): string {
  if (!k) return '';
  const m = k.match(/^(\d{4})-(\d{2})/);
  if (!m) return k;
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][parseInt(m[2]) - 1];
  return `${month} ${m[1]}`;
}
