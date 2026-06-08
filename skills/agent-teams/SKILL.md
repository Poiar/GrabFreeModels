---
name: agent-teams
description: Form a team of specialized agents for complex multi-domain tasks. Triggers: "use a team", "parallelize this", "split this up", "too much for one session", tasks spanning 3+ files across different domains (frontend+backend+data), multi-step implementations with independent work streams.
---

# Agent Teams

**Default to teams.** When you receive a task, evaluate it against the criteria below BEFORE implementing. If it matches, spawn a team immediately — don't start coding solo.

You have a large context window and specialized agents available. Solo work is for trivial fixes. Everything else gets a team.

## Decision (before any code)

Ask yourself: "Can any part of this be done in parallel?"

- Multiple files across domains? → **Team.**
- Research needed + implementation? → **Team** (Explore in background while you code).
- 3+ independent steps? → **Team.**
- User wants speed? → **Team.**
- Single file, trivial fix? → Solo.
- Every step depends on the previous one? → Solo (but reconsider — architecture and implementation are often separable).

When in doubt, team up. The cost of a small team for a medium task is near zero. The cost of soloing a large task is wasted tokens and worse results.

## How

1. `TeamCreate` with a descriptive name
2. `TaskCreate` for each independent work stream
3. Spawn agents via `Agent` with `team_name` and matching `subagent_type`
4. Assign tasks via `TaskUpdate` with `owner`
5. When all tasks complete, shutdown agents and `TeamDelete`

## Agent types

Match the agent to the work. Read-only agents (`Explore`, `Plan`) do research in parallel with implementation.

| Domain | Agent type |
|--------|-----------|
| Architecture, design, trade-offs | `architect` |
| API, server, routes, middleware | `backend-engineer` |
| Database, schema, queries, pipelines | `data-engineer` |
| CI/CD, deploy, monitoring | `devops-engineer` |
| UI/UX review, accessibility | `ui-ux-reviewer` |
| Performance, optimization | `performance` |
| Code review, refactoring, naming | `code-quality` |
| Test planning, edge cases | `qa` |
| Security review, vulnerabilities | `security` |
| Scraping, Playwright, data extraction | `scraping` |

## Tips

- Team up early, not halfway through
- Give each agent a self-contained prompt with clear scope and deliverables
- Research agents run in background while you start implementation
- Don't wait for all agents — act on the first result that arrives
