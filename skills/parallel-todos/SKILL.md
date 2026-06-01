---
name: parallel-todos
description: Use when you have a todo list (from todowrite) where items are independent and don't touch shared files/state. Automatically spawns a subagent for each todo item to work in progress in parallel. Trigger whenever you create or update a todo list with 2+ independent items.
---

# Parallel Todo Execution

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

1. **Create the todo list** with all items as `pending`
2. **Pick the right agent per item**:
   - `subagent_type: "explore"` — read-only tasks: research, search, analysis, summarization
   - `subagent_type: "general"` — write tasks: edit files, implement features, run commands
   - When in doubt, use `general`
3. **Mark all as `in_progress`**, then spawn one subagent per item via the `task` tool — each subagent gets a self-contained prompt with all context it needs
4. **Collect results** and mark each todo `completed` (or note blockers)
