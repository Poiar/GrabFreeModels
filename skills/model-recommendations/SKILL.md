---
name: model-recommendations
description: Use when suggesting models for the user's opencode setup. ALWAYS check this skill before recommending any model. Prevents suggesting models that don't properly support opencode's tool calling.
---

# Model Recommendations

## Active Configuration

See `C:\Users\pc\.config\opencode\opencode.jsonc` for the current live configuration (main model, small_model, agents, fallbacks). That file is the source of truth — never hardcode model names here.

## Rules

1. **Check `supports_tools` first.** Before recommending any model, check its `supports_tools` field in `available-models.json`. If `false`, do NOT recommend. Unknown models default to `true` — if you're unsure, say "I need to verify tool calling support first".

2. **Known models without OpenAI-style tool calling** (historically verified — always re-check `supports_tools` before trusting this list):
   - `qwen3:*` base/chat variants — echo tool JSON as text. Exception: `Qwen3-Coder` variants DO support tool calling.
   - `llama3.*` — echoes tool calls as text
   - `codellama:*` — no native tool calling
   - `deepseek-coder:*` — echoes tools as text
   - `mistral:7b` — no native OpenAI tool calling
   - `phi4` — echoes tool definitions as text

3. When the user asks "which model is best for X", refer to the `best_for` field in `available-models.json` rather than guessing.

4. If suggesting an unfamiliar model, ALWAYS verify it supports OpenAI tool calling first. If unsure, say "I need to test this model first" rather than guessing.
