// ── Creator → Country mapping ──
// Keyed by creator ID (slug). Country codes: ISO 3166-1 alpha-2 where possible.

const CREATOR_COUNTRY: Record<string, string> = {
  // ── China ──
  '01-ai': 'CN',
  'alibaba-qwen': 'CN',
  'ascend-tribe': 'CN',
  'baai': 'CN',
  'baichuan': 'CN',
  'baidu': 'CN',
  'bytedance': 'CN',
  'deepseek': 'CN',
  'fishaudio': 'CN',
  'fun-audio-llm': 'CN',
  'inclusion': 'CN',
  'internlm': 'CN',
  'intfloat': 'CN',
  'kwaipilot': 'CN',
  'mini-max-ai': 'CN',
  'minimax': 'CN',
  'moonshot': 'CN',
  'nlper': 'CN',
  'paddlepaddle': 'CN',
  'shibing624': 'CN',
  'stepfun': 'CN',
  'tencent': 'CN',
  'tongyi-mai': 'CN',
  'wan': 'CN',
  'xiaomi': 'CN',
  'zai': 'CN',
  'zhipu': 'CN',

  // ── USA ──
  'abacus-ai': 'US',
  'ai2': 'US',
  'anthropic': 'US',
  'arcee': 'US',
  'canopy-labs': 'US',
  'cognitive-computations': 'US',
  'databricks': 'US',
  'google': 'US',
  'groq': 'US',
  'gryphe': 'US',
  'ibm': 'US',
  'index-team': 'US',
  'liquid': 'US',
  // 'llm-gateway': router, not a creator
  'meta': 'US',
  'microsoft': 'US',
  'mosaicml': 'US',
  'nexagi': 'US',
  'nous': 'US',
  'nova': 'US',
  // 'novita-ai': router, not a creator
  'nvidia': 'US',
  'openai': 'US',
  // 'opencode': router, not a creator
  'openchat': 'US',
  // 'openrouter': router, not a creator
  'perplexity': 'US',
  'pruna-ai': 'US',
  'resemble-ai': 'US',
  'ring': 'US',
  'sao10k': 'US',
  'sentence-transformers': 'US',
  'sesame': 'US',
  'umans-ai': 'US',
  'xai': 'US',

  // ── France ──
  'mistral': 'FR',
  'poolside': 'FR',

  // ── Germany ──
  'black-forest-labs': 'DE',
  'devstral': 'DE',

  // ── Israel ──
  'ai21': 'IL',
  'bria': 'IL',

  // ── UK ──
  'stability': 'GB',

  // ── Canada ──
  'cohere': 'CA',

  // ── UAE ──
  'core42': 'AE',
  'tii': 'AE',

  // ── South Korea ──
  'upstage': 'KR',

  // ── India ──
  'sarvam-ai': 'IN',

  // ── Unknown / Uncategorized ──
  'unknown': 'XX',
};

// ── Country display info ──
export interface CountryInfo {
  code: string;
  name: string;
  continent: string;
  color: string; // background
  text: string;  // contrast text color
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
