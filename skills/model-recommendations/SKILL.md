---
name: model-recommendations
description: Use when suggesting models for the user's opencode setup. ALWAYS check this skill before recommending any model. Prevents suggesting models that don't properly support opencode's tool calling.
---

# Model Recommendations

## Active Configuration
- **main model**: `openrouter/owl-alpha` (cloud, free, proper tool calling)
- **small_model**: `opencode/deepseek-v4-flash-free` (cloud, free, fast, designed for small tasks)
- **build_agent**: `openrouter/openai/gpt-oss-120b:free` (cloud, free, 120B MoE, agentic tasks, tool use. Note: returns extra `reasoning`/`reasoning_details` fields — may cause schema warnings in strict clients)
- **plan_agent**: `openrouter/arcee-ai/trinity-large-thinking:free` (cloud, free, reasoning-focused for planning)
- **general_agent**: `openrouter/nvidia/nemotron-3-super-120b-a12b:free` (cloud, free, 120B params, 1M context, general purpose)
- **explore_agent**: `opencode/deepseek-v4-flash-free` (cloud, fast, codebase search)

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
