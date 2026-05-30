export interface ModelStatus {
  tested: string | null
  result: 'working' | 'broken' | 'rate_limited' | 'untested' | 'paid'
  detail: string
}

export interface Model {
  id: string
  name: string
  provider: string
  context_length: number | null
  input_price_per_million: number | null
  output_price_per_million: number | null
  is_free: boolean
  best_for: string[]
  notes: string
  status: ModelStatus
}

export interface TestSummary {
  date: string
  method: string
  results: {
    working: string[]
    broken: string[]
    untested: string[]
    rate_limited: string[]
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

export interface ModelsData {
  models: Model[]
  _test_summary: TestSummary
  _role_rankings: {
    description: string
    model: string[]
    build: string[]
    general: string[]
    small_model: string[]
    explore: string[]
    stable: string[]
  }
  _provider_usage: {
    description: string
    [provider: string]: ProviderUsage | string
  }
  _known_issues: {
    description: string
    issues: KnownIssue[]
  }
  _validation_method: ValidationMethod
  provider_health: Record<string, ProviderHealth>
}
