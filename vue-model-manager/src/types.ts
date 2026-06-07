export interface ModelStatus {
  tested: string | null;
  result: 'working' | 'broken' | 'rate_limited' | 'untested' | 'not_found';
  detail: string;
}

export interface ModelLimitations {
  daily_tokens?: number;
  daily_requests?: number;
  rate_limit?: string;
  requires_card?: boolean;
  subscription_required?: string;
  expires?: string;
  notes?: string;
}

// NEW hierarchical types

export interface ProviderDatapoint {
  full_id: string;
  provider: string;
  provider_slug: string;
  context_length: number | null;
  is_free: boolean;
  supports_tools: boolean | null;
  supports_reasoning: boolean | null;
  output_limit: number | null;
  temperature: boolean | null;
  open_weights: boolean | null;
  tags: string[];
  best_for: string[];
  input_types: string[];
  output_types: string[];
  status: ModelStatus;
  last_success: string | null;
  _removed: boolean;
  _removedDate?: string;
  notes?: string;
  priority_score: number | null;
  limitations?: ModelLimitations | null;
}

export interface ModelData {
  super_id: number;
  name: string;
  slug: string;
  family: string | null;
  best_for: string[];
  best_context: number | null;
  role_rankings: Record<string, number>;
  providers: ProviderDatapoint[];
}

export interface CreatorData {
  id: string;
  name: string;
  model_count: number;
  provider_count: number;
  models: ModelData[];
}

export interface ProviderReference {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  model_count: number;
  working_count: number;
  health_status: string;
}

export interface ModelsData {
  creators: CreatorData[];
  providers: ProviderReference[];
  models: DatapointModel[];
  provider_health: Record<string, ProviderHealth>;
  _test_summary: TestSummary;
  _role_rankings: {
    description: string;
    model: string[];
    build: string[];
    general: string[];
    small_model: string[];
    explore: string[];
    _scores?: Record<string, RoleScore[]>;
    _meta?: Record<string, RoleMeta>;
  };
  _model_scores: ModelScoresData;
  _provider_usage: { description: string; [provider: string]: ProviderUsage | string };
  _known_issues: { description: string; issues: KnownIssue[] };
  _validation_method: ValidationMethod;
}

// EXISTING types (kept for backward compatibility)

/** @deprecated Use DatapointModel */
export type Model = DatapointModel;

export interface DatapointModel {
  id: string; // full_id: "openrouter/owl-alpha"
  super_id: number;
  super_name: string;
  name: string; // alias for super_name (backward compat)
  provider: string;
  creator: string | null;
  source: string; // provider slug
  context_length: number | null;
  is_free: boolean;
  supports_tools: boolean | null;
  supports_reasoning: boolean | null;
  output_limit: number | null;
  temperature: boolean | null;
  open_weights: boolean | null;
  family: string | null;
  knowledge_cutoff: string | null;
  releaseDate: string | null;
  lastUpdated: string | null;
  tags: string[];
  best_for: string[];
  input_types: string[];
  output_types: string[];
  status: ModelStatus;
  last_success: string | null;
  _removed: boolean;
  _removedDate?: string;
  notes?: string;
  priority_score: number | null;
  limitations?: ModelLimitations | null;
}

export interface SuperModel {
  id: number;
  name: string;
  datapoints: DatapointModel[];
  // Aggregated: best values across all datapoints
  best_context_length: number | null;
  any_working: boolean;
  any_tools: boolean;
  providers: string[];
  sources: string[];
}

export interface TestSummary {
  date: string;
  results: {
    working: string[];
    broken: string[];
    untested: string[];
    rate_limited: string[];
    not_found: string[];
    untestable: string[];
    schema_issues: string[];
  };
}

export interface KnownIssue {
  model_id: string;
  issue: string;
  impact: string;
  workaround: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  reported: string;
  last_verified: string;
}

export interface ProviderHealth {
  working: number;
  rate_limited: number;
  broken: number;
  total: number;
}

export interface ProviderUsage {
  month: string;
  reason: string;
}

export interface ValidationMethod {
  description: string;
  procedure: string;
  date: string;
  key_findings: Record<string, string>;
}

export interface RoleScore {
  id: string;
  score: number;
  ctx: number;
  ctxScore: number;
  ctxWeight: number;
  ctxContrib: number;
  tagBonus: number;
  tagPenalty: number;
  penaltyContrib: number;
  nameSizePenalty: number;
  matchedTags: string[];
  matchedPenaltyTags: string[];
}

export interface RoleMeta {
  description: string;
  ctxWeight: number;
  tagKeywords: string[];
  tagPenaltyKeywords: string[];
  nameSizePenalty: boolean;
  maxCtx: number | null;
  needsTools: boolean;
}

export interface ModelScore {
  source: string;
  score_type: string;
  score_value: number | null;
}

export interface ModelScoresData {
  description: string;
  sources: string[];
  scores: Record<string, ModelScore[]>;
}
