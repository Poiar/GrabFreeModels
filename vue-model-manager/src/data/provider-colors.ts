// Provider brand colors — primary hex values sourced from official brand assets.
// Unknown providers get a deterministic color from their slug hash.

const BRAND_COLORS: Record<string, string> = {
  // ── Major LLM providers ──
  openai: '#10A37F',
  anthropic: '#D97706',
  google: '#4285F4',
  'google-vertex': '#4285F4',
  'google-vertex-anthropic': '#D97706',
  deepseek: '#4D6BFE',
  mistral: '#FA5200',
  meta: '#0668E1',
  llama: '#0668E1',
  nvidia: '#76B900',
  groq: '#F97316',
  cerebras: '#6C5CE7',
  togetherai: '#6C47FF',
  together: '#6C47FF',
  huggingface: '#FF9D00',
  openrouter: '#8B5CF6',
  cohere: '#39594D',
  xai: '#E5E5E5',
  perplexity: '#20B8CD',
  'perplexity-agent': '#20B8CD',
  minimax: '#1C1C1C',
  'minimax-cn': '#1C1C1C',
  'minimax-coding-plan': '#1C1C1C',
  'minimax-cn-coding-plan': '#1C1C1C',
  alibaba: '#FF6A00',
  'alibaba-cn': '#FF6A00',
  'alibaba-coding-plan': '#FF6A00',
  'alibaba-coding-plan-cn': '#FF6A00',
  'alibaba-token-plan': '#FF6A00',
  zhipuai: '#4F46E5',
  'zhipuai-coding-plan': '#4F46E5',
  zai: '#4F46E5',
  'zai-coding-plan': '#4F46E5',

  // ── Cloud platforms ──
  azure: '#0078D4',
  'azure-cognitive-services': '#0078D4',
  cloudflare: '#F38020',
  'cloudflare-workers-ai': '#F38020',
  'cloudflare-ai-gateway': '#F38020',
  'amazon-bedrock': '#FF9900',
  digitalocean: '#0080FF',
  vercel: '#000000',
  github: '#24292F',
  'github-models': '#24292F',
  'github-copilot': '#24292F',
  gitlab: '#FC6D26',
  ovhcloud: '#000D2C',
  scaleway: '#7B2FBE',

  // ── AI infra / model hosting ──
  fireworks: '#FA5200',
  'fireworks-ai': '#FA5200',
  deepinfra: '#3B82F6',
  baseten: '#0F172A',
  nebius: '#5241D9',
  novita: '#7C3AED',
  'novita-ai': '#7C3AED',
  novitaai: '#7C3AED',
  siliconflow: '#6366F1',
  'siliconflow-cn': '#6366F1',
  friendli: '#2563EB',
  databricks: '#FF3621',
  'snowflake-cortex': '#29B5E8',
  vultr: '#007BFC',
  upstage: '#7C3AED',
  sarvam: '#F97316',
  lmstudio: '#10A37F',
  dinference: '#6366F1',
  wandb: '#FACC15',

  // ── Routing / gateway ──
  opencode: '#6C47FF',
  'opencode-go': '#6C47FF',
  llmgateway: '#4F46E5',
  'llm-gateway': '#4F46E5',
  fastrouter: '#F97316',
  requesty: '#3B82F6',
  helicone: '#8B5CF6',
  'merge-gateway': '#6C5CE7',
  'routing-run': '#6366F1',
  'the-grid-ai': '#10A37F',
  orcarouter: '#F97316',

  // ── Chinese ecosystem ──
  bailing: '#2563EB',
  moonshotai: '#4F46E5',
  'moonshotai-cn': '#4F46E5',
  kimi: '#4F46E5',
  'kimi-for-coding': '#4F46E5',
  stepfun: '#6366F1',
  'stepfun-ai': '#6366F1',
  tencent: '#0052D9',
  'tencent-coding-plan': '#0052D9',
  'tencent-tokenhub': '#0052D9',
  xiaomi: '#FF6900',
  'xiaomi-token-plan-ams': '#FF6900',
  'xiaomi-token-plan-cn': '#FF6900',
  'xiaomi-token-plan-sgp': '#FF6900',
  'qiniu-ai': '#07C160',
  'qihang-ai': '#6366F1',
  iflowcn: '#2563EB',
  'kuae-cloud-coding-plan': '#3B82F6',

  // ── Other providers ──
  'hpc-ai': '#2563EB',
  '302ai': '#6C5CE7',
  abacus: '#6366F1',
  'abliteration-ai': '#F97316',
  aihubmix: '#3B82F6',
  ambient: '#10A37F',
  anyapi: '#4F46E5',
  'atomic-chat': '#6366F1',
  auriko: '#2563EB',
  chutes: '#F97316',
  clarifai: '#2563EB',
  cortecs: '#4F46E5',
  drun: '#F97316',
  evroc: '#3B82F6',
  firepass: '#FA5200',
  freemodel: '#10A37F',
  frogbot: '#10A37F',
  gmicloud: '#6366F1',
  inception: '#4F46E5',
  inceptron: '#6366F1',
  inference: '#3B82F6',
  'io-net': '#8B5CF6',
  jiekou: '#2563EB',
  kilo: '#F97316',
  lilac: '#8B5CF6',
  lucidquery: '#6366F1',
  meganova: '#4F46E5',
  mixlayer: '#2563EB',
  modelscope: '#FF6A00',
  moark: '#F97316',
  morph: '#3B82F6',
  'nano-gpt': '#6366F1',
  nearai: '#2563EB',
  neuralwatt: '#10A37F',
  nova: '#8B5CF6',
  'ollama-cloud': '#F97316',
  claudinio: '#D97706',
  crof: '#3B82F6',
  'cloudferro-sherlock': '#2563EB',
  poe: '#8B5CF6',
  poolside: '#4F46E5',
  'privatemode-ai': '#3B82F6',
  'regolo-ai': '#6366F1',
  'sap-ai-core': '#008FD3',
  synthetic: '#F97316',
  berget: '#2563EB',
  stackit: '#F97316',
  submodel: '#6366F1',
  'umans-ai-coding-plan': '#4F46E5',
  v0: '#000000',
  venice: '#8B5CF6',
  vivgrid: '#3B82F6',
  xpersona: '#6366F1',
  zenmux: '#4F46E5',
};

// Deterministic color from slug hash — ensures every provider gets a color
function hashColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32-bit int
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 48%)`;
}

/** Returns a hex color for the given provider slug */
export function getProviderColor(slug: string): string {
  const key = slug.toLowerCase();
  return BRAND_COLORS[key] ?? hashColor(key);
}

/** Returns a muted, background-safe variant (lower opacity / lighter) for the given slug */
export function getProviderColorMuted(slug: string): string {
  const hex = getProviderColor(slug);
  // Convert hex to rgba with 0.12 alpha
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

/** Returns a glow/shadow color for the provider */
export function getProviderColorGlow(slug: string): string {
  const hex = getProviderColor(slug);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.4)`;
}
