// ── Creator → Country mapping ──
// Keyed by creator ID (slug). Country codes: ISO 3166-1 alpha-2 where possible.

const CREATOR_COUNTRY: Record<string, string> = {
  // ── China ──
  '01-ai': 'CN',
  alibaba: 'CN',
  'alibaba-qwen': 'CN',
  'ascend-tribe': 'CN',
  baai: 'CN',
  baichuan: 'CN',
  baidu: 'CN',
  bytedance: 'CN',
  deepseek: 'CN',
  fishaudio: 'CN',
  'fun-audio-llm': 'CN',
  hidream: 'CN',
  inclusion: 'CN',
  'inclusion-ai': 'CN',
  internlm: 'CN',
  intfloat: 'CN',
  kling: 'CN',
  kwaipilot: 'CN',
  meituan: 'CN',
  'mini-max-ai': 'CN',
  minimax: 'CN',
  moonshot: 'CN',
  'moonshot-ai': 'CN',
  openbmb: 'CN',
  nlper: 'CN',
  qwen: 'CN',
  paddlepaddle: 'CN',
  rwkv: 'CN',
  shibing624: 'CN',
  stepfun: 'CN',
  tencent: 'CN',
  'tongyi-mai': 'CN',
  wan: 'CN',
  xiaomi: 'CN',
  zhipu: 'CN',
  'zhipu-ai': 'CN',

  // ── USA ──
  'abacus-ai': 'US',
  adept: 'US',
  ai2: 'US',
  defog: 'US',
  allenai: 'US',
  amazon: 'US',
  anthropic: 'US',
  apple: 'US',
  arcee: 'US',
  'arcee-ai': 'US',
  'canopy-labs': 'US',
  cloudflare: 'US',
  'cognitive-computations': 'US',
  databricks: 'US',
  eleutherai: 'US',
  elevenlabs: 'US',
  'fal-ai': 'US',
  'fireworks-ai': 'US',
  'github-models': 'US',
  google: 'US',
  groq: 'US',
  gryphe: 'US',
  ibm: 'US',
  ideogram: 'US',
  'index-team': 'US',
  inflection: 'US',
  'inflection-ai': 'US',
  liquid: 'US',
  'liquid-ai': 'US',
  'llm-gateway': 'US', // gateway, but corporate home is US
  'luma-ai': 'US',
  meta: 'US',
  microsoft: 'US',
  morph: 'US',
  mosaicml: 'US',
  'nano-gpt': 'US',
  nexagi: 'US',
  'nex-agi': 'US',
  nous: 'US',
  'nous-research': 'US',
  nova: 'US',
  nvidia: 'US',
  openai: 'US',
  openchat: 'US',
  perplexity: 'US',
  poe: 'US',
  'prime-intellect': 'US',
  primeintellect: 'US',
  'pruna-ai': 'US',
  relace: 'US',
  'resemble-ai': 'US',
  runway: 'US',
  salesforce: 'US',
  sao10k: 'US',
  'sentence-transformers': 'US',
  sesame: 'US',
  teknium: 'US',
  'topaz-labs': 'US',
  'umans-ai': 'US',
  'voyage-ai': 'US',
  writer: 'US',
  xai: 'US',
  zyphra: 'US',

  // ── France ──
  bigscience: 'FR',
  kyutai: 'FR',
  mistral: 'FR',
  'mistral-ai': 'FR',
  poolside: 'FR',

  // ── Germany ──
  'black-forest-labs': 'DE',
  devstral: 'DE',

  // ── Israel ──
  ai21: 'IL',
  'ai21-labs': 'IL',
  aion: 'IL',
  'aion-labs': 'IL',
  bria: 'IL',
  'deci-ai': 'IL',

  // ── UK ──
  recraft: 'GB',
  stability: 'GB',
  'stability-ai': 'GB',

  // ── Canada ──
  cohere: 'CA',

  // ── UAE ──
  core42: 'AE',
  inception: 'AE',
  tii: 'AE',

  // ── South Korea ──
  'lg-ai': 'KR',
  upstage: 'KR',

  // ── India ──
  cogito: 'IN',
  'sarvam-ai': 'IN',

  // ── Japan ──
  'rhymes-ai': 'JP',
  stockmark: 'JP',

  // ── Singapore ──
  reka: 'SG',

  // ── Switzerland ──
  bigcode: 'CH',

  // ── Individual fine-tuners ──
  anthracite: 'UU',
  mancer: 'UU',
  perceptron: 'UU',
  rnj: 'UU',
  thedrummer: 'UU',
  undi95: 'UU',

  // ── Saudi Arabia ──
  sdaia: 'SA',

  // ── Routers / aggregators (not model creators, fallback) ──
  zai: 'XX',

  // ── Unknown / Uncategorized ──
  na: 'XX',
  unidentifiable: 'XX',
  unknown: 'XX',
};

// ── Country display info ──
export interface CountryInfo {
  code: string;
  name: string;
  continent: string;
  color: string; // background
  text: string; // contrast text color
}

const COUNTRIES: Record<string, CountryInfo> = {
  CN: { code: 'CN', name: 'China', continent: 'Asia', color: '#DE2910', text: '#FFFFFF' },
  US: { code: 'US', name: 'USA', continent: 'North America', color: '#3C3B6E', text: '#FFFFFF' },
  FR: { code: 'FR', name: 'France', continent: 'Europe', color: '#002654', text: '#FFFFFF' },
  DE: { code: 'DE', name: 'Germany', continent: 'Europe', color: '#FFCC00', text: '#1A1A1A' },
  IL: { code: 'IL', name: 'Israel', continent: 'Asia', color: '#005EB8', text: '#FFFFFF' },
  GB: { code: 'GB', name: 'UK', continent: 'Europe', color: '#C8102E', text: '#FFFFFF' },
  CA: { code: 'CA', name: 'Canada', continent: 'North America', color: '#D80621', text: '#FFFFFF' },
  AE: { code: 'AE', name: 'UAE', continent: 'Asia', color: '#00732F', text: '#FFFFFF' },
  KR: { code: 'KR', name: 'South Korea', continent: 'Asia', color: '#CD2E3A', text: '#FFFFFF' },
  IN: { code: 'IN', name: 'India', continent: 'Asia', color: '#FF9933', text: '#1A1A1A' },
  JP: { code: 'JP', name: 'Japan', continent: 'Asia', color: '#BC002D', text: '#FFFFFF' },
  SG: { code: 'SG', name: 'Singapore', continent: 'Asia', color: '#ED2939', text: '#FFFFFF' },
  CH: { code: 'CH', name: 'Switzerland', continent: 'Europe', color: '#DA291C', text: '#FFFFFF' },
  SA: { code: 'SA', name: 'Saudi Arabia', continent: 'Asia', color: '#006C35', text: '#FFFFFF' },
  NL: { code: 'NL', name: 'Netherlands', continent: 'Europe', color: '#FF6600', text: '#1A1A1A' },
  UU: { code: 'UU', name: 'User', continent: 'Other', color: '#6366F1', text: '#FFFFFF' },
  XX: { code: 'XX', name: 'Unknown', continent: 'Other', color: '#718096', text: '#FFFFFF' },
};

export const CONTINENTS = ['All', 'Asia', 'Europe', 'North America', 'Other'] as const;

export function getCountryForCreator(creatorId: string): CountryInfo {
  const code = CREATOR_COUNTRY[creatorId] || 'XX';
  return COUNTRIES[code] || COUNTRIES.XX;
}

export function getCountryByCode(code: string): CountryInfo {
  return COUNTRIES[code] || COUNTRIES.XX;
}
