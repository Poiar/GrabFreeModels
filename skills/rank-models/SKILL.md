---
name: rank-models
description: Rebuild `_role_rankings` in PostgreSQL. Triggers: "rank models", "re-rank", "rankings wrong".
---

# Rank Models

```bash
node scripts/rank-models.js          # preview
node scripts/rank-models.js --apply  # write to DB + export JSON
```

After applying: `node scripts/check-rankings.js` (must exit 0).

## Eligibility

Must be: `is_free=true`, `is_removed=false`, `status_result='working'`, `supports_tools=true`. Ineligible models in rankings = bug.

## Algorithm

```
score = (context_length / 1M) × ctxWeight + tagBonus
```

`tagBonus` = +1 per matching `best_for` tag. Tiebreaker: higher context_length.

## Roles

| Role | ctxWeight | Tag Keywords |
|---|---|---|
| **model** | 1.2 | agentic, tool, reasoning, current default, general purpose |
| **build** | 0.6 | coding, code, refactor, agentic, tool |
| **general** | 0.5 | general, multimodal, fast, lightweight, chinese |
| **small_model** | 0.0 | lightweight, ultra-lightweight, fast, quick, small |
| **explore** | 0.3 | thinking, reasoning, multimodal, new |
| **stable** | manual | — populated by `backfill-metadata.js`: free + working + tools + tested ≥30d ago |
