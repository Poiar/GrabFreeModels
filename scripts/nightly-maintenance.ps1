# nightly-maintenance.ps1
# Intended for scheduled execution (e.g., Windows Task Scheduler).
# Validates free models, runs ranking sanity check, generates a summary, commits changes,
# tags if the stable ranking changed, and pushes to the remote.

$repoRoot = "C:\OC\GrabFreeModels"
Set-Location $repoRoot

# Paths
$modelsFile = Join-Path $repoRoot "available-models.json"
$prevCopy   = Join-Path $repoRoot "available-models.prev.json"

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
    # Preserve previous version for comparison
    if (Test-Path $modelsFile) { Copy-Item -LiteralPath $modelsFile -Destination $prevCopy -Force }

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

# 7. Simple alert placeholder – highlight models that recovered to working status
if (Test-Path $prevCopy) {
    $prev = Get-Content $prevCopy -Raw | ConvertFrom-Json
    $curr = Get-Content $modelsFile -Raw | ConvertFrom-Json
    $recovered = $curr.models | Where-Object {
        $_.status.result -eq 'working' -and (
            $prev.models | Where-Object { $_.id -eq $curr.id -and $_.status.result -ne 'working' }
        )
    }
    if ($recovered) {
        Write-Host "Alert: The following models recovered to working status:" -ForegroundColor Magenta
        $recovered.id | ForEach-Object { Write-Host "  $_" }
    }
}
