import { ref } from 'vue';
import type { ModelData, CreatorData, ProviderReference, FamilyData } from '@/types';

export function useCopyModelData() {
  const copied = ref(false);

  function flashCopied() {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  }

  function formatParams(b: number): string {
    if (b >= 1000) return (b / 1000).toFixed(1).replace(/\.0$/, '') + 'T';
    if (b >= 1) return b.toFixed(1).replace(/\.0$/, '') + 'B';
    return (b * 1000).toFixed(0) + 'M';
  }

  function formatCtx(ctx: number | null): string {
    if (!ctx) return '—';
    if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    return `${Math.round(ctx / 1000)}K`;
  }

  /** Copy a single model as markdown */
  function copyModelAsMarkdown(model: ModelData) {
    const dps = [...model.providers].filter((d) => !d._removed);
    const best = dps.find((d) => d.status.result === 'working') || dps[0];
    let md = `## ${model.name}\n\n`;
    if (model.creator) md += `**Creator:** ${model.creator}  \n`;
    if (model.family) md += `**Family:** ${model.family}  \n`;
    if (model.base_model) md += `**Base model:** ${model.base_model}  \n`;
    if (model.derivation_method) md += `**Derivation:** ${model.derivation_method}  \n`;
    md += `**Context:** ${formatCtx(model.best_context)}  \n`;
    if (best) {
      md += `**Params:** ${best.param_count_b ? formatParams(best.param_count_b) : '—'}  \n`;
      if (best.quantization) md += `**Quantization:** ${best.quantization}  \n`;
    }
    md += `**Providers:** ${dps.length} (${dps.filter((d) => d.status.result === 'working').length} working)  \n`;
    const freeCount = dps.filter((d) => d.is_free).length;
    if (freeCount > 0) md += `**Free:** ${freeCount}/${dps.length}  \n`;
    md += `\n| Provider | Status | Context | Params | Quant | Free |\n`;
    md += `|----------|--------|---------|--------|-------|------|\n`;
    for (const d of dps.slice(0, 10)) {
      md += `| ${d.provider} | ${d.status.result} | ${formatCtx(d.context_length)} | ${d.param_count_b ? formatParams(d.param_count_b) : '—'} | ${d.quantization || '—'} | ${d.is_free ? '✓' : ''} |\n`;
    }
    if (dps.length > 10) md += `\n_(${dps.length - 10} more providers not shown)_\n`;
    navigator.clipboard.writeText(md);
    flashCopied();
  }

  /** Copy any object as formatted JSON */
  function copyAsJson(obj: any) {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    flashCopied();
  }

  /** Copy a creator as markdown */
  function copyCreatorAsMarkdown(creator: CreatorData) {
    let md = `# ${creator.name}\n\n`;
    if (creator.type) md += `**Type:** ${creator.type}  \n`;
    if (creator.role) md += `**Role:** ${creator.role}  \n`;
    md += `**Models:** ${creator.model_count} · **Providers:** ${creator.provider_count}  \n`;
    if (creator.description) md += `\n${creator.description}\n`;
    md += `\n| Model | Family | Context | Providers | Working |\n`;
    md += `|-------|--------|---------|-----------|--------|\n`;
    for (const m of creator.models.slice(0, 20)) {
      const working = m.providers.filter(
        (p) => !p._removed && p.status.result === 'working',
      ).length;
      md += `| ${m.name} | ${m.family || '—'} | ${formatCtx(m.best_context)} | ${m.providers.filter((p) => !p._removed).length} | ${working} |\n`;
    }
    if (creator.models.length > 20)
      md += `\n_(${creator.models.length - 20} more models not shown)_\n`;
    navigator.clipboard.writeText(md);
    flashCopied();
  }

  /** Copy a provider as markdown */
  function copyProviderAsMarkdown(provider: ProviderReference, modelCount: number) {
    let md = `# ${provider.name}\n\n`;
    if (provider.provider_type) md += `**Type:** ${provider.provider_type}  \n`;
    if (provider.base_url) md += `**Base URL:** \`${provider.base_url}\`  \n`;
    md += `**Models:** ${modelCount} · **Working:** ${provider.working_count}  \n`;
    md += `**Health:** ${provider.health_status}  \n`;
    if (provider.is_openai_compat) md += `**OpenAI-compatible:** ✓  \n`;
    if (provider.supports_streaming) md += `**Streaming:** ✓  \n`;
    if (provider.max_rpm || provider.max_tpm) {
      const parts = [];
      if (provider.max_rpm) parts.push(`${provider.max_rpm} RPM`);
      if (provider.max_tpm) parts.push(`${provider.max_tpm.toLocaleString()} TPM`);
      md += `**Rate limit:** ${parts.join(' / ')}  \n`;
    }
    if (provider.description) md += `\n${provider.description}\n`;
    navigator.clipboard.writeText(md);
    flashCopied();
  }

  /** Copy family as markdown */
  function copyFamilyAsMarkdown(family: FamilyData) {
    let md = `# ${family.name}\n\n`;
    md += `**Models:** ${family.model_count} · **Providers:** ${family.provider_count}  \n`;
    const working = family.models.filter((m) =>
      m.providers.some((p) => !p._removed && p.status.result === 'working'),
    ).length;
    md += `**Working:** ${working}/${family.model_count}  \n\n`;
    md += `| Model | Creator | Context | Family |\n`;
    md += `|-------|---------|---------|--------|\n`;
    for (const m of family.models.slice(0, 20)) {
      md += `| ${m.name} | ${m.creator || '—'} | ${formatCtx(m.best_context)} | ${m.family || '—'} |\n`;
    }
    navigator.clipboard.writeText(md);
    flashCopied();
  }

  return {
    copied,
    copyModelAsMarkdown,
    copyAsJson,
    copyCreatorAsMarkdown,
    copyProviderAsMarkdown,
    copyFamilyAsMarkdown,
  };
}
