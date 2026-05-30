# validate-free-models.ps1
# Re-tests rate-limited and untested free models to check if their status has changed.
# Runs both burst (rapid) and delayed test phases for each model.
#
# Usage: .\scripts\validate-free-models.ps1 [-Models "model-id-1","model-id-2"] [-Apply]
#   -Models : Specific models to test (default: all rate-limited and untested free models)
#   -Apply  : Write results to available-models.json (default: report only)

param(
    [string[]]$Models,
    [switch]$Apply
)

$ErrorActionPreference = "Continue"
$ModelsFile = "C:\OC\GrabFreeModels\available-models.json"
$AuthFile   = "C:\Users\pc\.local\share\opencode\auth.json"

$auth   = Get-Content $AuthFile | ConvertFrom-Json
$json   = Get-Content $ModelsFile | ConvertFrom-Json

# --- Determine which models to test ---
if ($Models.Count -gt 0) {
    $toTest = $json.models | Where-Object { $Models -contains $_.id }
} else {
    $toTest = $json.models | Where-Object {
        $_.is_free -and $_.status.result -in @("rate_limited", "untested", "broken")
    }
}

if ($toTest.Count -eq 0) {
    Write-Host "No models to test." -ForegroundColor Yellow
    exit 0
}

Write-Host "=== Validate Free Models ===" -ForegroundColor Cyan
Write-Host "Testing $($toTest.Count) models"
Write-Host ""

# --- Test Function ---
function Test-Model {
    param(
        [string]$ModelId,
        [string]$Phase,    # "burst" or "delayed"
        [string]$ApiKey,
        [string]$ApiUrl    # default OpenRouter URL
    )

    $headers = @{
        "Content-Type"  = "application/json"
        "Authorization" = "Bearer $ApiKey"
        "HTTP-Referer"  = "https://opencode.ai"
        "X-Title"       = "opencode"
    }

    # Strip openrouter/ prefix for API calls
    $cleanId = $ModelId -replace "^openrouter/", ""

    $results = @()
    for ($i = 1; $i -le 3; $i++) {
        $body = @{
            model     = $cleanId
            messages  = @(@{ role = "user"; content = "Reply with OK" })
            max_tokens = 10
        } | ConvertTo-Json

        try {
            $null = Invoke-RestMethod -Uri $ApiUrl -Method POST -Headers $headers -Body $body -TimeoutSec 30
            $results += "OK"
        } catch {
            $code = [int]$_.Exception.Response.StatusCode
            if ($code) { $results += $code } else { $results += "ERR" }
        }

        if ($Phase -eq "burst") { Start-Sleep -Milliseconds 300 }
        else { Start-Sleep -Seconds 5 }
    }

    return $results
}

# --- Get provider-specific API URL ---
function Get-ApiUrl {
    param([string]$ModelId)
    if ($ModelId -like "cerebras/*")     { return "https://api.cerebras.ai/v1/chat/completions" }
    if ($ModelId -like "nvidia/*")       { return "https://integrate.api.nvidia.com/v1/chat/completions" }
    if ($ModelId -like "huggingface/*")  { return "https://router.huggingface.co/v1/chat/completions" }
    if ($ModelId -like "llmgateway/*")   { return "https://api.llmgateway.io/v1/chat/completions" }
    if ($ModelId -like "deepseek/*")     { return "https://api.deepseek.com/v1/chat/completions" }
    return "https://openrouter.ai/api/v1/chat/completions"
}

# --- Get API key for model ---
function Get-ApiKey {
    param([string]$ModelId)
    if ($ModelId -like "cerebras/*")     { return $auth.cerebras.key }
    if ($ModelId -like "nvidia/*")       { return $auth.nvidia.key }
    if ($ModelId -like "huggingface/*")  { return $auth.huggingface.key }
    if ($ModelId -like "llmgateway/*")   { return $auth.llmgateway.key }
    if ($ModelId -like "deepseek/*")     { return $auth.deepseek.key }
    return $auth.openrouter.key
}

# --- Run tests ---
$results = @()

foreach ($m in $toTest) {
    $id    = $m.id
    $url   = Get-ApiUrl $id
    $key   = Get-ApiKey $id

    Write-Host "[$id]" -ForegroundColor White

    # Phase 1: Burst (rapid sequential)
    Write-Host "  Burst phase..." -NoNewline
    $burstResults = Test-Model -ModelId $id -Phase "burst" -ApiKey $key -ApiUrl $url
    Write-Host " $($burstResults -join ', ')"

    # Phase 2: Delayed
    Write-Host "  Delayed phase..." -NoNewline
    $delayedResults = Test-Model -ModelId $id -Phase "delayed" -ApiKey $key -ApiUrl $url
    Write-Host " $($delayedResults -join ', ')"

    # Interpret
    $allResults     = $burstResults + $delayedResults
    $okCount        = ($allResults | Where-Object { $_ -eq "OK" }).Count
    $totalCount     = $allResults.Count
    $all429         = ($allResults | Where-Object { $_ -ne "OK" }).Count -eq $totalCount
    $anyOk          = $okCount -gt 0

    if ($okCount -eq $totalCount) {
        $status = "working"
        $detail = "All $totalCount requests succeeded."
    } elseif ($all429) {
        $status = "rate_limited"
        $detail = "429 on all $totalCount requests - persistently rate limited."
    } elseif ($okCount -ge 4) {
        $status = "working"
        $detail = "$okCount/$totalCount OK. Intermittent 429s under load, reliable sequentially."
    } elseif ($anyOk) {
        $status = "rate_limited"
        $detail = "$okCount/$totalCount OK - sporadic success, not reliably usable."
    } else {
        $status = "broken"
        $detail = "0/$totalCount OK - all requests failed."
    }

    Write-Host "  => $status" -ForegroundColor $(if ($status -eq "working") { "Green" } elseif ($status -eq "rate_limited") { "Yellow" } else { "Red" })

    $results += [PSCustomObject]@{
        id     = $id
        status = $status
        detail = $detail
        burst  = $burstResults -join ", "
        delayed = $delayedResults -join ", "
    }
}

# --- Summary ---
Write-Host ""
Write-Host "=== Results ===" -ForegroundColor Cyan
$results | Format-Table -Property id, status, detail -AutoSize

if (-not $Apply) {
    Write-Host "Report mode. Use -Apply to update available-models.json" -ForegroundColor Yellow
} else {
    $today = Get-Date -Format "yyyy-MM-dd"
    $currentMonth = Get-Date -Format "yyyy-MM"

    # Check if a model's provider is marked as used-up for the current month
    $usedUpProviders = @()
    if ($json._provider_usage) {
        foreach ($p in $json._provider_usage.PSObject.Properties.Name) {
            if ($p -eq 'description') { continue }
            $entry = $json._provider_usage.$p
            if ($entry.month -eq $currentMonth) {
                $usedUpProviders += $p
            }
        }
    }

    foreach ($r in $results) {
        $model = $json.models | Where-Object { $_.id -eq $r.id }
        if (-not $model) { continue }

        # Handle _provider_usage: if model is broken, auto-flag provider as used-up
        $providerPrefix = ($r.id -split '/')[0]
        if ($r.status -eq "broken" -and $usedUpProviders -notcontains $providerPrefix) {
            # Only auto-flag if ALL free models from this provider are broken
            $providerModels = $json.models | Where-Object { $_.id -like "$providerPrefix/*" -and $_.is_free }
            $allBroken = ($providerModels | Where-Object { $_.status.result -eq "broken" }).Count -eq $providerModels.Count
            if ($allBroken -and $providerModels.Count -gt 0) {
                if (-not $json._provider_usage) { $json._provider_usage = @{} }
                $json._provider_usage | Add-Member -NotePropertyName $providerPrefix -NotePropertyValue @{
                    month = $currentMonth
                    reason = "All $providerPrefix models are broken as of $today"
                }
                $usedUpProviders += $providerPrefix
                Write-Host "  ⚠ Auto-flagged provider '$providerPrefix' as used-up for $currentMonth" -ForegroundColor Yellow
            }
        }

        $model.status.tested = $today
        $model.status.result = $r.status
        $model.status.detail = $r.detail; if ($r.status -eq 'working') { $model.last_success = (Get-Date).ToString('o') }

        # Update test_summary
        if ($r.status -eq "working") {
            if ($json._test_summary.results.rate_limited -match [regex]::Escape($r.id)) {
                $json._test_summary.results.rate_limited = $json._test_summary.results.rate_limited | Where-Object { $_ -notmatch [regex]::Escape($r.id) }
            }
            if ($json._test_summary.results.working -notcontains $r.id) {
                $json._test_summary.results.working += $r.id
            }
        } elseif ($r.status -eq "rate_limited") {
            if ($json._test_summary.results.working -contains $r.id) {
                $json._test_summary.results.working = $json._test_summary.results.working | Where-Object { $_ -ne $r.id }
            }
            if ($json._test_summary.results.rate_limited -notcontains $r.id) {
                $json._test_summary.results.rate_limited += $r.id
            }
        } elseif ($r.status -eq "broken") {
            if ($json._test_summary.results.working -contains $r.id) {
                $json._test_summary.results.working = $json._test_summary.results.working | Where-Object { $_ -ne $r.id }
            }
            if ($json._test_summary.results.broken -notcontains $r.id) {
                $json._test_summary.results.broken += $r.id
            }
        }

        # Update _role_rankings: add working models, remove non-working
        # Also exclude models from providers listed in _provider_usage for current month
        $modelProvider = ($r.id -split '/')[0]
        $isProviderUsedUp = $usedUpProviders -contains $modelProvider

        $roles = @("model","build","general","small_model","explore")
        foreach ($role in $roles) {
            if ($r.status -eq "working" -and -not $isProviderUsedUp) {
                if ($json._role_rankings.$role -notcontains $r.id) {
                    $json._role_rankings.$role += $r.id
                }
            } else {
                if ($json._role_rankings.$role -contains $r.id) {
                    $json._role_rankings.$role = $json._role_rankings.$role | Where-Object { $_ -ne $r.id }
                }
            }
        }
    }

    $json._test_summary.date = $today

    $json | ConvertTo-Json -Depth 10 | Set-Content $ModelsFile
    Write-Host "Updated $ModelsFile" -ForegroundColor Green

# Simple JSON validation using PowerShell's built‑in parser
try {
    $null = Get-Content $ModelsFile -Raw | ConvertFrom-Json
    Write-Host "JSON validation: OK" -ForegroundColor Green
} catch {
    Write-Host "JSON validation: FAILED - $_" -ForegroundColor Red
}
}
