---
name: validate-free-models
description: Use when testing, validating, or updating the status of free models in available-models.json. Ensures free models are properly tested for rate limiting. ALWAYS use parallel subagents (Start-Job) to run independent test phases concurrently. Trigger when adding new free models, re-testing rate-limited models, or when the user asks about model availability/status.
---

# Validate Free Models

When validating free models, **never rely on a single API call**. Models may succeed once but fail on subsequent requests due to rate limiting. **Always run test phases in parallel using PowerShell jobs** — burst and delayed phases are independent and should run concurrently.

## Key Lessons Learned

- **Single call is insufficient**: Several models succeed on the first request but 429 on every subsequent request.
- **Parallel load causes false 429s**: Running all models simultaneously via Start-Job can trigger account-level rate limits even on reliable models. Use parallel jobs to run Phase 1 (burst) and Phase 2 (delayed) concurrently, NOT to run all models at once.
- **Model ID format matters**: OpenRouter API calls should NOT use the `openrouter/` prefix.
  - ✅ `qwen/qwen3-coder:free`
  - ❌ `openrouter/qwen/qwen3-coder:free` (returns 400)
- **Working ≠ all 6 OK under parallel load**: If a model gets 5/6 OK with intermittent 429s only during parallel execution, it's still reliable when called sequentially. Note this in the detail.

## Test Procedure

### Option A: Use the Script (Recommended)

The `validate-free-models.ps1` script handles multi-provider routing, burst/delayed phases, and JSON updates:

```powershell
# Re-test all rate-limited and untested models
.\scripts\validate-free-models.ps1 -Apply

# Test specific models
.\scripts\validate-free-models.ps1 -Models "openrouter/provider/model:free" -Apply
```

The script auto-detects the correct API URL and key per provider (OpenRouter, Cerebras, NVIDIA, HuggingFace, LLM Gateway, DeepSeek).

### Option B: Manual PowerShell (for one-off tests)

When testing a single model manually or the script is unavailable:

```powershell
$auth = Get-Content 'C:\Users\pc\.local\share\opencode\auth.json' | ConvertFrom-Json
$key = $auth.openrouter.key

$testScript = {
    param($model, $apiKey, $phase)
    $headers = @{
        'Content-Type' = 'application/json'
        'Authorization' = 'Bearer ' + $apiKey
        'HTTP-Referer' = 'https://opencode.ai'
        'X-Title' = 'opencode'
    }
    # Strip openrouter/ prefix — API calls must NOT use it
    $cleanModel = $model -replace '^openrouter/', ''
    $results = @()
    for ($i = 1; $i -le 3; $i++) {
        $body = @{ model = $cleanModel; messages = @(@{ role = 'user'; content = "Reply with OK" }); max_tokens = 10 } | ConvertTo-Json
        try {
            $r = Invoke-RestMethod -Uri 'https://openrouter.ai/api/v1/chat/completions' -Method POST -Headers $headers -Body $body -TimeoutSec 30
            $results += "OK"
        } catch {
            $results += [int]$_.Exception.Response.StatusCode
        }
        if ($phase -eq 'burst') { Start-Sleep -Milliseconds 300 }
        else { Start-Sleep -Seconds 5 }
    }
    [PSCustomObject]@{ Model = $model; Phase = $phase; Results = ($results -join ', ') }
}
```

For multi-provider testing, run burst and delayed tests as two parallel jobs per model. **Do NOT launch all models as individual parallel jobs** — this causes account-level rate limiting that produces false 429s.

### Step 3: Interpret results

| Pattern | Verdict | Status |
|---------|---------|--------|
| All 6 OK | Not rate limited | `working` |
| 5/6 OK, 1×429 only during parallel load | Reliable sequentially | `working` (note: intermittent 429 under parallel load) |
| All 429 (both phases) | Persistently rate limited | `rate_limited` |
| 429 first, then OK with delays | Burst-limited only | `rate_limited` (note: succeeds with delays) |
| Single OK among many 429s | Effectively rate limited | `rate_limited` (note: rare/unreliable success) |
| 400 Bad Request | Wrong ID format | Try without `openrouter/` prefix |
| 404 Not Found | Model removed | `broken` |

## Extracting Status Codes

PowerShell's `Invoke-RestMethod` throws on non-2xx:

```powershell
try {
    $r = Invoke-RestMethod -Uri 'https://openrouter.ai/api/v1/chat/completions' -Method POST -Headers $headers -Body $body -TimeoutSec 15
    "OK"
} catch {
    [int]$_.Exception.Response.StatusCode
}
```

## Updating available-models.json

Use a Node.js script for batch updates to avoid JSON corruption:

```bash
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('C:/OC/GrabFreeModels/available-models.json','utf8'));

// Update model statuses
j.models.forEach(m => {
  if (m.id === 'model-id') {
    m.status = { tested: 'YYYY-MM-DD', result: 'working', detail: '...' };
  }
});

// Update _test_summary
j._test_summary.date = 'YYYY-MM-DD';
j._test_summary.results.working = [...];
j._test_summary.results.rate_limited = [...];
j._test_summary.results.broken = [...];

// Fix _role_rankings (remove broken/rate-limited, add working)
for (const role of Object.keys(j._role_rankings)) {
  if (role === 'description') continue;
  j._role_rankings[role] = j._role_rankings[role].filter(r => !r.includes('broken-model'));
}

fs.writeFileSync('C:/OC/GrabFreeModels/available-models.json', JSON.stringify(j, null, 2));
console.log('Done');
"
```

Always validate after editing:
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
