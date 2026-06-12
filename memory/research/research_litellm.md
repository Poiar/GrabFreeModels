---
name: research-litellm
description: 'LiteLLM architectural patterns — provider abstraction, cost map, auth, health checking, fallback routing'
metadata:
  node_type: memory
  type: reference
  originSessionId: 44d00769-02b1-4e82-9bad-40385a18dbea
---

# LiteLLM Architecture Patterns

Source: github.com/BerriAI/litellm — researched 2026-06-09

## 1. Provider Abstraction & Registration

### Three-tier registration system

**Tier A: Python class-based** (for providers with unique API formats)

- Each provider implements a Config class extending `BaseConfig`
- `transform_request()` — converts OpenAI-format → provider-specific
- `transform_response()` — converts provider response → OpenAI-format ModelResponse
- `get_supported_openai_params()` — which OpenAI params this provider supports
- `get_error_class()` — maps HTTP errors to LiteLLM exception types

**Tier B: JSON-based** (for OpenAI-compatible providers) — MOST RELEVANT

- Declarative `providers.json` with per-provider entries:

```json
{
  "provider_name": {
    "base_url": "https://api.example.com/v1",
    "api_key_env": "PROVIDER_API_KEY",
    "api_base_env": "PROVIDER_API_BASE",
    "base_class": "openai_gpt",
    "param_mappings": { "max_completion_tokens": "max_tokens" },
    "special_handling": { "convert_content_list_to_string": true },
    "supported_endpoints": ["/v1/chat/completions"],
    "headers": { "api-subscription-key": "{api_key}" },
    "constraints": {}
  }
}
```

**Tier C: Model-to-provider resolution** via name patterns + cost map lookup

- `get_llm_provider()` checks prefixes (`openai/gpt-4o`), regex patterns (`claude-*`), cost map
- `PatternMatchRouter` supports wildcard routing (`openai/*`)

## 2. Auth, Error Handling, Rate Limiting

### Auth model

- Typed `CredentialLiteLLMParams` with optional fields: api_key, api_base, api_version, vertex_project, vertex_location, aws_access_key_id, etc.
- Per-provider env var convention (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
- Custom headers with `{api_key}` template variable

### Error classification

Standard exception hierarchy:

- `AuthenticationError` — 401
- `RateLimitError` — 429 + heuristic string matching ("rate limit", "rate_limit", "service tier capacity exceeded")
- `ContextWindowExceededError` — string matching ("exceed context limit", etc.)
- `ContentPolicyViolationError`, `BadRequestError`, `InternalServerError`, `ServiceUnavailableError`, `Timeout`, `NotFoundError`, `APIConnectionError`
- `BaseLLMException` stores status_code, message, headers, request, response, body

### Cooldown decision tree

```python
def _is_cooldown_required(exception_status, exception_str):
    # 429 → cooldown
    # 401 → cooldown
    # 408 → cooldown
    # 404 → cooldown
    # 4xx (other) → DO NOT cooldown (client error)
    # 5xx → cooldown
    # APIConnectionError → NO cooldown (transient)
```

- `CooldownCache` with TTL, stored per deployment ID
- v2 logic: also cooldowns if failure rate > ALLOWED_FAILURE_RATE_PER_MINUTE

## 3. Model Cost Map

Single JSON file (1.5MB, 2762 entries, 114 providers). Each entry:

```json
{
  "litellm_provider": "openai",
  "mode": "chat",
  "input_cost_per_token": 2.5e-6,
  "output_cost_per_token": 1e-5,
  "max_input_tokens": 128000,
  "max_output_tokens": 16384,
  "supports_function_calling": true,
  "supports_vision": true,
  "supports_prompt_caching": true,
  "supports_reasoning": true,
  "cache_read_input_token_cost": 1.25e-6,
  "tiered_pricing": true,
  "deprecation_date": "2026-06-01"
}
```

- 50+ boolean feature capability flags
- Tiered pricing (above_128k, batch, flex, cache tiers)
- Multimodal costs (per image, per audio token, per video second)
- 153 unique field names across all entries
- Modes: chat, image_generation, embedding, audio_transcription, completion, rerank, etc.

## 4. Health Checking & Fallback Routing

### Health state cache

```python
class DeploymentHealthStateValue:
    is_healthy: bool
    timestamp: float
    reason: str
```

- **"Stale means healthy"** — entries older than staleness_threshold assumed healthy
- Continuous background health check via APScheduler, results cached in DualCache (in-memory + Redis)
- Prevents cascading failures from stale negative data

### Fallback routing

- Multiple fallback types: generic, context_window, content_policy
- `max_fallbacks` depth limit (default 5)
- Typed fallback categories: `context_window_fallbacks`, `content_policy_fallbacks`
- Wildcard fallback: `{"*": ["fallback-model"]}`
- Plugable routing strategies in `router_strategy/`:
  - `least_busy`, `lowest_latency`, `lowest_tpm_rpm`, `simple_shuffle`, `budget_limiter`
  - `tag_based_routing`, `adaptive_router` (contextual bandit), `complexity_router`, `auto_router`
- `num_retries`, `timeout`, `stream_timeout`, `retry_after` per call
- `enable_pre_call_checks` for TPM/RPM check before routing

### Fallback execution

```python
async def run_async_fallback(router, fallback_model_group, original_model_group,
    original_exception, max_fallbacks, fallback_depth, **kwargs):
    if fallback_depth >= max_fallbacks: raise original_exception
    for mg in fallback_model_group:
        try: return await router.async_function_with_fallbacks(model=mg, **kwargs)
        except: error_from_fallbacks = e
    raise error_from_fallbacks
```

## Summary: Patterns to borrow

| Pattern              | What to borrow                                                            |
| -------------------- | ------------------------------------------------------------------------- |
| Provider config      | Declarative JSON: base_url, api_key_env, param_mappings, special_handling |
| Model cost map       | Centralized JSON with per-model pricing, capacity, 50+ boolean features   |
| Provider resolution  | String patterns + cost map lookup                                         |
| Auth model           | Typed params + per-provider env var convention                            |
| Error classification | String-matching heuristics → typed exception hierarchy                    |
| Cooldown             | Decision tree by HTTP status; failure-rate-based cooldown; TTL cache      |
| Health state         | TTL-based with stale=healthy (fail-open) semantics                        |
| Fallback routing     | Error-category-specific fallback lists with max depth                     |
| Routing strategy     | Plugable strategy interface (least busy, lowest cost, lowest latency)     |
