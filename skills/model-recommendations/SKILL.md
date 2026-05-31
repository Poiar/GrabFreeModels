---
name: model-recommendations
description: Use when suggesting models for the user's opencode setup. ALWAYS check this skill before recommending any model. Prevents suggesting models that don't properly support opencode's tool calling.
---

# Model Recommendations

## Active Configuration
- **main model**: `openrouter/owl-alpha` (cloud, free, agentic, tool use, 1M context. Special auto-routing model — not in standard :free listing but verified working)
- **small_model**: `openrouter/nvidia/nemotron-nano-9b-v2:free` (cloud, free, 9B, 6/6 tested, fast reasoning + non-reasoning)
- **build_agent**: `openrouter/poolside/laguna-m.1:free` (cloud, free, 263B, agentic coding. Fallback: `openrouter/openrouter/free`)
- **plan_agent**: `openrouter/z-ai/glm-5.1` (cloud, free, latest GLM, strong reasoning. Fallback: `openrouter/openrouter/free`)
- **general_agent**: `opencode/big-pickle` (cloud, free, general purpose. Fallback: `openrouter/openrouter/free`)
- **explore_agent**: `opencode/deepseek-v4-flash-free` (cloud, fast, codebase search. Fallback: `openrouter/openrouter/free`)
- **universal fallback**: `openrouter/openrouter/free` — auto-routes to best available free model
- **vision models**: `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` (6/6 tested), `openrouter/z-ai/glm-5v-turbo` (vision), `llmgateway/glm-4.6v-flash` (vision)

## Rules

1. NEVER suggest models that don't natively support OpenAI-style tool calling. This includes:
     - `qwen3:*` **base/chat variants** (echo tool JSON as text — do NOT return proper `tool_calls`). Exception: `Qwen3-Coder` variants DO support tool calling — verified working.
     - `llama3.*` (echoes tool calls as text)
     - `codellama:*` (no native tool calling)
     - `deepseek-coder:*` (echoes tools as text)
     - `mistral:7b` (no native OpenAI tool calling)
     - `phi4` (echoes tool definitions as text)
     - **Always verify** by checking `available-models.json` status and `supports_tools` field from provider API before recommending an unfamiliar model.

2. When the user asks "which model is best for X", refer to the `best_for` field in `available-models.json` rather than guessing.

3. If suggesting a new model, ALWAYS verify it supports OpenAI tool calling first by checking the model's documentation or testing with a simple tool-calling request. If unsure, say "I need to test this model first" rather than guessing.
