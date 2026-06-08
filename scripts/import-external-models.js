#!/usr/bin/env node
/**
 * import-external-models.js
 * Cross-references external_source_models against super_models and imports
 * matching models as datapoint_models rows with source provenance links.
 *
 * Matching passes (run in DB for performance):
 *   1. Direct: normalize_model_slug(model_name) = super_models.slug
 *   2. Provider-stripped: for provider/model format, strip first segment,
 *      normalize the rest, match against super_models.slug
 *
 * For each match the script finds or creates the right datapoint_models row
 * (keyed on super_model_id + datapoint_provider_id), then adds a provenance
 * link in datapoint_model_sources.
 *
 * Usage: node scripts/import-external-models.js [--apply]
 *   --apply  : Create datapoint_models + source links (default: dry-run)
 */

require('dotenv').config();
const pool = require('../server/db');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');

// ── Creator name humanization ──
// Whitelist: HuggingFace org slug → proper display name
const CREATOR_WHITELIST = new Map([
  // Major AI labs
  ['ai21labs', 'AI21 Labs'],
  ['meta-llama', 'Meta'],
  ['mistralai', 'Mistral AI'],
  ['deepseek-ai', 'DeepSeek'],
  ['qwen', 'Alibaba'],
  ['google', 'Google'],
  ['nvidia', 'NVIDIA'],
  ['microsoft', 'Microsoft'],
  ['openai', 'OpenAI'],
  ['cohere', 'Cohere'],
  ['anthropic', 'Anthropic'],
  ['ibm', 'IBM'],
  ['intel', 'Intel'],
  ['amazon', 'Amazon'],
  ['baidu', 'Baidu'],
  ['bytedance', 'ByteDance'],
  ['alibaba', 'Alibaba'],
  ['tencent', 'Tencent'],
  ['apple', 'Apple'],
  ['samsung', 'Samsung'],
  ['oracle', 'Oracle'],
  ['salesforce', 'Salesforce'],
  ['databricks', 'Databricks'],
  ['stabilityai', 'Stability AI'],
  ['upstage', 'Upstage'],
  ['writer', 'Writer'],
  ['togethercomputer', 'Together AI'],
  ['xai', 'xAI'],
  ['x-ai', 'xAI'],
  ['01-ai', '01.AI'],
  ['abacusai', 'Abacus AI'],
  ['yandex', 'Yandex'],
  ['sberbank', 'Sber'],
  ['h2o', 'H2O.ai'],
  ['tii', 'TII'],
  ['tiiuae', 'TII'],
  ['rhymes-ai', 'Rhymes AI'],
  // Common HuggingFace orgs
  ['cognitivecomputations', 'Cognitive Computations'],
  ['princeton-nlp', 'Princeton NLP'],
  ['siliconflow-cn', 'SiliconFlow'],
  ['siliconflow', 'SiliconFlow'],
  ['arcee-ai', 'Arcee AI'],
  ['ibm-granite', 'IBM'],
  ['black-forest-labs', 'Black Forest Labs'],
  ['sentence-transformers', 'Sentence Transformers'],
  ['github-models', 'GitHub Models'],
  ['anthracite-org', 'Anthracite'],
  ['mergekit-community', 'MergeKit Community'],
  ['allura-org', 'Allura'],
  ['huihui-ai', 'Huihui AI'],
  ['zai-org', 'Z.AI'],
  ['kaist-ai', 'KAIST AI'],
  ['openai-community', 'OpenAI Community'],
  ['llm360', 'LLM360'],
  ['llmgateway', 'LLM Gateway'],
  ['opencode', 'OpenCode'],
  ['ontocord', 'Ontocord'],
  ['inception', 'Inception AI'],
  ['mbzuai', 'MBZUAI'],
  ['kaist', 'KAIST'],
  ['etri', 'ETRI'],
  ['tsinghua', 'Tsinghua University'],
  ['pku', 'Peking University'],
  ['sail', 'SAIL'],
  ['llama', 'Meta'],
  // Already-proper names (prevent camelCase splitting)
  ['OpenAI', 'OpenAI'],
  ['DeepSeek', 'DeepSeek'],
  ['xAI', 'xAI'],
  ['ByteDance', 'ByteDance'],
  ['MiniMax', 'MiniMax'],
]);

/** Humanize a HuggingFace org/user slug into a display name */
function humanizeCreator(raw) {
  // Whitelist first
  if (CREATOR_WHITELIST.has(raw)) return CREATOR_WHITELIST.get(raw);

  // Split on hyphens/underscores → capitalize
  if (/[-_]/.test(raw)) {
    return raw
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Detect camelCase boundaries in mixed-case names
  if (/[A-Z]/.test(raw) && /[a-z]/.test(raw)) {
    return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  // All lowercase, no separators — likely a username, return as-is
  return raw;
}

// ── Architecture → creator mapping for fine-tuned models ──
const ARCH_CREATOR = {
  LlamaForCausalLM: 'Meta',
  LlamaForRewardModelWithGating: 'Meta',
  LlamaForSequenceClassification: 'Meta',
  LlamaMedITForCausalLM: 'Meta',
  MllamaForConditionalGeneration: 'Meta',
  OPTForCausalLM: 'Meta',
  Qwen2ForCausalLM: 'Alibaba',
  Qwen2Model: 'Alibaba',
  Qwen2MoeForCausalLM: 'Alibaba',
  Qwen2ForSequenceClassification: 'Alibaba',
  Qwen2VLForConditionalGeneration: 'Alibaba',
  Qwen2ForCausalRM: 'Alibaba',
  MistralForCausalLM: 'Mistral AI',
  MixtralForCausalLM: 'Mistral AI',
  GemmaForCausalLM: 'Google',
  Gemma2ForCausalLM: 'Google',
  Gemma2ForSequenceClassification: 'Google',
  GemmaModel: 'Google',
  RecurrentGemmaForCausalLM: 'Google',
  T5ForConditionalGeneration: 'Google',
  MT5ForConditionalGeneration: 'Google',
  UMT5ForConditionalGeneration: 'Google',
  SwitchTransformersForConditionalGeneration: 'Google',
  PhiForCausalLM: 'Microsoft',
  Phi3ForCausalLM: 'Microsoft',
  Phi3SmallForCausalLM: 'Microsoft',
  NovaForCausalLM: 'Microsoft',
  GraniteForCausalLM: 'IBM',
  GraniteMoeForCausalLM: 'IBM',
  CohereForCausalLM: 'Cohere',
  Cohere2ForCausalLM: 'Cohere',
  StableLmForCausalLM: 'Stability AI',
  InternLM2ForCausalLM: 'InternLM',
  NemotronForCausalLM: 'NVIDIA',
  HymbaForCausalLM: 'NVIDIA',
  BloomForCausalLM: 'BigScience',
  FalconForCausalLM: 'TII',
  FalconMambaForCausalLM: 'TII',
  Starcoder2ForCausalLM: 'BigCode',
  ExaoneForCausalLM: 'LG AI',
  DeepseekForCausalLM: 'DeepSeek',
  OlmoForCausalLM: 'AI2',
  Olmo2ForCausalLM: 'AI2',
  OlmoeForCausalLM: 'AI2',
  GlmForCausalLM: 'Zhipu AI',
  ChatGLMModel: 'Zhipu AI',
  ChatGLMModelM: 'Zhipu AI',
  DbrxForCausalLM: 'Databricks',
  JambaForCausalLM: 'AI21 Labs',
  SolarForCausalLM: 'Upstage',
  RwkvForCausalLM: 'RWKV',
  HeliumForCausalLM: 'Kyutai',
  DeciLMForCausalLM: 'Deci AI',
  MPTForCausalLM: 'MosaicML',
  OpenLMModel: 'Apple',
  AriaForConditionalGeneration: 'Rhymes AI',
  GPTNeoXForCausalLM: 'EleutherAI',
  GPTJForCausalLM: 'EleutherAI',
  GPTNeoForCausalLM: 'EleutherAI',
  GPT2LMHeadModel: 'OpenAI',
};

(async () => {
  const client = await pool.connect();
  try {
    // ── Load external models (only with mapped providers) ──
    const { rows: extRows } = await client.query(`
      SELECT esm.id AS ext_id, esm.model_name, esm.source_id,
             esp.external_name AS ext_provider, esp.mapped_slug,
             s.name AS source_name
      FROM external_source_models esm
      JOIN external_source_providers esp ON esp.id = esm.external_source_provider_id
      JOIN sources s ON s.id = esm.source_id
      WHERE esp.mapped_slug IS NOT NULL
    `);
    logger.info(`Loaded ${extRows.length} external models with mapped providers`);

    // ── Pass 1: Direct slug match ──
    const { rows: p1 } = await client.query(`
      SELECT esm.id AS ext_id, esm.model_name, esm.source_id,
             sm.id AS super_id, sm.slug AS super_slug, sm.name AS super_name,
             dp.id AS dp_id, dp.slug AS dp_slug
      FROM external_source_models esm
      JOIN external_source_providers esp ON esp.id = esm.external_source_provider_id
      JOIN super_models sm ON sm.slug = normalize_model_slug(esm.model_name)
      JOIN datapoint_providers dp ON dp.slug = esp.mapped_slug
    `);
    logger.info(`Pass 1 (direct slug): ${p1.length} matched`);

    // ── Pass 2: Provider-stripped match ──
    const { rows: p2 } = await client.query(`
      WITH unmatched AS (
        SELECT esm.id AS ext_id, esm.model_name, esm.source_id, esp.mapped_slug,
               regexp_replace(esm.model_name, '^[^/]+/', '') AS model_part
        FROM external_source_models esm
        JOIN external_source_providers esp ON esp.id = esm.external_source_provider_id
        WHERE esp.mapped_slug IS NOT NULL
          AND esm.model_name LIKE '%/_%' ESCAPE '\\'
          AND NOT EXISTS (
            SELECT 1 FROM super_models sm2
            WHERE sm2.slug = normalize_model_slug(esm.model_name)
          )
      )
      SELECT u.ext_id, u.model_name, u.source_id, u.model_part, u.mapped_slug,
             sm.id AS super_id, sm.slug AS super_slug, sm.name AS super_name,
             dp.id AS dp_id, dp.slug AS dp_slug
      FROM unmatched u
      JOIN super_models sm ON sm.slug = normalize_model_slug(u.model_part)
      JOIN datapoint_providers dp ON dp.slug = u.mapped_slug
    `);
    logger.info(`Pass 2 (stripped provider): ${p2.length} additional matched`);

    // ── Pass 3: Strip routing prefixes (~provider/, @cf/org/, Pro/) ──
    const { rows: p3 } = await client.query(`
      WITH strip_routing AS (
        SELECT esm.id AS ext_id, esm.model_name, esm.source_id, esp.mapped_slug,
               regexp_replace(
                 regexp_replace(
                   regexp_replace(esm.model_name, '^~[^/]+/', ''),
                   '^@cf/[^/]+/', ''
                 ), '^Pro/', ''
               ) AS clean_name
        FROM external_source_models esm
        JOIN external_source_providers esp ON esp.id = esm.external_source_provider_id
        WHERE esp.mapped_slug IS NOT NULL
          AND (esm.model_name LIKE '~%' OR esm.model_name LIKE '%@cf/%' OR esm.model_name LIKE 'Pro/%')
          AND NOT EXISTS (
            SELECT 1 FROM super_models sm2
            WHERE sm2.slug = normalize_model_slug(esm.model_name)
          )
          AND NOT EXISTS (
            SELECT 1 FROM super_models sm3
            WHERE sm3.slug = normalize_model_slug(
              regexp_replace(esm.model_name, '^[^/]+/', '')
            )
          )
      )
      SELECT sr.ext_id, sr.model_name, sr.source_id, sr.clean_name, sr.mapped_slug,
             sm.id AS super_id, sm.slug AS super_slug, sm.name AS super_name,
             dp.id AS dp_id, dp.slug AS dp_slug
      FROM strip_routing sr
      JOIN super_models sm ON sm.slug = normalize_model_slug(sr.clean_name)
      JOIN datapoint_providers dp ON dp.slug = sr.mapped_slug
    `);
    logger.info(`Pass 3 (routing prefix stripped): ${p3.length} additional matched`);

    const matched = [...p1, ...p2, ...p3];
    const unmatched = extRows.length - matched.length;
    logger.info(`Total matched: ${matched.length}  Unmatched: ${unmatched}`);

    if (matched.length === 0) {
      logger.info('Nothing to import.');
      return;
    }

    // ── Check existing datapoint_models ──
    const superIds = [...new Set(matched.map((r) => r.super_id))];
    const { rows: existingDps } = await client.query(`
      SELECT dm.id, dm.super_model_id, dm.datapoint_provider_id
      FROM datapoint_models dm
      WHERE dm.super_model_id = ANY($1) AND dm.is_removed = false
    `, [superIds]);

    const dpByKey = new Map();
    for (const r of existingDps) {
      dpByKey.set(`${r.super_model_id}|${r.datapoint_provider_id}`, r.id);
    }

    // ── Check existing source links ──
    const allDpIds = existingDps.map((r) => r.id);
    const existingLinks = new Set();
    if (allDpIds.length > 0) {
      const { rows: links } = await client.query(
        'SELECT datapoint_model_id, source_id FROM datapoint_model_sources WHERE datapoint_model_id = ANY($1)',
        [allDpIds],
      );
      for (const l of links) {
        existingLinks.add(`${l.datapoint_model_id}|${l.source_id}`);
      }
    }

    // ── Categorize matches ──
    const needDp = [];
    const needLink = [];
    let haveBoth = 0;

    for (const m of matched) {
      const key = `${m.super_id}|${m.dp_id}`;
      const dmId = dpByKey.get(key);
      if (dmId) {
        if (existingLinks.has(`${dmId}|${m.source_id}`)) {
          haveBoth++;
        } else {
          needLink.push({ dm_id: dmId, source_id: m.source_id, ...m });
        }
      } else {
        needDp.push(m);
      }
    }

    logger.info(`\nSummary:`);
    logger.info(`  Already complete (dp + link): ${haveBoth}`);
    logger.info(`  Need source link only:        ${needLink.length}`);
    logger.info(`  Need new datapoint + link:    ${needDp.length}`);

    if (needDp.length > 0) {
      logger.info(`\n  Models needing new datapoint_models (up to 30):`);
      for (const m of needDp.slice(0, 30)) {
        logger.info(`    + ${m.dp_slug}/${m.model_name || m.ext_id}  →  ${m.super_name}`);
      }
      if (needDp.length > 30) logger.info(`    ... and ${needDp.length - 30} more`);
    }

        // ── Backfill creator on super_models from org/model names ──
    // Load architectures for fallback when the org looks like a username
    const { rows: archRows } = await client.query(`
      SELECT id, model_limits::jsonb ->> 'architecture' AS arch
      FROM external_source_models
      WHERE id = ANY($1) AND model_limits ~ '^\\\\{'
    `, [matched.map((m) => m.ext_id)]);
    const archByExtId = new Map(archRows.map((r) => [r.id, r.arch]));

    const creatorUpdates = [];
    for (const m of matched) {
      const slashIdx = m.model_name.indexOf('/');
      if (slashIdx > 0 && slashIdx < m.model_name.length - 1) {
        const rawCreator = m.model_name.slice(0, slashIdx);
        const creator = humanizeCreator(rawCreator);
        // Determine base creator from architecture
        let baseCreator = null;
        if (m.ext_id) {
          const arch = archByExtId.get(m.ext_id);
          if (arch && ARCH_CREATOR[arch] && ARCH_CREATOR[arch] !== creator) {
            baseCreator = ARCH_CREATOR[arch];
          }
        }
        creatorUpdates.push({ super_id: m.super_id, creator, base_creator: baseCreator });
      }
    }
    const seen = new Set();
    const uniqueCreators = creatorUpdates.filter((c) => {
      if (seen.has(c.super_id)) return false;
      seen.add(c.super_id);
      return true;
    });
    logger.info(`  Creator candidates: ${uniqueCreators.length}`);

    if (!APPLY) {
      logger.info('\nDry-run mode. Use --apply to apply.');
      return;
    }

    // ── Apply ──
    const { rows: provRows } = await client.query('SELECT id, slug FROM datapoint_providers');
    const provMap = new Map(provRows.map((r) => [r.slug, r.id]));

    let createdDp = 0;
    let createdLinks = 0;
    let creatorsSet = 0;

    // Backfill creator + base_creator on super_models where null
    for (const c of uniqueCreators) {
      const { rowCount } = await client.query(
        `UPDATE super_models
         SET creator = $2, base_creator = COALESCE(base_creator, $3)
         WHERE id = $1 AND creator IS NULL`,
        [c.super_id, c.creator, c.base_creator],
      );
      creatorsSet += rowCount;
    }
    if (creatorsSet > 0) logger.info(`  Set creator on ${creatorsSet} super_models`);

    await client.query('BEGIN');

    try {
      // Create datapoint_models for needed
      for (const m of needDp) {
        const providerId = provMap.get(m.dp_slug);
        if (!providerId) continue;

        const modelInstanceKey = m.model_name || m.ext_id;
        const fullId = `${m.dp_slug}/${modelInstanceKey}`;
        try {
          await client.query(`
            INSERT INTO datapoint_models
              (super_model_id, datapoint_provider_id, model_instance_key, full_id, is_free, is_removed)
            VALUES ($1, $2, $3, $4, true, false)
            ON CONFLICT (datapoint_provider_id, model_instance_key) DO NOTHING
          `, [m.super_id, providerId, modelInstanceKey, fullId]);
          createdDp++;
        } catch (e) {
          logger.error(`  Failed datapoint ${fullId}: ${e.message}`);
        }
      }

      // Refresh dp lookup after inserts
      const { rows: freshDps } = await client.query(`
        SELECT dm.id, dm.super_model_id, dm.datapoint_provider_id
        FROM datapoint_models dm
        WHERE dm.super_model_id = ANY($1) AND dm.is_removed = false
      `, [superIds]);

      const freshByKey = new Map();
      for (const r of freshDps) {
        freshByKey.set(`${r.super_model_id}|${r.datapoint_provider_id}`, r.id);
      }

      // Create source links
      const allNeedsLinks = [
        ...needLink.map((m) => ({ dm_id: m.dm_id, source_id: m.source_id })),
        ...needDp.map((m) => {
          const key = `${m.super_id}|${provMap.get(m.dp_slug)}`;
          return { dm_id: freshByKey.get(key), source_id: m.source_id };
        }).filter((l) => l.dm_id),
      ];

      for (const l of allNeedsLinks) {
        try {
          const res = await client.query(`
            INSERT INTO datapoint_model_sources (datapoint_model_id, source_id)
            VALUES ($1, $2)
            ON CONFLICT (datapoint_model_id, source_id) DO NOTHING
          `, [l.dm_id, l.source_id]);
          if (res.rowCount > 0) createdLinks++;
        } catch (e) {
          logger.error(`  Failed link dm=${l.dm_id} src=${l.source_id}: ${e.message}`);
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    logger.info(`\nCreated ${createdDp} new datapoint_models`);
    logger.info(`Created ${createdLinks} new source links`);

    const { rows: verify } = await client.query('SELECT COUNT(*) AS n FROM datapoint_model_sources');
    logger.info(`Total provenance links in DB: ${verify[0].n}`);
    logger.info('Done.');
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
