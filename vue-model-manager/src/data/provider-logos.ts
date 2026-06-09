// Maps provider/creator slugs to AA-downloaded logo files.
// Logos from https://artificialanalysis.ai/img/logos/
// Falls back to inline SVG (provider-icons.ts) when no logo exists.

const LOGO_MAP: Record<string, string | null> = {
  // Major AI labs — SVGs
  anthropic: '/logos/anthropic.svg',
  openai: '/logos/openai.svg',
  google: '/logos/google.svg',
  meta: '/logos/meta.svg',
  deepseek: '/logos/deepseek.svg',
  xai: '/logos/xai.svg',
  nvidia: '/logos/nvidia.svg',
  cohere: '/logos/cohere.svg',
  alibaba: '/logos/alibaba.svg',
  ibm: '/logos/ibm.svg',
  microsoft: '/logos/microsoft.svg',
  aws: '/logos/aws.svg',
  apple: '/logos/apple.svg',
  minimax: '/logos/minimax.svg',
  zai: '/logos/zai.svg',
  stepfun: '/logos/stepfun.svg',
  ai21: '/logos/ai21.svg',
  tii: '/logos/tii.svg',
  reka: '/logos/reka.svg',
  arcee: '/logos/arcee.svg',
  upstage: '/logos/upstage.svg',
  liquidai: '/logos/liquidai.svg',
  'prime-intellect': '/logos/prime-intellect.svg',
  bytedance: '/logos/bytedance.svg',
  tencent: '/logos/tencent.svg',
  xiaomi: '/logos/xiaomi.svg',
  baidu: '/logos/baidu.svg',
  // PNG fallbacks
  mistral: '/logos/mistral.png',
  perplexity: '/logos/perplexity.png',
  lg: '/logos/lg.png',
  // Aliases (same company, different slug)
  'alibaba-cn': '/logos/alibaba.svg',
  'alibaba-coding-plan': '/logos/alibaba.svg',
  'alibaba-coding-plan-cn': '/logos/alibaba.svg',
  'alibaba-token-plan': '/logos/alibaba.svg',
  qwen: '/logos/alibaba.svg',
  groq: null, // no AA logo available
  cerebras: null,
  together: null,
  huggingface: null,
  openrouter: null,
};

export function getProviderLogoUrl(slug: string): string | null {
  return LOGO_MAP[slug] ?? null;
}
