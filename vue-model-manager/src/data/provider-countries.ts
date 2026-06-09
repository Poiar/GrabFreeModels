// ── Provider → Country mapping ──
// Keyed by provider slug. Re-exports the same CountryInfo types from creator-countries.

import { getCountryByCode, type CountryInfo, CONTINENTS } from './creator-countries';

const PROVIDER_COUNTRY: Record<string, string> = {
  // ── USA ──
  'anthropic': 'US',
  'cerebras': 'US',
  'cloudflare': 'US',
  'cloudflare-ai-gateway': 'US',
  'cortecs': 'US',
  'firepass': 'US',
  'fireworks': 'US',
  'github-models': 'US',
  'gitlab': 'US',
  'google': 'US',
  'groq': 'US',
  'llama': 'US',
  'llmgateway': 'US',
  'lmstudio': 'US',
  'meganova': 'US',
  'modelsdev': 'US',
  'nano-gpt': 'US',
  'nova': 'US',
  'nvidia': 'US',
  'openai': 'US',
  'opencode': 'US',
  'openrouter': 'US',
  'poe': 'US',
  'together': 'US',
  'vercel': 'US',
  'xai': 'US',
  'umans-ai-coding-plan': 'US',

  // ── China ──
  'aihubmix': 'CN',
  'alibaba-cn': 'CN',
  'alibaba-coding-plan': 'CN',
  'alibaba-coding-plan-cn': 'CN',
  'deepseek': 'CN',
  'iflowcn': 'CN',
  'jiekou': 'CN',
  'kimi-for-coding': 'CN',
  'kuae-cloud-coding-plan': 'CN',
  'minimax-cn-coding-plan': 'CN',
  'minimax-coding-plan': 'CN',
  'modelscope': 'CN',
  'novita-ai': 'CN',
  'novitaai': 'CN',
  'siliconflow': 'CN',
  'siliconflow-cn': 'CN',
  'tencent-coding-plan': 'CN',
  'tencent-tokenhub': 'CN',
  'xiaomi-token-plan-ams': 'CN',
  'xiaomi-token-plan-cn': 'CN',
  'xiaomi-token-plan-sgp': 'CN',
  'zenmux': 'CN',
  'zhipuai': 'CN',
  'zhipuai-coding-plan': 'CN',

  // ── France ──
  'huggingface': 'FR',
  'mistral': 'FR',
  'poolside': 'FR',

  // ── Netherlands ──
  'deepinfra': 'NL',

  // ── Canada ──
  'cohere': 'CA',
};

export function getCountryForProvider(providerSlug: string): CountryInfo {
  const code = PROVIDER_COUNTRY[providerSlug] || 'XX';
  return getCountryByCode(code);
}

export { CONTINENTS, type CountryInfo };
