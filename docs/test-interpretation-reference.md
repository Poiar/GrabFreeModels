# Test Interpretation Reference

| Pattern                                 | Verdict                   | Status                                                 |
| --------------------------------------- | ------------------------- | ------------------------------------------------------ |
| All 6 OK                                | Not rate limited          | `working`                                              |
| 5/6 OK, 1×429 only during parallel load | Reliable sequentially     | `working` (note: intermittent 429 under parallel load) |
| All 429 (both phases)                   | Persistently rate limited | `rate_limited`                                         |
| 429 first, then OK with delays          | Burst-limited only        | `rate_limited` (note: succeeds with delays)            |
| Single OK among many 429s               | Effectively rate limited  | `rate_limited` (note: rare/unreliable success)         |
| 400 Bad Request                         | Wrong ID format           | Try without `openrouter/` prefix                       |
| 404 Not Found                           | Model removed             | `broken`                                               |

## Notes for Each Status Change

Always include in `detail`:

- How many requests sent (e.g., "6 requests: 3 burst + 3 delayed")
- Success/failure count (e.g., "5/6 OK")
- Rate limiting pattern (burst vs persistent vs intermittent)
- Whether parallel load affected results
- Special call format requirements (prefix, etc.)
