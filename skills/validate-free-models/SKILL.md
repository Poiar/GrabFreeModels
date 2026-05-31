---
name: validate-free-models
description: Use when testing or updating free model statuses in available-models.json. Trigger when adding new free models, re-testing rate-limited models, or when the user asks about model availability/status.
---

# Validate Free Models

## Key Lessons Learned

- **Single call is insufficient**: Several models succeed on the first request but 429 on every subsequent request.
- **Parallel load causes false 429s**: Running all models simultaneously can trigger account-level rate limits even on reliable models. Run burst and delayed phases concurrently, NOT all models at once.
- **Model ID format matters**: OpenRouter API calls should NOT use the `openrouter/` prefix.
  - ✅ `qwen/qwen3-coder:free`
  - ❌ `openrouter/qwen/qwen3-coder:free` (returns 400)
- **Working ≠ all 6 OK under parallel load**: If a model gets 5/6 OK with intermittent 429s only during parallel execution, it's still reliable when called sequentially. Note this in the detail.

## Test Procedure

### Use the Script

The `validate-free-models.js` script handles multi-provider routing, burst/delayed phases, and JSON updates:

```bash
# Re-test all rate-limited and untested models
node scripts/validate-free-models.js --apply

# Test specific models
node scripts/validate-free-models.js --models "openrouter/provider/model:free" --apply
```

The script auto-detects the correct API URL and key per provider (OpenRouter, Cerebras, NVIDIA, HuggingFace, LLM Gateway, DeepSeek).

### Manual One-Off Test

For a single OpenRouter model when the script is unavailable, read auth keys from `auth.json` (see `test-model-auth` skill) and use the pattern from the script. Key points:
- Strip `openrouter/` prefix from model IDs before calling the API
- Run 3 burst requests (300ms apart) then 3 delayed requests (5s apart)
- **Do NOT launch all models as individual parallel jobs** — this causes account-level rate limiting

## Interpret Results

| Pattern | Verdict | Status |
|---------|---------|--------|
| All 6 OK | Not rate limited | `working` |
| 5/6 OK, 1×429 only during parallel load | Reliable sequentially | `working` (note: intermittent 429 under parallel load) |
| All 429 (both phases) | Persistently rate limited | `rate_limited` |
| 429 first, then OK with delays | Burst-limited only | `rate_limited` (note: succeeds with delays) |
| Single OK among many 429s | Effectively rate limited | `rate_limited` (note: rare/unreliable success) |
| 400 Bad Request | Wrong ID format | Try without `openrouter/` prefix |
| 404 Not Found | Model removed | `broken` |

## Updating available-models.json

Update model `status` fields, `_test_summary`, and `_role_rankings` after testing. Use Node.js for batch edits to avoid JSON corruption. Always validate after editing:

```bash
node -e "JSON.parse(require('fs').readFileSync('C:/OC/GrabFreeModels/available-models.json','utf8')); console.log('Valid JSON')"
```

## Notes for Each Status Change

Always include in `detail`:
- How many requests sent (e.g., "6 requests: 3 burst + 3 delayed")
- Success/failure count (e.g., "5/6 OK")
- Rate limiting pattern (burst vs persistent vs intermittent)
- Whether parallel load affected results
- Special call format requirements (prefix, etc.)
