# generate-dashboard.ps1
# Creates a simple HTML dashboard showing provider health and current rankings.

$repoRoot = "C:\OC\GrabFreeModels"
$jsonPath = Join-Path $repoRoot "available-models.json"
$dashboardPath = Join-Path $repoRoot "dashboard.html"

$data = Get-Content $jsonPath -Raw | ConvertFrom-Json

# Provider health table
$provRows = $data.provider_health.PSObject.Properties | ForEach-Object {
    "<tr><td>$($_.Name)</td><td>$($_.Value.total)</td><td>$($_.Value.working)</td><td>$($_.Value.rate_limited)</td><td>$($_.Value.broken)</td></tr>"
}
$provTable = @(
    "<h2>Provider Health</h2>"
    "<table border='1' cellpadding='4'><tr><th>Provider</th><th>Total</th><th>Working</th><th>Rate‑Limited</th><th>Broken</th></tr>"
    $provRows
    "</table>"
) -join "`n"

# Rankings tables (model, build, general, small_model, explore, stable)
$roleTables = $data._role_rankings.PSObject.Properties | Where-Object { $_.Name -ne 'description' } | ForEach-Object {
    $role = $_.Name
    $ids  = $_.Value
    $rows = $ids | ForEach-Object { "<tr><td>$_</td></tr>" }
    "<h3>$role</h3><table border='1' cellpadding='4'><tr><th>Model ID</th></tr>$(($rows -join "`n"))</table>"
} -join "`n"

$html = @"
<!DOCTYPE html>
<html lang='en'>
<head><meta charset='UTF-8'><title>Free Model Dashboard</title></head>
<body>
<h1>Free Model Dashboard</h1>
$provTable
$roleTables
</body>
</html>
"@

Set-Content -Path $dashboardPath -Value $html -Encoding UTF8
Write-Host "Dashboard written to $dashboardPath" -ForegroundColor Green
