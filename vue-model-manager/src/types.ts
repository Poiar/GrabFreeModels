export interface ModelStatus {
  tested: string | null;
  result: 'working' | 'broken' | 'rate_limited' | 'untested' | 'not_found';
  detail: string;
}

export interface HealthSnapshot {
  date: string;
  status: string;
  detail: string;
  latency_ms: number | null;
}

export interface ModelHealthHistory {
  snapshots: HealthSnapshot[];
  stability: number;
  last_working: string | null;
  streak: number;
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
  quantization: string | null;
  is_free: boolean;
  supports_tools: boolean | null;
  supports_reasoning: boolean | null;
  supports_attachment: boolean | null;
  supports_structured_output: boolean | null;
  output_limit: number | null;
  temperature: boolean | null;
  open_weights: boolean | null;
  tags: string[];
  best_for: string[];
  input_types: string[];
  output_types: string[];
  model_tier: string[];
  model_variant: string | null;
  param_count_b: number | null;
  active_param_count_b: number | null;
  expert_count: number | null;
  thinking_variant: boolean;
  model_version: string | null;
  release_stage: string | null;
  coding_specialized: boolean;
  description: string | null;
  status: ModelStatus;
  last_success: string | null;
  _removed: boolean;
  _removedDate?: string;
  notes?: string;
  priority_score: number | null;
  limitations?: ModelLimitations | null;
  source_ids: number[];
  provider_type: string | null;
  serves_third_party: boolean | null;
  hardware: string | null;
  is_openai_compat: boolean | null;
  supports_streaming: boolean | null;
  requires_account_id: boolean | null;
  max_rpm: number | null;
  max_tpm: number | null;
  max_daily_requests: number | null;
  requires_card: boolean | null;
  family: string | null;
  base_model: string | null;
  derivation_method: string | null;
  knowledge_cutoff: string | null;
  last_updated: string | null;
  release_date: string | null;
  deprecated_at: string | null;
  failure_category: string | null;
  base_url: string | null;
  npm_package: string | null;
  created_at: string | null;
}

export interface ModelData {
  super_id: number;
  name: string;
  slug: string;
  creator: string | null;
  base_creator: string | null;
  family: string | null;
  base_model: string | null;
  derivation_method: string | null;
  best_for: string[];
  best_context: number | null;
  min_context: number | null;
  role_rankings: Record<string, number>;
  providers: ProviderDatapoint[];
}

export interface CreatorData {
  id: string;
  name: string;
  type: 'lab' | 'user' | 'other';
  role: 'Fine-tuner' | 'Model creator';
  description: string | null;
  model_count: number;
  provider_count: number;
  models: ModelData[];
}

export interface FamilyData {
  name: string;
  model_count: number;
  provider_count: number;
  models: ModelData[];
}

export interface ProviderReference {
  id: string;
  slug: string;
  name: string;
  npm_package: string | null;
  base_url: string;
  provider_type: string | null;
  serves_third_party: boolean | null;
  hardware: string | null;
  is_openai_compat: boolean | null;
  supports_streaming: boolean | null;
  requires_account_id: boolean | null;
  max_rpm: number | null;
  max_tpm: number | null;
  max_daily_requests: number | null;
  requires_card: boolean | null;
  description: string | null;
  model_count: number;
  working_count: number;
  health_status: string;
}

export interface Organization {
  id: string;
  name: string;
  kind: 'creator' | 'provider' | 'both';
  // Shared
  description: string | null;
  provider_description: string | null;
  provider_slugs: string[];
  // Creator facet
  creator_type: 'lab' | 'user' | 'other' | null;
  creator_role: string | null;
  models: ModelData[];
  model_count: number;
  provider_count: number;
  // Provider facet
  base_url: string | null;
  npm_package: string | null;
  provider_type: string | null;
  serves_third_party: boolean | null;
  hardware: string | null;
  is_openai_compat: boolean | null;
  supports_streaming: boolean | null;
  requires_account_id: boolean | null;
  max_rpm: number | null;
  max_tpm: number | null;
  max_daily_requests: number | null;
  requires_card: boolean | null;
  health_status: string | null;
  working_count: number;
}

export interface ModelsData {
  /** @deprecated Use organizations instead */
  creators: CreatorData[];
  /** @deprecated Use organizations instead */
  providers: ProviderReference[];
  organizations: Organization[];
  models: DatapointModel[];
  provider_health: Record<string, ProviderHealth>;
  _test_summary: TestSummary;
  _test_summary_previous: TestSummary | null;
  _model_health?: Record<string, ModelHealthHistory>;
  _role_rankings: {
    description: string;
    model: string[];
    build: string[];
    general: string[];
    small_model: string[];
    explore: string[];
    _scores?: Record<string, RoleScore[]>;
    _meta?: Record<string, RoleMeta>;
    _variants?: Record<
      string,
      {
        model: string[];
        build: string[];
        general: string[];
        small_model: string[];
        explore: string[];
        _scores?: Record<string, RoleScore[]>;
        _meta?: Record<string, RoleMeta>;
      }
    >;
  };
  _model_scores: ModelScoresData;
  _provider_usage: { description: string; [provider: string]: ProviderUsage | string };
  _known_issues: { description: string; issues: KnownIssue[] };
  _validation_method: ValidationMethod;
  _router_only_models?: {
    count: number;
    models: Array<{ slug: string; name: string; provider_count: number }>;
    checked_at: string;
  };
  _provider_routing_graph?: {
    routers: Record<
      string,
      Array<{ backend: string; name: string; type: string; shared_models: number }>
    >;
    built_at: string;
  };
  _provider_timeline?: {
    timeline: Array<{
      date: string;
      added: Array<{ slug: string; name: string; type: string }>;
      cumulative: number;
    }>;
    total: number;
    built_at: string;
  };
  _family_coverage?: {
    total: number;
    with_family: number;
    without_family: number;
    pct: number;
    with_base_model_no_family: number;
  };
  _failure_rates?: { description: string; models: Record<string, FailureRateEntry>; note?: string };
  _key_health?: KeyHealthData;
  _failover_suggestions?: { forward: Record<string, string[]>; reverse: Record<string, string[]> };
  _company_financials?: CompanyFinancials;
  _company_financials_history?: FinancialSnapshot[];
}

export interface CompanyFinancialEntry {
  name: string;
  subtitle: string;
  spend: number;
  revenue: number;
  annualBurn: number;
  isInfrastructure: boolean;
  hasLogo: boolean;
  pnl: number;
  pnlLabel: 'profitable' | 'unprofitable';
}

export interface CompanyFinancials {
  description: string;
  fetched_at: string;
  source_url: string;
  companies: CompanyFinancialEntry[];
  summary: {
    total_spend: number;
    total_revenue: number;
    total_pnl: number;
    profitable_count: number;
    unprofitable_count: number;
  };
}

export interface FinancialSnapshot {
  date: string;
  summary: CompanyFinancials['summary'];
  fetched_at: string;
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
  base_creator: string | null;
  source: string; // provider slug
  context_length: number | null;
  quantization: string | null;
  is_free: boolean;
  supports_tools: boolean | null;
  supports_reasoning: boolean | null;
  supports_attachment: boolean | null;
  supports_structured_output: boolean | null;
  output_limit: number | null;
  temperature: boolean | null;
  open_weights: boolean | null;
  family: string | null;
  base_model: string | null;
  derivation_method: string | null;
  knowledge_cutoff: string | null;
  releaseDate: string | null;
  lastUpdated: string | null;
  deprecated_at: string | null;
  tags: string[];
  best_for: string[];
  input_types: string[];
  output_types: string[];
  model_tier: string[];
  model_variant: string | null;
  param_count_b: number | null;
  active_param_count_b: number | null;
  expert_count: number | null;
  thinking_variant: boolean;
  model_version: string | null;
  release_stage: string | null;
  coding_specialized: boolean;
  description: string | null;
  status: ModelStatus;
  last_success: string | null;
  _removed: boolean;
  _removedDate?: string;
  notes?: string;
  priority_score: number | null;
  limitations?: ModelLimitations | null;
  npm_package: string | null;
  source_ids: number[];
  provider_type: string | null;
  serves_third_party: boolean | null;
  hardware: string | null;
  is_openai_compat: boolean | null;
  supports_streaming: boolean | null;
  requires_account_id: boolean | null;
  max_rpm: number | null;
  max_tpm: number | null;
  max_daily_requests: number | null;
  requires_card: boolean | null;
  failure_category: string | null;
  created_at: string | null;
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
  qualityBonus: number;
  qualityIntel: number;
  qualityCoding: number;
  qualitySpeed: number;
  qualityLatency: number;
  freshness?: number;
  releaseDate?: string | null;
  deprecated?: boolean;
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

export interface SourceInfo {
  id: number;
  slug: string;
  name: string;
  source_type: 'api_provider' | 'community_list';
}

export interface SourceToggleState {
  [sourceId: number]: boolean;
}

export interface KeyHealthEntry {
  provider: string;
  key_name: string;
  status: 'valid' | 'expired' | 'rate_limited' | 'unknown';
  last_checked: string;
  detail?: string;
}

export interface KeyHealthData {
  description: string;
  checked_at: string;
  keys: KeyHealthEntry[];
}

export interface ProviderLatencyStats {
  provider_slug: string;
  provider_name: string;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  sample_count: number;
  last_measured: string;
}

export interface OutageEvent {
  started: string;
  ended: string | null;
  duration_hours: number | null;
  models_affected: number;
}

export interface FlakyModel {
  super_id: number;
  slug: string;
  name: string;
  failure_rate_7d: number;
  samples_7d: number;
  failures_7d: number;
  failure_rate_30d: number | null;
  samples_30d: number;
  failures_30d: number;
}

export interface BenchmarkEntry {
  full_id: string;
  super_id: number;
  slug: string;
  name: string;
  creator: string | null;
  provider: string;
  scores: ModelScore[];
  intelligence: number | null;
  speed: number | null;
  cost: number | null;
}

export interface FailureRateEntry {
  full_id: string;
  failure_rate_7d: number | null;
  samples_7d: number;
  failures_7d: number;
  failure_rate_30d: number | null;
  samples_30d: number;
  failures_30d: number;
}
