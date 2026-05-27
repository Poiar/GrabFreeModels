# check-rankings.ps1
# Verifies that every model ID referenced in _role_rankings exists in the models array
# and that there are no duplicate entries.

$ModelsFile = "C:\OC\GrabFreeModels\available-models.json"

$json = Get-Content $ModelsFile -Raw | ConvertFrom-Json

$modelIds = $json.models | ForEach-Object { $_.id }
$allGood = $true

foreach ($role in $json._role_rankings.PSObject.Properties.Name) {
    if ($role -eq 'description') { continue }
    $list = $json._role_rankings.$role
    Write-Host "Checking role: $role" -ForegroundColor Cyan
    foreach ($id in $list) {
        if (-not $modelIds -contains $id) {
            Write-Host "  ❌ Missing model ID: $id" -ForegroundColor Red
            $allGood = $false
        }
    }
    $duplicates = $list | Group-Object | Where-Object { $_.Count -gt 1 }
    foreach ($dup in $duplicates) {
        Write-Host "  ❌ Duplicate ID in $role: $($dup.Name) (appears $($dup.Count) times)" -ForegroundColor Yellow
        $allGood = $false
    }
}

if ($allGood) { Write-Host "All rankings are valid." -ForegroundColor Green }
