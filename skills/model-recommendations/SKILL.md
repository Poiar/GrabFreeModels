---
name: model-recommendations
description: Use when suggesting models for the user's opencode setup. ALWAYS check this skill before recommending any model. Prevents suggesting models that don't properly support opencode's tool calling.
---

# Model Recommendations

## Active Configuration

See `C:\Users\pc\.config\opencode\opencode.jsonc` for the current live configuration (main model, small_model, agents, fallbacks). That file is the source of truth — never hardcode model names here.

## Rules

1. NEVER suggest models that don't natively support OpenAI-style tool calling. Known-bad patterns (last batch-verified — re-verify before trusting blindly):
     - `qwen3:*` **base/chat variants** (echo tool JSON as text — do NOT return proper `tool_calls`). Exception: `Qwen3-Coder` variants DO support tool calling.
     - `llama3.*` (echoes tool calls as text)
     - `codellama:*` (no native tool calling)
     - `deepseek-coder:*` (echoes tools as text)
     - `mistral:7b` (no native OpenAI tool calling)
     - `phi4` (echoes tool definitions as text)
     - **Always verify** by checking `available-models.json` status and `supports_tools` field from provider API before recommending an unfamiliar model.

2. When the user asks "which model is best for X", refer to the `best_for` field in `available-models.json` rather than guessing.

3. If suggesting a new model, ALWAYS verify it supports OpenAI tool calling first by checking the model's documentation or testing with a simple tool-calling request. If unsure, say "I need to test this model first" rather than guessing.
