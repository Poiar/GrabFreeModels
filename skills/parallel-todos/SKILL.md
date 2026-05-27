---
name: parallel-todos
description: Use when you have a todo list (from todowrite) where items are independent and don't touch shared files/state. Automatically spawns a subagent for each todo item to work in progress in parallel. Trigger whenever you create or update a todo list with 2+ independent items.
---

# Parallel Todo Execution

When you have a todo list with items that don't touch shared state (different files, different models, read-only operations on the same file), **spawn a subagent for each item** instead of executing sequentially.

## When to Use

- Todo items operate on **different files** (e.g., lint file A, test file B, format file C)
- Todo items operate on the **same file but read-only** (e.g., grep different patterns)
- Todo items are **independent model validations** (e.g., test model X, test model Y)
- Todo items are **independent research tasks** (e.g., check status of provider A, check status of provider B)

## When NOT to Use

- Todo items **write to the same file** and order matters (e.g., sequential edits to one config)
- Later items **depend on earlier results** (e.g., "run tests" then "fix failures")
- Items require **user interaction** between steps
- Only 1-2 items that are fast — sequential is fine

## How to Execute

### 1. Create the todo list first

```
todowrite: [
  { content: "Validate model X", status: "pending" },
  { content: "Validate model Y", status: "pending" },
  { content: "Validate model Z", status: "pending" }
]
```

### 2. Spawn one subagent per item

Use the `task` tool with `subagent_type: "general"` (or `"explore"` for research tasks). Each subagent gets a clear, self-contained description:

```
task({
  subagent_type: "general",
  description: "Validate model X rate limiting",
  prompt: "Test model X for rate limiting by sending 6 requests (3 burst + 3 delayed). Report: model ID, results per request, verdict (working/rate_limited/broken). Use the API key from C:\Users\pc\.local\share\opencode\auth.json."
})
```

### 3. Collect results and update

Once all subagents return, update the todo list to `completed` for each item and aggregate results.

## Example: Validating Multiple Models

**Todo list:**
```
todowrite: [
  { content: "Validate openrouter/owl-alpha", status: "pending" },
  { content: "Validate openai/gpt-oss-120b:free", status: "pending" },
  { content: "Validate liquid/lfm-2.5-1.2b-instruct:free", status: "pending" }
]
```

**Spawn subagents in a single message:**
```
task({ description: "Validate owl-alpha", prompt: "..." })
task({ description: "Validate gpt-oss-120b:free", prompt: "..." })
task({ description: "Validate lfm-2.5-1.2b-instruct:free", prompt: "..." })
```

## Important Rules

- **Mark todos as `in_progress`** before spawning subagents
- **One subagent per todo item** — don't batch multiple items into one subagent
- **Each subagent must be self-contained** — include all context/files they need in the prompt
- **Don't spawn subagents for sequential tasks** that write to the same file
- **Always update the todo list** when subagents complete (mark `completed` or note blockers)
