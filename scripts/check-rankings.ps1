# check-rankings.ps1
# Verifies that every model ID referenced in _role_rankings exists in the models array,
# that there are no duplicate entries, and that no model belongs to a provider
# listed in _provider_usage for the current month.

$ModelsFile = "C:\OC\GrabFreeModels\available-models.json"

$json = Get-Content $ModelsFile -Raw | ConvertFrom-Json

$modelIds = $json.models | ForEach-Object { $_.id }
$allGood = $true

# Determine which providers are used-up this month
$currentMonth = Get-Date -Format "yyyy-MM"
$usedUpProviders = @()
if ($json._provider_usage) {
    Write-Host "Checking _provider_usage for month $currentMonth..." -ForegroundColor Cyan
    foreach ($p in $json._provider_usage.PSObject.Properties.Name) {
        if ($p -eq 'description') { continue }
        if ($json._provider_usage.$p.month -eq $currentMonth) {
            $usedUpProviders += $p
            Write-Host "  Provider '$p' marked as used-up: $($json._provider_usage.$p.reason)" -ForegroundColor Yellow
        }
    }
    if ($usedUpProviders.Count -eq 0) { Write-Host "  No providers used-up this month." -ForegroundColor Green }
    Write-Host ""
}

foreach ($role in $json._role_rankings.PSObject.Properties.Name) {
    if ($role -eq 'description') { continue }
    $list = $json._role_rankings.$role
    Write-Host "Checking role: $role" -ForegroundColor Cyan
    foreach ($id in $list) {
        # Check existence
        if (-not $modelIds -contains $id) {
            Write-Host "  ❌ Missing model ID: $id" -ForegroundColor Red
            $allGood = $false
        }
        # Check provider usage
        $provider = ($id -split '/')[0]
        if ($usedUpProviders -contains $provider) {
            Write-Host "  ⚠ Model '$id' is from used-up provider '$provider' (excluded from rankings)" -ForegroundColor Yellow
            $allGood = $false
        }
    }
    $duplicates = $list | Group-Object | Where-Object { $_.Count -gt 1 }
    foreach ($dup in $duplicates) {
        Write-Host ("  ❌ Duplicate ID in {0}: {1} (appears {2} times)" -f $role, $dup.Name, $dup.Count) -ForegroundColor Yellow
        $allGood = $false
    }
}

if ($allGood) { Write-Host "All rankings are valid." -ForegroundColor Green }
