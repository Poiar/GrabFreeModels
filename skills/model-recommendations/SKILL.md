---
name: model-recommendations
description: Use when suggesting models for the user's opencode setup. ALWAYS check this skill before recommending any model. Prevents suggesting models that don't properly support opencode's tool calling.
---

# Model Recommendations

## Active Configuration

See `C:\Users\pc\.config\opencode\opencode.jsonc` for the current live configuration (main model, small_model, agents, fallbacks). That file is the source of truth — never hardcode model names here.

## Rules

1. **Check `supports_tools` first.** Before recommending any model, check its `supports_tools` field in the database (`datapoint_models` table) or via `GET /api/data`. If `false`, do NOT recommend. Unknown models default to `true` — if you're unsure, say "I need to verify tool calling support first".

2. When the user asks "which model is best for X", refer to the `best_for` field (`datapoint_model_features` table) rather than guessing.

3. If suggesting an unfamiliar model, ALWAYS verify it supports OpenAI tool calling first. If unsure, say "I need to test this model first" rather than guessing.
