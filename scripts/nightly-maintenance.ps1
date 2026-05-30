# nightly-maintenance.ps1
# Intended for scheduled execution (e.g., Windows Task Scheduler).
# Validates free models, runs ranking sanity check, generates a summary, commits changes,
# tags if the stable ranking changed, and pushes to the remote.

$repoRoot = "C:\OC\GrabFreeModels"
Set-Location $repoRoot

# Paths
$modelsFile = Join-Path $repoRoot "available-models.json"
$prevCopy   = Join-Path $repoRoot "available-models.prev.json"

# Securely obtain webhook URLs if stored as a JSON secret
$webhookUrl = $null
$alertEndpoints = @()
try {
    $secretJson = Get-Secret -Name "GrabFreeModelsAlerts" -ErrorAction Stop | ConvertFrom-Json
    if ($secretJson.webhook) { $webhookUrl = $secretJson.webhook }
    if ($secretJson.slack)   { $alertEndpoints += $secretJson.slack   }
    if ($secretJson.teams)   { $alertEndpoints += $secretJson.teams   }
    if ($secretJson.email)   { $alertEndpoints += $secretJson.email   }
} catch {
    # Fallback to single webhook env var
    $webhookUrl = $env:WEBHOOK_URL
}
# Ensure we have a list to iterate over for alerts
if ($webhookUrl) { $alertEndpoints += $webhookUrl }

# 0. Save previous state for rollback and recovery detection
if (Test-Path $modelsFile) { Copy-Item -LiteralPath $modelsFile -Destination $prevCopy -Force }

# 1. Run validation (updates statuses)
Write-Host "Running validation..." -ForegroundColor Cyan
& "C:\OC\GrabFreeModels\scripts\validate-free-models.ps1" -Apply

# 2. Run sanity check
Write-Host "Running ranking sanity check..." -ForegroundColor Cyan
& "C:\OC\GrabFreeModels\scripts\check-rankings.ps1"

# 3. Generate summary (log to file)
$summaryLog = Join-Path $repoRoot "nightly-summary.log"
& "C:\OC\GrabFreeModels\scripts\model-summary.ps1" | Out-File -FilePath $summaryLog -Encoding utf8
Write-Host "Summary written to $summaryLog" -ForegroundColor Green

# 4. Detect changes
git diff --quiet $modelsFile
$hasChanges = $LASTEXITCODE -ne 0

if ($hasChanges) {
    # Compute overall health percentage
    $json = Get-Content $modelsFile -Raw | ConvertFrom-Json
    $free = $json.models | Where-Object { $_.is_free }
    $working = $free | Where-Object { $_.status.result -eq 'working' }
    $healthPct = [math]::Round(($working.Count / $free.Count) * 100)
    $rollbackThreshold = 70  # percent
    if ($healthPct -lt $rollbackThreshold) {
        Write-Host "Health $healthPct% below threshold $rollbackThreshold% – performing automatic rollback" -ForegroundColor Red
        if (Test-Path $prevCopy) {
            Copy-Item -LiteralPath $prevCopy -Destination $modelsFile -Force
            git add $modelsFile
            git commit -m "chore(models): automatic rollback to previous stable state (health $healthPct%)"
            git push origin master
            Write-Host "Rollback committed and pushed" -ForegroundColor Yellow
        }
        # Skip further processing for this run
        exit 0
    }

    git add $modelsFile
    $date = Get-Date -Format "yyyy-MM-dd"
    git commit -m "chore(models): nightly validation $date"

    # 5. Tag if stable ranking changed
    $stableNow = (Get-Content $modelsFile -Raw | ConvertFrom-Json)._role_rankings.stable -join ","
    $stablePrev = if (Test-Path $prevCopy) {
        (Get-Content $prevCopy -Raw | ConvertFrom-Json)._role_rankings.stable -join ","
    } else { "" }
    if ($stableNow -ne $stablePrev) {
        $tag = "stable-$(Get-Date -Format 'yyyyMMdd')"
        git tag $tag
        Write-Host "Created tag $tag (stable ranking changed)" -ForegroundColor Yellow
    }

    # 6. Push changes and tags
    git push origin master
    git push --tags
    Write-Host "Pushed commits and tags" -ForegroundColor Green
} else {
    Write-Host "No changes detected; nothing to commit." -ForegroundColor Gray
}

# 7. Alert via webhook (multi‑channel) – highlight models that recovered to working status (severity: warning)
if (Test-Path $prevCopy) {
    $prev = Get-Content $prevCopy -Raw | ConvertFrom-Json
    $curr = Get-Content $modelsFile -Raw | ConvertFrom-Json
    $recovered = $curr.models | Where-Object {
        if ($_.status.result -ne 'working') { return $false }
        $currId = $_.id
        $prevMatch = $prev.models | Where-Object { $_.id -eq $currId }
        $prevMatch -and $prevMatch.status.result -ne 'working'
    }
    if ($recovered) {
        $payload = @{ severity='warning'; type='recovery'; models=$recovered.id } | ConvertTo-Json -Compress
        foreach ($url in $alertEndpoints) {
            try {
                Invoke-RestMethod -Uri $url -Method Post -Body $payload -ContentType 'application/json' -ErrorAction Stop
                Write-Host "Alert sent to $url" -ForegroundColor Green
            } catch {
                Write-Host "Failed to send alert to $url: $_" -ForegroundColor Red
            }
        }
    }
}
