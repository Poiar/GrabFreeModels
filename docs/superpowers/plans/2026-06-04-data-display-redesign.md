# Data Display Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat model list with creator-first hierarchical data, model cards with provider strips, and Mastra-style comparison tables across 5 new views.

**Architecture:** Hierarchical API response (`creators[]` → `models[]` → `providers[]`) built in `build-models-data.js`, consumed by rewritten Pinia store, displayed via new Vue components. 7 old views removed, 4 new views added.

**Tech Stack:** Node.js (CJS), Express, Neon Postgres, Vue 3 + Pinia + vue-router (hash mode), TypeScript, CSS custom properties.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `vue-model-manager/src/types.ts` | Add CreatorData, ModelData, ProviderReference; update ModelsData |
| Modify | `scripts/build-models-data.js` | Restructure from flat array to creators hierarchy + provider references |
| Modify | `vue-model-manager/src/store/models.ts` | Consume new hierarchical data shape |
| Modify | `vue-model-manager/src/router.ts` | New routes for /, /dashboard, /creators, /creator/:id |
| Modify | `vue-model-manager/src/App.vue` | New navigation links |
| Create | `vue-model-manager/src/views/ModelList.vue` | New main landing page (model cards + provider strips) |
| Create | `vue-model-manager/src/components/ModelCard.vue` | Model card component with provider strip |
| Create | `vue-model-manager/src/components/ProviderBlock.vue` | Single provider block (name, context, tools, pricing, status) |
| Create | `vue-model-manager/src/components/ProviderStrip.vue` | Row of ProviderBlocks with overflow handling |
| Create | `vue-model-manager/src/components/ProviderTable.vue` | Mastra-style dense comparison table for detail panel |
| Create | `vue-model-manager/src/components/ModelDetailPanel.vue` | Slide-out model detail with provider comparison table |
| Create | `vue-model-manager/src/views/NewDashboard.vue` | Redesigned ecosystem overview |
| Create | `vue-model-manager/src/views/CreatorList.vue` | Grid of creator cards |
| Create | `vue-model-manager/src/views/CreatorDetail.vue` | Creator detail with model table |
| Create | `vue-model-manager/src/views/Issues.vue` | Copy from existing Issues.vue (unchanged) |
| Delete | `vue-model-manager/src/views/Dashboard.vue` | Replaced by NewDashboard.vue |
| Delete | `vue-model-manager/src/views/Free.vue` | Replaced by Free toggle on ModelList |
| Delete | `vue-model-manager/src/views/Paid.vue` | Replaced by Free toggle on ModelList |
| Delete | `vue-model-manager/src/views/All.vue` | Replaced by ModelList.vue |
| Delete | `vue-model-manager/src/views/SuperModels.vue` | Replaced by ModelList.vue |
| Delete | `vue-model-manager/src/views/SuperModel.vue` | Replaced by ModelDetailPanel.vue |
| Delete | `vue-model-manager/src/views/Family.vue` | Replaced by CreatorList.vue |
| Delete | `vue-model-manager/src/views/Author.vue` | Replaced by CreatorList.vue |
| Delete | `vue-model-manager/src/components/ModelDetail.vue` | Replaced by ModelDetailPanel.vue |
| Delete | `vue-model-manager/src/components/QueryBuilder.vue` | Replaced by simple filter chips |
| Delete | `vue-model-manager/src/components/MultiSelect.vue` | No longer needed |
| Delete | `vue-model-manager/src/composables/useJqlFilter.ts` | No longer needed |

---

### Task 1: New TypeScript Types

**Files:**
- Modify: `vue-model-manager/src/types.ts`

- [ ] **Step 1: Add new interfaces and update ModelsData**

Replace the entire `types.ts` file with the updated version. The old types remain for backward compat during migration (DatapointModel, SuperModel, etc.) but the new hierarchical types are added and ModelsData is updated.

```typescript
// ── New hierarchical types ──

export interface ProviderDatapoint {
  full_id: string
  provider: string            // display name (e.g., "OpenRouter")
  provider_slug: string       // slug (e.g., "openrouter")
  context_length: number | null
  input_price_per_million: number
  output_price_per_million: number
  is_free: boolean
  supports_tools: boolean | null
  supports_reasoning: boolean | null
  output_limit: number | null
  temperature: boolean | null
  open_weights: boolean | null
  tags: string[]
  best_for: string[]
  input_types: string[]
  output_types: string[]
  status: ModelStatus
  last_success: string | null
  _removed: boolean
  _removedDate?: string
  notes?: string
  priority_score: number | null
}

export interface ModelData {
  super_id: number
  name: string
  slug: string
  family: string | null
  best_for: string[]
  best_context: number
  cheapest_input_price: number
  cheapest_output_price: number
  role_rankings: Record<string, number>
  providers: ProviderDatapoint[]
}

export interface CreatorData {
  id: string                  // normalized slug
  name: string                // original display name
  model_count: number
  provider_count: number
  models: ModelData[]
}

export interface ProviderReference {
  id: string
  slug: string
  name: string
  base_url: string
  model_count: number
  working_count: number
  health_status: string
}

export interface ModelsData {
  creators: CreatorData[]
  providers: ProviderReference[]
  _test_summary: TestSummary
  _role_rankings: {
    description: string
    model: string[]
    build: string[]
    general: string[]
    small_model: string[]
    explore: string[]
    stable: string[]
    _scores?: Record<string, RoleScore[]>
    _meta?: Record<string, RoleMeta>
  }
  _model_scores: ModelScoresData
  _provider_usage: {
    description: string
    [provider: string]: ProviderUsage | string
  }
  _known_issues: {
    description: string
    issues: KnownIssue[]
  }
  _validation_method: ValidationMethod
}

// ── Existing types (kept for backward compat) ──

export interface ModelStatus {
  tested: string | null
  result: 'working' | 'broken' | 'rate_limited' | 'untested' | 'not_found' | 'paid'
  detail: string
}

/** @deprecated Use DatapointModel */
export type Model = DatapointModel;

export interface DatapointModel {
  id: string
  super_id: number
  super_name: string
  name: string
  provider: string
  author: string | null
  source: string
  context_length: number | null
  input_price_per_million: number
  output_price_per_million: number
  is_free: boolean
  supports_tools: boolean | null
  supports_reasoning: boolean | null
  output_limit: number | null
  temperature: boolean | null
  open_weights: boolean | null
  family: string | null
  knowledge_cutoff: string | null
  releaseDate: string | null
  lastUpdated: string | null
  tags: string[]
  best_for: string[]
  input_types: string[]
  output_types: string[]
  status: ModelStatus
  last_success: string | null
  _removed: boolean
  _removedDate?: string
  notes?: string
  priority_score: number | null
}

export interface SuperModel {
  id: number
  name: string
  datapoints: DatapointModel[]
  best_context_length: number | null
  any_working: boolean
  any_tools: boolean
  providers: string[]
  all_free: boolean
  sources: string[]
}

export interface TestSummary {
  date: string
  results: {
    working: string[]
    broken: string[]
    untested: string[]
    rate_limited: string[]
    not_found: string[]
    untestable: string[]
    schema_issues: string[]
  }
}

export interface KnownIssue {
  model_id: string
  issue: string
  impact: string
  workaround: string
  severity: 'low' | 'moderate' | 'high' | 'critical'
  reported: string
  last_verified: string
}

export interface ProviderHealth {
  working: number
  rate_limited: number
  broken: number
  total: number
}

export interface ProviderUsage {
  month: string
  reason: string
}

export interface ValidationMethod {
  description: string
  procedure: string
  date: string
  key_findings: Record<string, string>
}

export interface RoleScore {
  id: string
  score: number
  ctx: number
  ctxScore: number
  ctxWeight: number
  ctxContrib: number
  tagBonus: number
  tagPenalty: number
  penaltyContrib: number
  nameSizePenalty: number
  matchedTags: string[]
  matchedPenaltyTags: string[]
}

export interface RoleMeta {
  description: string
  ctxWeight: number
  tagKeywords: string[]
  tagPenaltyKeywords: string[]
  nameSizePenalty: boolean
  maxCtx: number | null
  needsTools: boolean
}

export interface ModelScore {
  source: string
  score_type: string
  score_value: number | null
}

export interface ModelScoresData {
  description: string
  sources: string[]
  scores: Record<string, ModelScore[]>
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd vue-model-manager && npx vue-tsc --noEmit`
Expected: No errors related to types.ts (existing views may have errors but that's expected since we'll delete them later).

- [ ] **Step 3: Commit**

```bash
git add vue-model-manager/src/types.ts
git commit -m "types: add hierarchical CreatorData, ModelData, ProviderReference types"
```

---

### Task 2: Restructure Data Builder

**Files:**
- Modify: `scripts/build-models-data.js`

- [ ] **Step 1: Rewrite build-models-data.js to produce hierarchical output**

Replace the function body (keep the signature and query setup). After the existing datapoint construction loop (line 121), replace the return block (lines 148-164) with this new hierarchy-building code:

```javascript
// ── After the existing loop that builds outputModels, add: ──

// Creator slug normalization
const AUTHOR_OVERRIDES = {
  'google llc': { id: 'google', name: 'Google' },
  'google': { id: 'google', name: 'Google' },
  'meta platforms, inc.': { id: 'meta', name: 'Meta' },
  'meta platforms inc.': { id: 'meta', name: 'Meta' },
  'meta': { id: 'meta', name: 'Meta' },
  'anthropic': { id: 'anthropic', name: 'Anthropic' },
  'anthropic, pbc': { id: 'anthropic', name: 'Anthropic' },
  'openai': { id: 'openai', name: 'OpenAI' },
  'openai, llc.': { id: 'openai', name: 'OpenAI' },
  'mistral ai': { id: 'mistral', name: 'Mistral' },
  'mistral ai, pbc': { id: 'mistral', name: 'Mistral' },
  'deepseek': { id: 'deepseek', name: 'DeepSeek' },
  'alibaba group': { id: 'alibaba', name: 'Alibaba' },
  'alibaba cloud': { id: 'alibaba', name: 'Alibaba' },
  'nvidia': { id: 'nvidia', name: 'NVIDIA' },
  'nvidia corporation': { id: 'nvidia', name: 'NVIDIA' },
  'cohere': { id: 'cohere', name: 'Cohere' },
  'cohere inc.': { id: 'cohere', name: 'Cohere' },
  'microsoft': { id: 'microsoft', name: 'Microsoft' },
  'microsoft corporation': { id: 'microsoft', name: 'Microsoft' },
  'xai': { id: 'xai', name: 'xAI' },
  'xai corp': { id: 'xai', name: 'xAI' },
  'zhipu ai': { id: 'zhipu', name: 'Zhipu AI' },
  '01-ai': { id: '01-ai', name: '01.AI' },
  'minimax': { id: 'minimax', name: 'MiniMax' },
  'minimax group': { id: 'minimax', name: 'MiniMax' },
  'moonshot ai': { id: 'moonshot', name: 'Moonshot AI' },
  'stepfun': { id: 'stepfun', name: 'StepFun' },
  'bytedance': { id: 'bytedance', name: 'ByteDance' },
  'tencent': { id: 'tencent', name: 'Tencent' },
  'tencent cloud': { id: 'tencent', name: 'Tencent' },
  'baidu': { id: 'baidu', name: 'Baidu' },
  'inflection ai': { id: 'inflection', name: 'Inflection' },
  'stability ai': { id: 'stability', name: 'Stability AI' },
  'eleutherai': { id: 'eleutherai', name: 'EleutherAI' },
  'qwq': { id: 'qwen', name: 'Qwen' },
  'qwen': { id: 'qwen', name: 'Qwen' },
  'alibaba tongyi lab': { id: 'qwen', name: 'Qwen' },
};

const LEGAL_SUFFIX_RE = /\s*\b(llc|inc\.?|ltd\.?|corp\.?|pbc|co\.?|group|holdings)\b\.?$/gi;

function slugifyAuthor(raw) {
  if (!raw) return 'unknown';
  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();
  // Check override map first
  if (AUTHOR_OVERRIDES[lowered]) return AUTHOR_OVERRIDES[lowered];
  // Generic slugify: strip legal suffixes, lowercase, replace non-alphanum with hyphens
  const cleaned = lowered.replace(LEGAL_SUFFIX_RE, '').trim();
  const slug = cleaned.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { id: slug || 'unknown', name: trimmed };
}

// Group by creator → super_model → providers
const creatorMap = new Map();
const roleRankingsRaw = meta._role_rankings || {};

for (const dp of outputModels) {
  if (dp._removed) continue;
  
  const authorInfo = slugifyAuthor(dp.author);
  const creatorId = authorInfo.id;
  
  if (!creatorMap.has(creatorId)) {
    creatorMap.set(creatorId, {
      id: creatorId,
      name: authorInfo.name,
      modelMap: new Map(),
    });
  }
  const creator = creatorMap.get(creatorId);
  
  // Update creator name if we find a better (longer) one
  if (authorInfo.name.length > creator.name.length) {
    creator.name = authorInfo.name;
  }
  
  if (!creator.modelMap.has(dp.super_id)) {
    creator.modelMap.set(dp.super_id, {
      super_id: dp.super_id,
      name: dp.super_name,
      slug: (dp.super_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      family: dp.family,
      best_for: [...(dp.best_for || [])],
      best_context: dp.context_length || 0,
      cheapest_input_price: dp.input_price_per_million,
      cheapest_output_price: dp.output_price_per_million,
      providers: [],
    });
  }
  const model = creator.modelMap.get(dp.super_id);
  model.providers.push({
    full_id: dp.id,
    provider: dp.provider,
    provider_slug: dp.source,
    context_length: dp.context_length,
    input_price_per_million: dp.input_price_per_million,
    output_price_per_million: dp.output_price_per_million,
    is_free: dp.is_free,
    supports_tools: dp.supports_tools,
    supports_reasoning: dp.supports_reasoning,
    output_limit: dp.output_limit,
    temperature: dp.temperature,
    open_weights: dp.open_weights,
    tags: dp.tags,
    best_for: dp.best_for,
    input_types: dp.input_types,
    output_types: dp.output_types,
    status: dp.status,
    last_success: dp.last_success,
    _removed: dp._removed,
    _removedDate: dp._removedDate,
    notes: dp.notes,
    priority_score: dp.priority_score,
  });
  
  // Update model-level aggregates
  if (dp.context_length && dp.context_length > model.best_context) {
    model.best_context = dp.context_length;
  }
  if (dp.input_price_per_million < model.cheapest_input_price) {
    model.cheapest_input_price = dp.input_price_per_million;
  }
  if (dp.output_price_per_million < model.cheapest_output_price) {
    model.cheapest_output_price = dp.output_price_per_million;
  }
  // Merge best_for across providers
  for (const tag of (dp.best_for || [])) {
    if (!model.best_for.includes(tag)) model.best_for.push(tag);
  }
}

// Build role_rankings per model (map full_id rankings to super_id)
const roleRankingBySuperId = {};
for (const [role, ids] of Object.entries(roleRankingsRaw)) {
  if (!Array.isArray(ids) || role.startsWith('_')) continue;
  for (const fullId of ids) {
    // Find the super_id for this full_id
    const dp = outputModels.find(m => m.id === fullId);
    if (dp) {
      const key = `${dp.super_id}`;
      if (!roleRankingBySuperId[key]) roleRankingBySuperId[key] = {};
      if (!roleRankingBySuperId[key][role] || roleRankingBySuperId[key][role] > (ids.indexOf(fullId) + 1)) {
        roleRankingBySuperId[key][role] = ids.indexOf(fullId) + 1;
      }
    }
  }
}

// Assemble creators array
const creators = Array.from(creatorMap.values())
  .map(creator => {
    const models = Array.from(creator.modelMap.values())
      .map(model => ({
        super_id: model.super_id,
        name: model.name,
        slug: model.slug,
        family: model.family || null,
        best_for: model.best_for,
        best_context: model.best_context,
        cheapest_input_price: model.cheapest_input_price,
        cheapest_output_price: model.cheapest_output_price,
        role_rankings: roleRankingBySuperId[model.super_id] || {},
        providers: model.providers,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // Count unique providers across all models
    const providerSet = new Set();
    for (const model of models) {
      for (const p of model.providers) providerSet.add(p.provider_slug);
    }
    
    return {
      id: creator.id,
      name: creator.name,
      model_count: models.length,
      provider_count: providerSet.size,
      models,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// Build provider references
const providerRefMap = new Map();
for (const dp of outputModels) {
  if (!providerRefMap.has(dp.source)) {
    providerRefMap.set(dp.source, {
      id: dp.source,
      slug: dp.source,
      name: dp.provider,
      model_count: 0,
      working_count: 0,
    });
  }
  const ref = providerRefMap.get(dp.source);
  ref.model_count++;
  if (dp.status.result === 'working') ref.working_count++;
}

// Add base_url from seed data (hardcoded known providers)
const PROVIDER_BASE_URLS = {
  'openrouter': 'https://openrouter.ai/api/v1',
  'nvidia': 'https://integrate.api.nvidia.com/v1',
  'cerebras': 'https://api.cerebras.ai/v1',
  'groq': 'https://api.groq.com/openai/v1',
  'togetherai': 'https://api.together.xyz/v1',
  'mistral': 'https://api.mistral.ai/v1',
  'deepseek': 'https://api.deepseek.com/v1',
  'huggingface': 'https://api-inference.huggingface.co/v1',
  'google': 'https://generativelanguage.googleapis.com/v1beta',
  'openai': 'https://api.openai.com/v1',
  'anthropic': 'https://api.anthropic.com/v1',
};

const providers = Array.from(providerRefMap.values())
  .map(ref => ({
    ...ref,
    base_url: PROVIDER_BASE_URLS[ref.slug] || '',
    health_status: ref.working_count === ref.model_count ? 'healthy'
      : ref.working_count > 0 ? 'degraded' : 'down',
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
```

- [ ] **Step 2: Replace the return statement**

Replace the return block (lines 148-164) with:

```javascript
  return {
    creators,
    providers,
    _test_summary: {
      date: new Date().toISOString().slice(0, 10),
      results: { working: workingIds, rate_limited: rateLimitedIds, broken: brokenIds, untested: untestedIds },
    },
    _role_rankings: meta._role_rankings || { description: '', model: [], build: [], general: [], small_model: [], explore: [], stable: [] },
    _model_scores: {
      description: 'External benchmark scores by source',
      sources: ['artificial_analysis'],
      scores: scoreMap,
    },
    _provider_usage: meta._provider_usage || { description: '' },
    _known_issues: meta._known_issues || { description: '', issues: [] },
    _validation_method: meta._validation_method || { description: '' },
    provider_health: health,
  };
```

- [ ] **Step 3: Test the data builder**

Run: `npm run db:export` (or manually: `node -e "const loadModels = require('./scripts/load-models'); const pool = require('./server/db'); loadModels(pool).then(d => { console.log(JSON.stringify(Object.keys(d))); console.log('creators:', d.creators?.length); console.log('providers:', d.providers?.length); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"`)

Expected output includes `creators` and `providers` keys, with creator count > 0 and provider count > 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-models-data.js
git commit -m "data: restructure build-models-data.js to hierarchical creators → models → providers"
```

---

### Task 3: Rewrite Pinia Store

**Files:**
- Modify: `vue-model-manager/src/store/models.ts`

- [ ] **Step 1: Rewrite the store to consume hierarchical data**

Replace the entire store file. The new store consumes `creators[]` and `providers[]` from the API, while keeping backward-compatible flat-list computed properties for any remaining consumers.

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ModelsData, CreatorData, ModelData, ProviderDatapoint, ProviderReference, RoleScore, RoleMeta } from '@/types'

const ROLE_ORDER = ['model', 'build', 'stable', 'general', 'small_model', 'explore'] as const
type Role = (typeof ROLE_ORDER)[number]

export const useModelsStore = defineStore('models', () => {
  const data = ref<ModelsData | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const lastLoaded = ref<Date | null>(null)
  const isStale = ref(false)

  let staleTimer: ReturnType<typeof setTimeout> | null = null
  function startStaleTimer() { stopStaleTimer(); staleTimer = setTimeout(() => { isStale.value = true }, 3_600_000) }
  function stopStaleTimer() { if (staleTimer !== null) { clearTimeout(staleTimer); staleTimer = null } }

  // ── Hierarchical data access ──
  const creators = computed((): CreatorData[] => data.value?.creators ?? [])
  const providerRefs = computed((): ProviderReference[] => data.value?.providers ?? [])

  // ── Flatten all models across all creators ──
  const allModels = computed((): ModelData[] => {
    const result: ModelData[] = []
    for (const creator of creators.value) {
      for (const model of creator.models) {
        result.push(model)
      }
    }
    return result
  })

  // ── Flatten all provider datapoints ──
  const allDatapoints = computed((): ProviderDatapoint[] => {
    const result: ProviderDatapoint[] = []
    for (const model of allModels.value) {
      for (const dp of model.providers) {
        result.push(dp)
      }
    }
    return result
  })

  // ── Model lookup by super_id ──
  const modelBySuperId = computed((): Map<number, { model: ModelData; creator: CreatorData }> => {
    const map = new Map()
    for (const creator of creators.value) {
      for (const model of creator.models) {
        map.set(model.super_id, { model, creator })
      }
    }
    return map
  })

  // ── Datapoint lookup by full_id ──
  const datapointById = computed((): Map<string, { dp: ProviderDatapoint; model: ModelData; creator: CreatorData }> => {
    const map = new Map()
    for (const creator of creators.value) {
      for (const model of creator.models) {
        for (const dp of model.providers) {
          map.set(dp.full_id, { dp, model, creator })
        }
      }
    }
    return map
  })

  // ── Filtered model lists ──
  const freeModels = computed(() =>
    allModels.value.filter(m => m.providers.some(p => p.is_free && !p._removed))
  )

  const paidModels = computed(() =>
    allModels.value.filter(m => m.providers.some(p => !p.is_free && !p._removed))
  )

  const workingModels = computed(() =>
    allModels.value.filter(m =>
      m.providers.some(p => !p._removed && p.status.result === 'working')
    )
  )

  const brokenModels = computed(() =>
    allModels.value.filter(m =>
      m.providers.some(p => p.status.result === 'broken')
    )
  )

  const rateLimitedModels = computed(() =>
    allModels.value.filter(m =>
      m.providers.some(p => p.status.result === 'rate_limited')
    )
  )

  const untestedModels = computed(() =>
    allModels.value.filter(m =>
      m.providers.some(p => p.status.result === 'untested')
    )
  )

  // ── Model status classification ──
  function getModelStatus(model: ModelData): 'working' | 'mixed' | 'untested' | 'down' {
    const activeProviders = model.providers.filter(p => !p._removed)
    if (activeProviders.length === 0) return 'down'
    
    const working = activeProviders.filter(p => p.status.result === 'working').length
    const untested = activeProviders.filter(p => p.status.result === 'untested').length
    const broken = activeProviders.filter(p => p.status.result === 'broken').length
    
    if (working === activeProviders.length) return 'working'
    if (untested === activeProviders.length) return 'untested'
    if (working > 0) return 'mixed'
    if (broken === activeProviders.length) return 'down'
    return 'mixed'
  }

  // ── Metadata ──
  const roleRankings = computed(() => {
    const r = data.value?._role_rankings
    if (!r) return {} as Record<Role, string[]>
    const result = {} as Record<Role, string[]>
    for (const role of ROLE_ORDER) result[role] = r[role] ?? []
    return result
  })

  const roleScores = computed(() => data.value?._role_rankings?._scores ?? {} as Record<string, RoleScore[]>)
  const roleMeta = computed(() => data.value?._role_rankings?._meta ?? {} as Record<string, RoleMeta>)

  const knownIssues = computed(() => data.value?._known_issues?.issues ?? [])
  
  const testSummary = computed(() => data.value?._test_summary ?? null)
  const validationMethod = computed(() => data.value?._validation_method ?? null)

  const providerUsage = computed(() => {
    const raw = data.value?._provider_usage
    if (!raw) return {} as Record<string, { month: string; reason: string }>
    const result: Record<string, { month: string; reason: string }> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'description') continue
      if (typeof value === 'object' && value !== null && 'month' in value) {
        result[key] = value as { month: string; reason: string }
      }
    }
    return result
  })

  const currentMonth = computed(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const usedUpProviders = computed(() => {
    const current = currentMonth.value
    return Object.entries(providerUsage.value).filter(([, u]) => u.month === current).map(([p]) => p)
  })

  // ── Stats ──
  const stats = computed(() => {
    const totalModels = allModels.value.length
    const totalDatapoints = allDatapoints.value.length
    const freeCount = allDatapoints.value.filter(d => d.is_free).length
    const workingCount = allDatapoints.value.filter(d => d.status.result === 'working').length
    const brokenCount = allDatapoints.value.filter(d => d.status.result === 'broken').length
    
    return {
      creators: creators.value.length,
      models: totalModels,
      datapoints: totalDatapoints,
      providers: providerRefs.value.length,
      free: freeCount,
      working: workingCount,
      broken: brokenCount,
      workingRatio: freeCount > 0 ? workingCount / freeCount : 0,
    }
  })

  // ── Actions ──
  let abortController: AbortController | null = null

  async function loadData() {
    abortController?.abort()
    abortController = new AbortController()
    loading.value = true
    error.value = null
    const signal = abortController.signal
    try {
      let resp = await fetch('/api/data', { signal })
      if (!resp.ok) resp = await fetch('/available-models.json', { signal })
      data.value = await resp.json()
      lastLoaded.value = new Date()
      isStale.value = false
      startStaleTimer()
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      try {
        const fallback = await fetch('/available-models.json', { signal })
        data.value = await fallback.json()
        lastLoaded.value = new Date()
        isStale.value = false
        startStaleTimer()
      } catch (fe: unknown) {
        if (fe instanceof DOMException && (fe as DOMException).name === 'AbortError') return
        error.value = e instanceof Error ? e.message : String(e)
      }
    } finally {
      loading.value = false
    }
  }

  return {
    loading, error, lastLoaded, isStale,
    // Hierarchical access
    creators, providerRefs,
    // Flat lists
    allModels, allDatapoints,
    // Lookups
    modelBySuperId, datapointById,
    // Filtered lists
    freeModels, paidModels, workingModels, brokenModels, rateLimitedModels, untestedModels,
    // Model status helper
    getModelStatus,
    // Metadata
    roleRankings, roleScores, roleMeta, knownIssues, testSummary, validationMethod,
    // Provider usage
    providerUsage, currentMonth, usedUpProviders,
    // Stats
    stats,
    // Actions
    loadData,
  }
})
```

- [ ] **Step 2: Verify types compile**

Run: `cd vue-model-manager && npx vue-tsc --noEmit`
Expected: Errors only in old view files that reference removed computed properties (we'll delete those in Task 10).

- [ ] **Step 3: Commit**

```bash
git add vue-model-manager/src/store/models.ts
git commit -m "store: rewrite to consume hierarchical creators → models → providers data"
```

---

### Task 4: ProviderBlock Component

**Files:**
- Create: `vue-model-manager/src/components/ProviderBlock.vue`

- [ ] **Step 1: Create the ProviderBlock component**

This is the smallest unit — a compact display of one provider's info.

```vue
<template>
  <div class="provider-block" :class="{ expanded, 'status-working': dp.status.result === 'working', 'status-rate-limited': dp.status.result === 'rate_limited', 'status-broken': dp.status.result === 'broken' }">
    <div class="pb-header">
      <span class="pb-name">{{ dp.provider }}</span>
      <span class="pb-status-dot" :class="`dot-${dp.status.result}`"></span>
    </div>
    <div class="pb-stats">
      <span class="pb-context">{{ formatContext(dp.context_length) }}</span>
      <span class="pb-tools" v-if="dp.supports_tools" title="Tools supported">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
      <span class="pb-tools" v-else title="No tools">—</span>
    </div>
    <div class="pb-price">
      <template v-if="dp.is_free && dp.input_price_per_million === 0 && dp.output_price_per_million === 0">Free</template>
      <template v-else>${{ formatPrice(dp.input_price_per_million) }}/${{ formatPrice(dp.output_price_per_million) }}</template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ProviderDatapoint } from '@/types'

defineProps<{
  dp: ProviderDatapoint
  expanded?: boolean
}>()

function formatContext(ctx: number | null): string {
  if (!ctx) return '—'
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  return `${Math.round(ctx / 1000)}K`
}

function formatPrice(price: number): string {
  if (price === 0) return '0'
  if (price < 1) return price.toFixed(2)
  return price.toFixed(0)
}
</script>

<style scoped>
.provider-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  min-width: 100px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.provider-block:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.provider-block.expanded {
  border-color: var(--accent);
  background: var(--bg-card);
}

.provider-block.status-working {
  border-left: 2px solid var(--green);
}

.provider-block.status-broken {
  border-left: 2px solid var(--red);
  opacity: 0.7;
}

.pb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.pb-name {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pb-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-working { background: var(--green); box-shadow: 0 0 4px var(--green-glow); }
.dot-rate_limited { background: var(--orange); box-shadow: 0 0 4px var(--orange-glow); }
.dot-broken { background: var(--red); box-shadow: 0 0 4px var(--red-glow); }
.dot-untested, .dot-paid { background: var(--text-muted); }

.pb-stats {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pb-context {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.pb-tools {
  color: var(--green);
  font-size: 0.68rem;
  display: flex;
  align-items: center;
}

.pb-price {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--accent);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add vue-model-manager/src/components/ProviderBlock.vue
git commit -m "component: add ProviderBlock — compact single-provider display"
```

---

### Task 5: ProviderStrip Component

**Files:**
- Create: `vue-model-manager/src/components/ProviderStrip.vue`

- [ ] **Step 1: Create the ProviderStrip component**

Displays a row of ProviderBlocks with overflow handling ("+N more").

```vue
<template>
  <div class="provider-strip">
    <ProviderBlock
      v-for="dp in visibleProviders"
      :key="dp.full_id"
      :dp="dp"
      class="provider-strip-item"
      @click="$emit('provider-click', dp)"
    />
    <button v-if="overflowCount > 0" class="provider-strip-more" @click="$emit('expand')">
      +{{ overflowCount }} more
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ProviderBlock from '@/components/ProviderBlock.vue'
import type { ProviderDatapoint } from '@/types'

const props = withDefaults(defineProps<{
  providers: ProviderDatapoint[]
  maxVisible?: number
}>(), {
  maxVisible: 5,
})

defineEmits<{
  'provider-click': [dp: ProviderDatapoint]
  'expand': []
}>()

const visibleProviders = computed(() => props.providers.slice(0, props.maxVisible))
const overflowCount = computed(() => Math.max(0, props.providers.length - props.maxVisible))
</script>

<style scoped>
.provider-strip {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 0;
}

.provider-strip-more {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 0.7rem;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px dashed var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s, border-color 0.15s;
}

.provider-strip-more:hover {
  color: var(--accent);
  border-color: var(--accent);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add vue-model-manager/src/components/ProviderStrip.vue
git commit -m "component: add ProviderStrip — row of ProviderBlocks with overflow"
```

---

### Task 6: ProviderTable Component

**Files:**
- Create: `vue-model-manager/src/components/ProviderTable.vue`

- [ ] **Step 1: Create the ProviderTable component**

Mastra-style dense comparison table for the detail panel.

```vue
<template>
  <div class="provider-table-wrap">
    <table class="provider-table">
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key" class="pt-head" :class="{ sortable: col.sortable }" @click="col.sortable && sortBy(col.key)">
            {{ col.label }}
            <span v-if="sortKey === col.key" class="sort-arrow">{{ sortAsc ? '▲' : '▼' }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="dp in sortedProviders" :key="dp.full_id" class="pt-row" :class="`pt-${dp.status.result}`">
          <td class="pt-cell pt-name">{{ dp.provider }}</td>
          <td class="pt-cell">{{ formatContext(dp.context_length) }}</td>
          <td class="pt-cell pt-icon">
            <svg v-if="dp.supports_tools" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span v-else class="dash">—</span>
          </td>
          <td class="pt-cell pt-icon">
            <svg v-if="dp.supports_reasoning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span v-else class="dash">—</span>
          </td>
          <td class="pt-cell pt-icon">
            <svg v-if="hasInputType(dp, 'image')" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span v-else class="dash">—</span>
          </td>
          <td class="pt-cell pt-price">{{ formatPrice(dp.input_price_per_million) }}</td>
          <td class="pt-cell pt-price">{{ formatPrice(dp.output_price_per_million) }}</td>
          <td class="pt-cell pt-status">
            <span class="status-badge" :class="`badge-${dp.status.result}`">{{ statusLabel(dp.status.result) }}</span>
          </td>
          <td class="pt-cell pt-time">{{ formatTime(dp.last_success) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="pt-caption">{{ providers.length }} available providers</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ProviderDatapoint } from '@/types'

const props = defineProps<{
  providers: ProviderDatapoint[]
}>()

const sortKey = ref<string>('')
const sortAsc = ref(true)

const columns = [
  { key: 'provider', label: 'Provider', sortable: true },
  { key: 'context', label: 'Context', sortable: true },
  { key: 'tools', label: 'Tools', sortable: false },
  { key: 'reasoning', label: 'Reasoning', sortable: false },
  { key: 'image', label: 'Image', sortable: false },
  { key: 'input_price', label: 'Input $/1M', sortable: true },
  { key: 'output_price', label: 'Output $/1M', sortable: true },
  { key: 'status', label: 'Status', sortable: false },
  { key: 'last_success', label: 'Last Success', sortable: true },
]

function sortBy(key: string) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
}

const sortedProviders = computed(() => {
  if (!sortKey.value) return props.providers
  return [...props.providers].sort((a, b) => {
    let aVal: any, bVal: any
    switch (sortKey.value) {
      case 'provider': aVal = a.provider; bVal = b.provider; break
      case 'context': aVal = a.context_length || 0; bVal = b.context_length || 0; break
      case 'input_price': aVal = a.input_price_per_million; bVal = b.input_price_per_million; break
      case 'output_price': aVal = a.output_price_per_million; bVal = b.output_price_per_million; break
      case 'last_success': aVal = a.last_success || ''; bVal = b.last_success || ''; break
      default: return 0
    }
    if (aVal < bVal) return sortAsc.value ? -1 : 1
    if (aVal > bVal) return sortAsc.value ? 1 : -1
    return 0
  })
})

function formatContext(ctx: number | null): string {
  if (!ctx) return '—'
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  return `${Math.round(ctx / 1000)}K`
}

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  if (price < 1) return `$${price.toFixed(2)}`
  return `$${price.toFixed(0)}`
}

function hasInputType(dp: ProviderDatapoint, type: string): boolean {
  return (dp.input_types || []).includes(type)
}

function statusLabel(result: string): string {
  return result.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = diff / 3_600_000
  if (hours < 1) return '<1h ago'
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
</script>

<style scoped>
.provider-table-wrap {
  overflow-x: auto;
}

.provider-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.pt-head {
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  font-size: 0.72rem;
}

.pt-head.sortable {
  cursor: pointer;
  user-select: none;
}

.pt-head.sortable:hover {
  color: var(--text);
}

.sort-arrow {
  margin-left: 4px;
  font-size: 0.65rem;
  color: var(--accent);
}

.pt-row {
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.05));
}

.pt-row:hover {
  background: var(--bg-elevated);
}

.pt-cell {
  padding: 8px 10px;
  white-space: nowrap;
}

.pt-name {
  font-weight: 600;
}

.pt-icon {
  text-align: center;
}

.dash {
  color: var(--text-muted);
  opacity: 0.5;
}

.pt-price {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.badge-working {
  color: var(--green);
  font-weight: 600;
}

.badge-rate_limited {
  color: var(--orange);
  font-weight: 600;
}

.badge-broken {
  color: var(--red);
  font-weight: 600;
}

.badge-untested {
  color: var(--text-muted);
}

.badge-paid {
  color: var(--purple, #a78bfa);
  font-weight: 600;
}

.pt-time {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.pt-caption {
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 8px 0;
  text-align: center;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add vue-model-manager/src/components/ProviderTable.vue
git commit -m "component: add ProviderTable — Mastra-style dense provider comparison table"
```

---

### Task 7: ModelDetailPanel Component

**Files:**
- Create: `vue-model-manager/src/components/ModelDetailPanel.vue`

- [ ] **Step 1: Create the slide-out detail panel**

```vue
<template>
  <Teleport to="body">
    <transition name="panel-slide">
      <div v-if="open" class="detail-panel-backdrop" @click.self="close">
        <div class="detail-panel">
          <!-- Header -->
          <div class="dp-header">
            <div class="dp-header-left">
              <button class="dp-back" @click="goPrev" :disabled="!hasPrev" title="Previous model">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <h2 class="dp-title">{{ model.name }}</h2>
              <span class="dp-creator-badge">{{ creator.name }}</span>
            </div>
            <button class="dp-close" @click="close" aria-label="Close panel">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Meta info -->
          <div class="dp-meta">
            <span v-if="model.family" class="dp-meta-item">Family: {{ model.family }}</span>
            <span v-if="model.best_for.length" class="dp-meta-item">Best for: {{ model.best_for.join(', ') }}</span>
            <span class="dp-meta-item">Context: up to {{ formatContext(model.best_context) }}</span>
            <span class="dp-meta-item">From {{ formatPrice(model.cheapest_input_price) }} input / {{ formatPrice(model.cheapest_output_price) }} output</span>
          </div>

          <!-- Role rankings -->
          <div v-if="Object.keys(model.role_rankings).length" class="dp-rankings">
            <span v-for="(rank, role) in model.role_rankings" :key="role" class="dp-ranking-badge">
              #{{ rank }} {{ roleLabel(role) }}
            </span>
          </div>

          <!-- Provider comparison table -->
          <h3 class="dp-section-title">Providers ({{ model.providers.length }})</h3>
          <ProviderTable :providers="model.providers" />

          <!-- Known issues -->
          <div v-if="modelIssues.length" class="dp-issues">
            <h3 class="dp-section-title">Known Issues</h3>
            <div v-for="issue in modelIssues" :key="issue.issue" class="dp-issue">
              <span class="dp-issue-severity" :class="`severity-${issue.severity}`">{{ issue.severity }}</span>
              <p class="dp-issue-text">{{ issue.issue }}</p>
            </div>
          </div>

          <!-- Next button -->
          <button class="dp-next-btn" @click="goNext" :disabled="!hasNext" v-if="hasNext">
            Next model →
          </button>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import ProviderTable from '@/components/ProviderTable.vue'
import type { ModelData, CreatorData, KnownIssue } from '@/types'
import { useModelsStore } from '@/store/models'

const props = defineProps<{
  open: boolean
  model: ModelData
  creator: CreatorData
}>()

const emit = defineEmits<{
  close: []
  'navigate-to': [{ model: ModelData; creator: CreatorData }]
}>()

const router = useRouter()
const store = useModelsStore()

function close() { emit('close') }

// Build ordered list of all models for prev/next navigation
const allModelList = computed(() => {
  const list: Array<{ model: ModelData; creator: CreatorData }> = []
  for (const c of store.creators) {
    for (const m of c.models) {
      list.push({ model: m, creator: c })
    }
  }
  return list
})

const currentIndex = computed(() => {
  return allModelList.value.findIndex(
    entry => entry.model.super_id === props.model.super_id
  )
})

const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < allModelList.value.length - 1)

function goPrev() {
  if (!hasPrev.value) return
  const entry = allModelList.value[currentIndex.value - 1]
  emit('navigate-to', entry)
}

function goNext() {
  if (!hasNext.value) return
  const entry = allModelList.value[currentIndex.value + 1]
  emit('navigate-to', entry)
}

function formatContext(ctx: number): string {
  if (!ctx) return '—'
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  return `${Math.round(ctx / 1000)}K`
}

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  if (price < 1) return `$${price.toFixed(2)}`
  return `$${price.toFixed(0)}`
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    model: 'Model', build: 'Build', general: 'General',
    small_model: 'Small', explore: 'Explore', stable: 'Stable',
  }
  return labels[role] || role
}

// Find known issues for this model's providers
const modelIssues = computed((): KnownIssue[] => {
  const issues = store.knownIssues
  if (!issues.length) return []
  const providerIds = new Set(props.model.providers.map(p => p.full_id))
  return issues.filter(i => providerIds.has(i.model_id))
})

// Keyboard navigation
function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') close()
  if (e.key === 'ArrowLeft') goPrev()
  if (e.key === 'ArrowRight') goNext()
}

watch(() => props.open, (open) => {
  if (open) {
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
  } else {
    document.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
  }
})
</script>

<style scoped>
.detail-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: flex-end;
}

.detail-panel {
  width: min(90vw, 900px);
  height: 100dvh;
  background: var(--bg);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  padding: 20px 24px;
}

.panel-slide-enter-active, .panel-slide-leave-active { transition: transform 0.25s ease, opacity 0.2s ease; }
.panel-slide-enter-from { transform: translateX(100%); opacity: 0; }
.panel-slide-leave-to { transform: translateX(100%); opacity: 0; }

.dp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.dp-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dp-back {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
}

.dp-back:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text); }
.dp-back:disabled { opacity: 0.3; cursor: default; }

.dp-title {
  font-size: 1.2rem;
  font-weight: 700;
  margin: 0;
}

.dp-creator-badge {
  padding: 2px 10px;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
}

.dp-close {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
}

.dp-close:hover { background: var(--bg-elevated); color: var(--text); }

.dp-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.dp-meta-item {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.dp-rankings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.dp-ranking-badge {
  padding: 3px 10px;
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
}

.dp-section-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 20px 0 10px;
  color: var(--text);
}

.dp-issues {
  margin-top: 20px;
}

.dp-issue {
  display: flex;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.dp-issue-severity {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.severity-critical { background: var(--red); color: #fff; }
.severity-high { background: var(--orange); color: #fff; }
.severity-moderate { background: var(--yellow, #eab308); color: #000; }
.severity-low { background: var(--text-muted); color: #fff; }

.dp-issue-text {
  font-size: 0.78rem;
  color: var(--text);
  margin: 0;
}

.dp-next-btn {
  display: block;
  width: 100%;
  padding: 12px;
  margin-top: 24px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
}

.dp-next-btn:hover:not(:disabled) {
  border-color: var(--accent);
}

.dp-next-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

@media (max-width: 768px) {
  .detail-panel {
    width: 100vw;
    border-left: none;
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add vue-model-manager/src/components/ModelDetailPanel.vue
git commit -m "component: add ModelDetailPanel — slide-out model detail with provider comparison"
```

---

### Task 8: ModelCard Component

**Files:**
- Create: `vue-model-manager/src/components/ModelCard.vue`

- [ ] **Step 1: Create the ModelCard component**

Combines the header info with ProviderStrip.

```vue
<template>
  <div class="model-card" :class="{ 'card-expanded': expanded }" @click="handleCardClick">
    <!-- Header -->
    <div class="mc-header">
      <div class="mc-header-left">
        <h3 class="mc-name">{{ model.name }}</h3>
        <span class="mc-creator-badge">{{ creator.name }}</span>
      </div>
      <div class="mc-header-right">
        <span v-for="(rank, role) in topRankings" :key="role" class="mc-ranking-badge">
          #{{ rank }} {{ roleLabel(role) }}
        </span>
      </div>
    </div>
    
    <!-- Summary stats -->
    <div class="mc-stats">
      <span class="mc-stat">Max: {{ formatContext(model.best_context) }} context</span>
      <span class="mc-stat-divider">|</span>
      <span class="mc-stat">{{ model.providers.some(p => p.is_free && p.input_price_per_million === 0 && p.output_price_per_million === 0) ? 'Free' : formatPrice(model.cheapest_input_price) + '/' + formatPrice(model.cheapest_output_price) }}</span>
      <span class="mc-stat-divider">|</span>
      <span class="mc-stat">{{ model.providers.length }} provider{{ model.providers.length !== 1 ? 's' : '' }}</span>
      <span class="mc-status-indicator" :class="`status-${status}`"></span>
    </div>

    <!-- Provider strip -->
    <ProviderStrip
      :providers="model.providers"
      :max-visible="expanded ? 12 : 5"
      @provider-click="handleProviderClick"
      @expand="expanded = true"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ProviderStrip from '@/components/ProviderStrip.vue'
import type { ModelData, CreatorData, ProviderDatapoint } from '@/types'

const props = defineProps<{
  model: ModelData
  creator: CreatorData
}>()

const emit = defineEmits<{
  'model-click': []
  'provider-click': [dp: ProviderDatapoint]
}>()

const expanded = ref(false)

const status = computed(() => {
  const active = props.model.providers.filter(p => !p._removed)
  if (!active.length) return 'down'
  const working = active.filter(p => p.status.result === 'working').length
  if (working === active.length) return 'working'
  if (working > 0) return 'mixed'
  return 'down'
})

const topRankings = computed(() => {
  const rankings = props.model.role_rankings
  const result: Record<string, number> = {}
  // Show at most 2 rankings
  let count = 0
  for (const [role, rank] of Object.entries(rankings)) {
    if (count >= 2) break
    result[role] = rank
    count++
  }
  return result
})

function handleCardClick(e: MouseEvent) {
  // Don't trigger if clicking a provider block
  const target = e.target as HTMLElement
  if (target.closest('.provider-block') || target.closest('.provider-strip-more')) return
  emit('model-click')
}

function handleProviderClick(dp: ProviderDatapoint) {
  emit('provider-click', dp)
}

function formatContext(ctx: number): string {
  if (!ctx) return '—'
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  return `${Math.round(ctx / 1000)}K`
}

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  if (price < 1) return `$${price.toFixed(2)}`
  return `$${price.toFixed(0)}`
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    model: 'Model', build: 'Build', general: 'General',
    small_model: 'Small', explore: 'Explore', stable: 'Stable',
  }
  return labels[role] || role
}
</script>

<style scoped>
.model-card {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.model-card:hover {
  border-color: var(--border-strong, rgba(255,255,255,0.15));
}

.model-card.card-expanded {
  border-color: var(--accent);
}

.mc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.mc-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mc-name {
  font-size: 0.92rem;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mc-creator-badge {
  padding: 2px 8px;
  font-size: 0.68rem;
  font-weight: 600;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
  flex-shrink: 0;
}

.mc-header-right {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.mc-ranking-badge {
  padding: 2px 8px;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 999px;
  background: var(--green-subtle, rgba(52,211,153,0.15));
  color: var(--green);
}

.mc-stats {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.mc-stat-divider {
  color: var(--border);
}

.mc-status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: auto;
  flex-shrink: 0;
}

.mc-status-indicator.status-working { background: var(--green); box-shadow: 0 0 4px var(--green-glow); }
.mc-status-indicator.status-mixed { background: var(--orange); box-shadow: 0 0 4px var(--orange-glow); }
.mc-status-indicator.status-down { background: var(--red); box-shadow: 0 0 4px var(--red-glow); }
.mc-status-indicator.status-untested { background: var(--text-muted); }

@media (max-width: 768px) {
  .model-card { padding: 10px 12px; }
  .mc-name { font-size: 0.85rem; }
  .mc-header-right { display: none; }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add vue-model-manager/src/components/ModelCard.vue
git commit -m "component: add ModelCard — model card with header, stats, and provider strip"
```

---

### Task 9: ModelList View (Main Landing Page)

**Files:**
- Create: `vue-model-manager/src/views/ModelList.vue`

- [ ] **Step 1: Create the ModelList view**

This is the new landing page — model cards with search, filters, and sorting.

```vue
<template>
  <div class="model-list-page">
    <!-- Stale warning -->
    <div v-if="store.isStale" class="stale-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span>Data may be stale (loaded over 1 hour ago).</span>
      <button @click="store.loadData()" class="refresh-btn refresh-btn-sm">Refresh</button>
    </div>

    <!-- Page header -->
    <div class="ml-header">
      <h2>Models</h2>
      <p class="ml-subtitle">{{ filteredModels.length }} models from {{ store.creators.length }} creators</p>
    </div>

    <!-- Controls -->
    <div class="ml-controls">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search models..."
        class="ml-search"
        aria-label="Search models"
      />
      <select v-model="creatorFilter" class="ml-select" aria-label="Filter by creator">
        <option value="">All Creators</option>
        <option v-for="c in store.creators" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select v-model="statusFilter" class="ml-select" aria-label="Filter by status">
        <option value="">All</option>
        <option value="working">Working</option>
        <option value="mixed">Mixed</option>
        <option value="untested">Untested</option>
        <option value="down">Down</option>
      </select>
      <select v-model="priceFilter" class="ml-select" aria-label="Filter by price">
        <option value="">All</option>
        <option value="free">Free only</option>
        <option value="paid">Paid only</option>
      </select>
      <div class="ml-sort">
        <select v-model="sortKey" class="ml-select" aria-label="Sort by">
          <option value="name">Name</option>
          <option value="context">Context</option>
          <option value="price">Price</option>
          <option value="providers">Providers</option>
        </select>
        <button class="ml-sort-dir" @click="sortAsc = !sortAsc" :title="sortAsc ? 'Ascending' : 'Descending'">
          {{ sortAsc ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <!-- Export buttons -->
    <div class="ml-export">
      <button @click="exportJSON" class="export-btn">Export JSON</button>
      <button @click="exportCSV" class="export-btn">Export CSV</button>
    </div>

    <!-- Model list -->
    <div class="ml-list">
      <ModelCard
        v-for="{ model, creator } in filteredAndSortedModels"
        :key="model.super_id"
        :model="model"
        :creator="creator"
        @model-click="openDetail(model, creator)"
        @provider-click="openDetail(model, creator)"
      />
    </div>

    <!-- Empty state -->
    <div v-if="filteredAndSortedModels.length === 0 && !store.loading" class="ml-empty">
      <p>No models match your filters.</p>
      <button @click="clearFilters" class="refresh-btn">Clear filters</button>
    </div>

    <!-- Detail panel -->
    <ModelDetailPanel
      v-if="detailModel"
      :open="!!detailModel"
      :model="detailModel.model"
      :creator="detailModel.creator"
      @close="detailModel = null"
      @navigate-to="detailModel = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ModelCard from '@/components/ModelCard.vue'
import ModelDetailPanel from '@/components/ModelDetailPanel.vue'
import { useModelsStore } from '@/store/models'
import type { ModelData, CreatorData } from '@/types'

const store = useModelsStore()
const route = useRoute()
const router = useRouter()

const searchQuery = ref('')
const creatorFilter = ref('')
const statusFilter = ref('')
const priceFilter = ref('')
const sortKey = ref('name')
const sortAsc = ref(true)

const detailModel = ref<{ model: ModelData; creator: CreatorData } | null>(null)

// Open detail from URL param
const detailId = computed(() => route.query.detail as string)
watch(detailId, (id) => {
  if (id) {
    const superId = parseInt(id, 10)
    const found = store.modelBySuperId.get(superId)
    if (found) detailModel.value = found
  } else {
    detailModel.value = null
  }
}, { immediate: true })

function openDetail(model: ModelData, creator: CreatorData) {
  detailModel.value = { model, creator }
  router.replace({ query: { ...route.query, detail: String(model.super_id) } })
}

function getModelStatus(model: ModelData): string {
  const active = model.providers.filter(p => !p._removed)
  if (!active.length) return 'down'
  const working = active.filter(p => p.status.result === 'working').length
  if (working === active.length) return 'working'
  if (working > 0) return 'mixed'
  return 'down'
}

const filteredModels = computed(() => {
  let models = store.allModels

  // Search
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    models = models.filter(m => m.name.toLowerCase().includes(q))
  }

  // Creator filter
  if (creatorFilter.value) {
    models = models.filter(m => {
      const creator = store.creators.find(c => c.models.some(mod => mod.super_id === m.super_id))
      return creator?.id === creatorFilter.value
    })
  }

  // Status filter
  if (statusFilter.value) {
    models = models.filter(m => getModelStatus(m) === statusFilter.value)
  }

  // Price filter
  if (priceFilter.value === 'free') {
    models = models.filter(m => m.providers.some(p => p.is_free && p.input_price_per_million === 0 && p.output_price_per_million === 0))
  } else if (priceFilter.value === 'paid') {
    models = models.filter(m => !m.providers.some(p => p.is_free && p.input_price_per_million === 0 && p.output_price_per_million === 0))
  }

  return models
})

const filteredAndSortedModels = computed(() => {
  const list = filteredModels.value.map(model => {
    const creator = store.creators.find(c => c.models.some(m => m.super_id === model.super_id))!
    return { model, creator }
  })

  list.sort((a, b) => {
    let aVal: any, bVal: any
    switch (sortKey.value) {
      case 'name': aVal = a.model.name; bVal = b.model.name; break
      case 'context': aVal = a.model.best_context; bVal = b.model.best_context; break
      case 'price': aVal = a.model.cheapest_input_price + a.model.cheapest_output_price; bVal = b.model.cheapest_input_price + b.model.cheapest_output_price; break
      case 'providers': aVal = a.model.providers.length; bVal = b.model.providers.length; break
      default: return 0
    }
    if (aVal == null) return 1
    if (bVal == null) return -1
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal
    return sortAsc.value ? cmp : -cmp
  })

  return list
})

function clearFilters() {
  searchQuery.value = ''
  creatorFilter.value = ''
  statusFilter.value = ''
  priceFilter.value = ''
}

function exportJSON() {
  const data = filteredAndSortedModels.value.map(({ model, creator }) => ({
    name: model.name,
    creator: creator.name,
    providers: model.providers.map(p => ({
      provider: p.provider,
      context: p.context_length,
      input_price: p.input_price_per_million,
      output_price: p.output_price_per_million,
      free: p.is_free,
      tools: p.supports_tools,
      status: p.status.result,
    })),
  }))
  downloadFile(JSON.stringify(data, null, 2), 'models.json', 'application/json')
}

function exportCSV() {
  const rows = [['Model', 'Creator', 'Provider', 'Context', 'Input Price', 'Output Price', 'Free', 'Tools', 'Status']]
  for (const { model, creator } of filteredAndSortedModels.value) {
    for (const p of model.providers) {
      rows.push([
        model.name, creator.name, p.provider,
        String(p.context_length || ''),
        String(p.input_price_per_million),
        String(p.output_price_per_million),
        String(p.is_free),
        String(!!p.supports_tools),
        p.status.result,
      ])
    }
  }
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  downloadFile(csv, 'models.csv', 'text/csv')
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.model-list-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.stale-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid var(--orange);
  border-radius: 8px;
  font-size: 0.78rem;
  color: var(--orange);
}

.ml-header {
  margin-bottom: 16px;
}

.ml-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0 0 4px;
}

.ml-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}

.ml-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.ml-search {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 0.82rem;
  font-family: inherit;
}

.ml-search:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.ml-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
}

.ml-sort {
  display: flex;
  gap: 4px;
}

.ml-sort-dir {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-size: 0.78rem;
}

.ml-export {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.export-btn {
  padding: 6px 14px;
  font-size: 0.72rem;
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}

.export-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.ml-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ml-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.refresh-btn {
  padding: 6px 12px;
  font-size: 0.72rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}

.refresh-btn:hover {
  border-color: var(--accent);
}

.refresh-btn-sm {
  padding: 4px 10px;
  font-size: 0.68rem;
}

@media (max-width: 768px) {
  .model-list-page { padding: 12px; }
  .ml-controls { flex-direction: column; }
  .ml-search { min-width: auto; }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add vue-model-manager/src/views/ModelList.vue
git commit -m "view: add ModelList — new landing page with model cards, filters, and sorting"
```

---

### Task 10: New Dashboard View

**Files:**
- Create: `vue-model-manager/src/views/NewDashboard.vue`

- [ ] **Step 1: Create the redesigned Dashboard**

Ecosystem-level overview with creator stats, provider health grid, and usage tracking.

```vue
<template>
  <div class="new-dashboard">
    <div class="page-header">
      <h2>Dashboard</h2>
      <p>Ecosystem overview — {{ store.stats.creators }} creators, {{ store.stats.providers }} providers</p>
    </div>

    <div v-if="store.isStale" class="stale-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span>Data may be stale.</span>
      <button @click="store.loadData()" class="refresh-btn refresh-btn-sm">Refresh</button>
    </div>

    <!-- Stats bar -->
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value green">{{ store.stats.working }}</div><div class="stat-label">Working</div></div>
      <div class="stat-card"><div class="stat-value">{{ store.stats.models }}</div><div class="stat-label">Models</div></div>
      <div class="stat-card"><div class="stat-value">{{ store.stats.datapoints }}</div><div class="stat-label">Datapoints</div></div>
      <div class="stat-card"><div class="stat-value">{{ store.stats.creators }}</div><div class="stat-label">Creators</div></div>
      <div class="stat-card"><div class="stat-value">{{ store.stats.providers }}</div><div class="stat-label">Providers</div></div>
      <div class="stat-card"><div class="stat-value accent">{{ store.stats.free }}</div><div class="stat-label">Free</div></div>
      <div class="stat-card"><div class="stat-value orange">{{ store.stats.broken }}</div><div class="stat-label">Broken</div></div>
      <div class="stat-card"><div class="stat-value purple">{{ Math.round(store.stats.workingRatio * 100) }}%</div><div class="stat-label">Success Rate</div></div>
    </div>

    <!-- Provider health grid -->
    <h3 class="section-title">Provider Health</h3>
    <div class="provider-grid">
      <div v-for="prov in store.providerRefs" :key="prov.id" class="provider-card" :class="`prov-${prov.health_status}`">
        <div class="prov-name">{{ prov.name }}</div>
        <div class="prov-stats">
          <span class="prov-count">{{ prov.working_count }}/{{ prov.model_count }}</span>
          <span class="prov-status-dot" :class="`dot-${prov.health_status}`"></span>
        </div>
        <div class="prov-bar-track">
          <div class="prov-bar-fill" :style="{ width: `${prov.model_count > 0 ? Math.round((prov.working_count / prov.model_count) * 100) : 0}%` }"></div>
        </div>
        <div class="prov-total">{{ prov.model_count }} models</div>
      </div>
    </div>

    <!-- Used-up providers -->
    <div v-if="store.usedUpProviders.length > 0" class="card">
      <div class="card-title">Used-Up Providers ({{ store.currentMonth }})</div>
      <table>
        <thead><tr><th>Provider</th><th>Reason</th></tr></thead>
        <tbody>
          <tr v-for="provider in store.usedUpProviders" :key="provider">
            <td><strong>{{ provider }}</strong></td>
            <td>{{ store.providerUsage[provider]?.reason ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Last tested -->
    <div class="card" v-if="store.testSummary">
      <div class="card-title">Validation</div>
      <p>Last tested: {{ store.testSummary.date }}</p>
      <p v-if="store.validationMethod">{{ store.validationMethod.procedure }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useModelsStore } from '@/store/models'

const store = useModelsStore()
</script>

<style scoped>
.new-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0 0 4px;
}

.page-header p {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}

.stale-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid var(--orange);
  border-radius: 8px;
  font-size: 0.78rem;
  color: var(--orange);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  margin-bottom: 24px;
}

.stat-card {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  text-align: center;
}

.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
}

.stat-value.green { color: var(--green); }
.stat-value.accent { color: var(--accent); }
.stat-value.orange { color: var(--orange); }
.stat-value.purple { color: var(--purple, #a78bfa); }

.stat-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 16px;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  margin-bottom: 24px;
}

.provider-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}

.prov-healthy { border-left: 3px solid var(--green); }
.prov-degraded { border-left: 3px solid var(--orange); }
.prov-down { border-left: 3px solid var(--red); }

.prov-name {
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 4px;
}

.prov-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.prov-count {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--green);
}

.prov-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.dot-healthy { background: var(--green); }
.dot-degraded { background: var(--orange); }
.dot-down { background: var(--red); }

.prov-bar-track {
  height: 4px;
  background: var(--bg-elevated);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.prov-bar-fill {
  height: 100%;
  background: var(--green);
  border-radius: 2px;
  transition: width 0.3s;
}

.prov-total {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  margin-bottom: 16px;
}

.card-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin-bottom: 8px;
}

.card p {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 4px 0;
}

table {
  width: 100%;
  font-size: 0.78rem;
}

th, td {
  padding: 6px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

th {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.72rem;
}

.refresh-btn {
  padding: 4px 10px;
  font-size: 0.68rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}

.refresh-btn-sm { margin-left: auto; }

@media (max-width: 768px) {
  .new-dashboard { padding: 12px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .provider-grid { grid-template-columns: 1fr; }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add vue-model-manager/src/views/NewDashboard.vue
git commit -m "view: add NewDashboard — redesigned ecosystem overview with creator and provider stats"
```

---

### Task 11: Creator Views

**Files:**
- Create: `vue-model-manager/src/views/CreatorList.vue`
- Create: `vue-model-manager/src/views/CreatorDetail.vue`

- [ ] **Step 1: Create CreatorList view**

Grid of creator cards.

```vue
<template>
  <div class="creator-list-page">
    <div class="page-header">
      <h2>Creators</h2>
      <p>{{ store.creators.length }} model creators tracked</p>
    </div>

    <div class="creator-grid">
      <router-link
        v-for="creator in store.creators"
        :key="creator.id"
        :to="`/creator/${creator.id}`"
        class="creator-card"
      >
        <h3 class="cc-name">{{ creator.name }}</h3>
        <div class="cc-stats">
          <span class="cc-stat">{{ creator.model_count }} model{{ creator.model_count !== 1 ? 's' : '' }}</span>
          <span class="cc-stat">{{ creator.provider_count }} provider{{ creator.provider_count !== 1 ? 's' : '' }}</span>
        </div>
        <div class="cc-top" v-if="creator.models.length">
          Top: {{ creator.models[0].name }}
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModelsStore } from '@/store/models'
const store = useModelsStore()
</script>

<style scoped>
.creator-list-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.page-header p { font-size: 0.78rem; color: var(--text-muted); margin: 0; }

.creator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.creator-card {
  display: block;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  text-decoration: none;
  color: var(--text);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.creator-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.cc-name {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 8px;
}

.cc-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}

.cc-stat {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.cc-top {
  font-size: 0.72rem;
  color: var(--accent);
}

@media (max-width: 768px) {
  .creator-list-page { padding: 12px; }
  .creator-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
```

- [ ] **Step 2: Create CreatorDetail view**

```vue
<template>
  <div class="creator-detail-page" v-if="creator">
    <div class="page-header">
      <router-link to="/creators" class="back-link">← Creators</router-link>
      <h2>{{ creator.name }}</h2>
      <p class="cd-subtitle">{{ creator.model_count }} models · {{ creator.provider_count }} providers</p>
    </div>

    <!-- Aggregate stats -->
    <div class="cd-aggregate">
      <div class="cd-stat">
        <span class="cd-stat-value">{{ formatContext(bestContext) }}</span>
        <span class="cd-stat-label">Best context</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ formatPrice(cheapestInput) }}/{{ formatPrice(cheapestOutput) }}</span>
        <span class="cd-stat-label">Cheapest</span>
      </div>
      <div class="cd-stat">
        <span class="cd-stat-value">{{ topProvider }}</span>
        <span class="cd-stat-label">Most models</span>
      </div>
    </div>

    <!-- Model list -->
    <h3 class="section-title">Models</h3>
    <div class="cd-models">
      <ModelCard
        v-for="model in creator.models"
        :key="model.super_id"
        :model="model"
        :creator="creator"
        @model-click="openDetail(model)"
        @provider-click="openDetail(model)"
      />
    </div>

    <!-- Detail panel -->
    <ModelDetailPanel
      v-if="detailModel"
      :open="!!detailModel"
      :model="detailModel"
      :creator="creator"
      @close="detailModel = null"
      @navigate-to="detailModel = $event.model"
    />
  </div>
  <div v-else class="cd-not-found">
    <p>Creator not found.</p>
    <router-link to="/creators" class="back-link">← Back to creators</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import ModelCard from '@/components/ModelCard.vue'
import ModelDetailPanel from '@/components/ModelDetailPanel.vue'
import { useModelsStore } from '@/store/models'
import type { ModelData } from '@/types'

const store = useModelsStore()
const route = useRoute()

const creatorId = computed(() => route.params.id as string)
const creator = computed(() => store.creators.find(c => c.id === creatorId.value))

const detailModel = ref<ModelData | null>(null)
function openDetail(model: ModelData) { detailModel.value = model }

function formatContext(ctx: number): string {
  if (!ctx) return '—'
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  return `${Math.round(ctx / 1000)}K`
}

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  if (price < 1) return `$${price.toFixed(2)}`
  return `$${price.toFixed(0)}`
}

const bestContext = computed(() => {
  if (!creator.value) return 0
  return Math.max(...creator.value.models.map(m => m.best_context), 0)
})

const cheapestInput = computed(() => {
  if (!creator.value) return 0
  return Math.min(...creator.value.models.map(m => m.cheapest_input_price), Infinity)
})

const cheapestOutput = computed(() => {
  if (!creator.value) return 0
  return Math.min(...creator.value.models.map(m => m.cheapest_output_price), Infinity)
})

const topProvider = computed(() => {
  if (!creator.value) return '—'
  const counts: Record<string, number> = {}
  for (const model of creator.value.models) {
    for (const p of model.providers) {
      counts[p.provider] = (counts[p.provider] || 0) + 1
    }
  }
  let top = '—'
  let maxCount = 0
  for (const [name, count] of Object.entries(counts)) {
    if (count > maxCount) { maxCount = count; top = name }
  }
  return top
})
</script>

<style scoped>
.creator-detail-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.back-link {
  font-size: 0.78rem;
  color: var(--accent);
  text-decoration: none;
}

.back-link:hover { text-decoration: underline; }

.page-header h2 { font-size: 1.3rem; font-weight: 700; margin: 8px 0 4px; }

.cd-subtitle { font-size: 0.78rem; color: var(--text-muted); margin: 0; }

.cd-aggregate {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  margin: 16px 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}

.cd-stat {
  display: flex;
  flex-direction: column;
}

.cd-stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent);
}

.cd-stat-label {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.section-title { font-size: 1rem; font-weight: 700; margin: 20px 0 12px; }

.cd-models {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cd-not-found {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .creator-detail-page { padding: 12px; }
  .cd-aggregate { flex-direction: column; gap: 12px; }
}
</style>
```

- [ ] **Step 3: Commit**

```bash
git add vue-model-manager/src/views/CreatorList.vue vue-model-manager/src/views/CreatorDetail.vue
git commit -m "views: add CreatorList and CreatorDetail — creator browsing pages"
```

---

### Task 12: Copy Issues View

**Files:**
- Create: `vue-model-manager/src/views/Issues.vue`

- [ ] **Step 1: Copy existing Issues view to the new location**

The Issues view is largely unchanged. Copy the content from the existing `vue-model-manager/src/views/Issues.vue` into the new file.

```bash
cp vue-model-manager/src/views/Issues.vue vue-model-manager/src/views/Issues.vue.bak
```

Read the existing Issues.vue and write it to the same path (it already exists at `vue-model-manager/src/views/Issues.vue`). No changes needed — we'll keep it in place during router update.

Actually, the existing Issues.vue already exists at the correct path. We just need to keep it. No file creation needed for this task — we'll reference it in the router update.

- [ ] **Step 2: Commit**

```bash
# No new file — Issues.vue already exists. Skip commit or combine with next task.
```

---

### Task 13: Update Router

**Files:**
- Modify: `vue-model-manager/src/router.ts`

- [ ] **Step 1: Replace routes**

Replace the entire routes array in `vue-model-manager/src/router.ts`:

```typescript
import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Models',
    component: () => import('@/views/ModelList.vue'),
    meta: { title: 'Models' },
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/NewDashboard.vue'),
    meta: { title: 'Dashboard' },
  },
  {
    path: '/creators',
    name: 'Creators',
    component: () => import('@/views/CreatorList.vue'),
    meta: { title: 'Creators' },
  },
  {
    path: '/creator/:id',
    name: 'CreatorDetail',
    component: () => import('@/views/CreatorDetail.vue'),
    meta: { title: 'Creator' },
  },
  {
    path: '/issues',
    name: 'Issues',
    component: () => import('@/views/Issues.vue'),
    meta: { title: 'Issues' },
  },
  // Redirect old routes
  {
    path: '/free',
    redirect: '/',
  },
  {
    path: '/paid',
    redirect: '/',
  },
  {
    path: '/all',
    redirect: '/',
  },
  {
    path: '/models',
    redirect: '/',
  },
  {
    path: '/super/:id',
    redirect: '/',
  },
  {
    path: '/master/:id',
    redirect: '/',
  },
  {
    path: '/author',
    redirect: '/creators',
  },
  {
    path: '/family',
    redirect: '/creators',
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0, left: 0 }),
})

const BASE_TITLE = 'GrabFreeModels'
router.afterEach((to) => {
  const page = to.meta?.title as string | undefined
  document.title = page ? `${page} — ${BASE_TITLE}` : BASE_TITLE
})

router.onError((err) => {
  console.error('Router error:', err.message || err)
})

export default router
```

- [ ] **Step 2: Commit**

```bash
git add vue-model-manager/src/router.ts
git commit -m "router: update routes for new navigation structure, redirect old routes"
```

---

### Task 14: Update App.vue Navigation

**Files:**
- Modify: `vue-model-manager/src/App.vue`

- [ ] **Step 1: Update sidebar navigation**

In the `<nav>` section of App.vue, replace the existing router-links (lines 23-70) with:

```vue
        <router-link to="/" active-class="active">
          <span class="nav-icon">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <span>Models</span>
        </router-link>
        <router-link to="/dashboard" active-class="active">
          <span class="nav-icon">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </span>
          <span>Dashboard</span>
        </router-link>
        <router-link to="/creators" active-class="active">
          <span class="nav-icon">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <span>Creators</span>
        </router-link>
        <router-link to="/issues" active-class="active">
          <span class="nav-icon">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <span>Issues</span>
        </router-link>
```

Also update the `isSuperActive` computed (line 154) to:
```typescript
const isSuperActive = computed(() => route.path === '/' || route.path.startsWith('/creator/'))
```

- [ ] **Step 2: Commit**

```bash
git add vue-model-manager/src/App.vue
git commit -m "app: update sidebar navigation for new route structure"
```

---

### Task 15: Delete Old Views and Components

**Files:**
- Delete: `vue-model-manager/src/views/Dashboard.vue`
- Delete: `vue-model-manager/src/views/Free.vue`
- Delete: `vue-model-manager/src/views/Paid.vue`
- Delete: `vue-model-manager/src/views/All.vue`
- Delete: `vue-model-manager/src/views/SuperModels.vue`
- Delete: `vue-model-manager/src/views/SuperModel.vue`
- Delete: `vue-model-manager/src/views/Family.vue`
- Delete: `vue-model-manager/src/views/Author.vue`
- Delete: `vue-model-manager/src/components/ModelDetail.vue`
- Delete: `vue-model-manager/src/components/QueryBuilder.vue`
- Delete: `vue-model-manager/src/components/MultiSelect.vue`
- Delete: `vue-model-manager/src/composables/useJqlFilter.ts`

- [ ] **Step 1: Delete old files**

```bash
rm vue-model-manager/src/views/Dashboard.vue
rm vue-model-manager/src/views/Free.vue
rm vue-model-manager/src/views/Paid.vue
rm vue-model-manager/src/views/All.vue
rm vue-model-manager/src/views/SuperModels.vue
rm vue-model-manager/src/views/SuperModel.vue
rm vue-model-manager/src/views/Family.vue
rm vue-model-manager/src/views/Author.vue
rm vue-model-manager/src/components/ModelDetail.vue
rm vue-model-manager/src/components/QueryBuilder.vue
rm vue-model-manager/src/components/MultiSelect.vue
rm vue-model-manager/src/composables/useJqlFilter.ts
rm -f vue-model-manager/src/views/Issues.vue.bak
```

- [ ] **Step 2: Verify the app builds**

Run: `cd vue-model-manager && npm run build`
Expected: Build succeeds with no errors. There may be type warnings but no build failures.

- [ ] **Step 3: Run type check**

Run: `cd vue-model-manager && npx vue-tsc --noEmit`
Expected: No errors. If there are errors, fix any remaining import references to deleted files in any surviving files.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "cleanup: remove deprecated views and components replaced by new design"
```

---

### Task 16: Integration Test — Run the App

**Files:** None (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev:all`
Expected: Both Express API (port 3001) and Vite dev server (port 5173) start without errors.

- [ ] **Step 2: Verify landing page**

Navigate to `http://localhost:5173` in a browser. Expected:
- Model list with cards showing model names, creator badges, provider strips
- Search bar, filter dropdowns, sort controls visible
- Clicking a model card opens the slide-out detail panel with provider comparison table
- Arrow keys navigate between models in detail panel
- Escape closes detail panel

- [ ] **Step 3: Verify all routes**

- `/dashboard` — Stats grid, provider health grid
- `/creators` — Grid of creator cards
- `/creator/:id` — Creator detail with models
- `/issues` — Known issues page (unchanged)
- Old routes (`/free`, `/all`, `/models`, `/super/:id`, `/author`, `/family`) — All redirect to appropriate new routes

- [ ] **Step 4: Verify filters**

- Search filters by model name
- Creator filter shows only models from selected creator
- Status filter (Working/Mixed/Down/Untested) works
- Free/Paid filter works
- Sort by Name/Context/Price/Providers with direction toggle

- [ ] **Step 5: Verify export**

- Export JSON downloads a file with model+provider data
- Export CSV downloads a CSV file

- [ ] **Step 6: Verify mobile responsiveness**

Resize browser to 360px width. Expected:
- Navigation collapses to mobile drawer
- Model cards stack in single column
- Controls stack vertically
- Detail panel takes full width

- [ ] **Step 7: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: integration test fixes"
```

---

## Self-Review

Checking each spec requirement against tasks:

| Spec Requirement | Task | Status |
|---|---|---|
| Hierarchical API response (creators → models → providers) | Task 2 | Covered |
| Creator slug normalization with overrides | Task 2 | Covered |
| Provider references with health stats | Task 2 | Covered |
| New TypeScript types | Task 1 | Covered |
| Pinia store rewrite | Task 3 | Covered |
| ModelList as new landing page (/) | Task 9 | Covered |
| ModelCard with provider strip | Task 8 | Covered |
| ProviderBlock component | Task 4 | Covered |
| ProviderStrip with overflow | Task 5 | Covered |
| ProviderTable (Mastra-style) | Task 6 | Covered |
| ModelDetailPanel slide-out | Task 7 | Covered |
| New Dashboard (/dashboard) | Task 10 | Covered |
| CreatorList (/creators) | Task 11 | Covered |
| CreatorDetail (/creator/:id) | Task 11 | Covered |
| Issues view preserved | Task 12 | Covered |
| Router updates + redirects | Task 13 | Covered |
| App.vue nav update | Task 14 | Covered |
| Delete 12 old files | Task 15 | Covered |
| Search, filters, sort, export | Task 9 | Covered |
| Keyboard navigation (arrow keys, escape) | Task 7 | Covered |
| Mobile responsive | All view tasks | Covered |
| Preserved: role rankings, validation, known issues, usage | Tasks 3, 7, 9, 10 | Covered |

**Placeholder scan:** No TBDs, TODOs, or "add appropriate X" patterns found. All steps contain actual code.

**Type consistency:** All types match between Task 1 (types.ts), Task 3 (store), and Tasks 4-11 (components). ProviderDatapoint fields are consistent. ModelData.super_id is used as the lookup key throughout.

**Scope check:** This is a full redesign but focused and coherent. Each task produces independently verifiable output.
