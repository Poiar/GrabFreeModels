# generate-dashboard.ps1
# Creates a simple HTML dashboard showing provider health and current rankings.
# Providers listed in _provider_usage for the current month are greyed out.

$repoRoot = "C:\OC\GrabFreeModels"
$jsonPath = Join-Path $repoRoot "available-models.json"
$dashboardPath = Join-Path $repoRoot "dashboard.html"

$data = Get-Content $jsonPath -Raw | ConvertFrom-Json

$currentMonth = Get-Date -Format "yyyy-MM"
$usedUpProviders = @()
if ($data._provider_usage) {
    foreach ($p in $data._provider_usage.PSObject.Properties.Name) {
        if ($p -eq 'description') { continue }
        if ($data._provider_usage.$p.month -eq $currentMonth) {
            $usedUpProviders += $p
        }
    }
}

# Provider health table
$provRows = $data.provider_health.PSObject.Properties | ForEach-Object {
    $isUsedUp = $usedUpProviders -contains $_.Name
    $style = if ($isUsedUp) { " style='background:#f0f0f0;color:#999;text-decoration:line-through'" } else { "" }
    $badge = if ($isUsedUp) { " <span title='Used up for $currentMonth'>⚠</span>" } else { "" }
    "<tr$style><td>$($_.Name)$badge</td><td>$($_.Value.total)</td><td>$($_.Value.working)</td><td>$($_.Value.rate_limited)</td><td>$($_.Value.broken)</td></tr>"
}
$provTable = @(
    "<h2>Provider Health</h2>"
    "<p style='font-size:0.85em;color:#666'>Strikethrough = used up for $currentMonth (see _provider_usage)</p>"
    "<table border='1' cellpadding='4'><tr><th>Provider</th><th>Total</th><th>Working</th><th>Rate‑Limited</th><th>Broken</th></tr>"
    $provRows
    "</table>"
) -join "`n"

# Rankings tables (model, build, general, small_model, explore, stable)
$roleTables = $data._role_rankings.PSObject.Properties | Where-Object { $_.Name -ne 'description' } | ForEach-Object {
    $role = $_.Name
    $ids  = $_.Value
    $rows = $ids | ForEach-Object {
        $provider = ($_ -split '/')[0]
        $isUsedUp = $usedUpProviders -contains $provider
        $style = if ($isUsedUp) { " style='color:#999;text-decoration:line-through'" } else { "" }
        "<tr$style><td>$_</td></tr>"
    }
    "<h3>$role</h3><table border='1' cellpadding='4'><tr><th>Model ID</th></tr>$(($rows -join "`n"))</table>"
} -join "`n"

# Provider usage section
$usageSection = ""
if ($usedUpProviders.Count -gt 0) {
    $usageRows = $usedUpProviders | ForEach-Object {
        $reason = $data._provider_usage.$_.reason
        "<tr><td>$_</td><td>$reason</td></tr>"
    }
    $usageSection = @"
    <h2>Used-Up Providers ($currentMonth)</h2>
    <table border='1' cellpadding='4'><tr><th>Provider</th><th>Reason</th></tr>
    $($usageRows -join "`n")
    </table>
"@ -join "`n"
}

$html = @"
<!DOCTYPE html>
<html lang='en'>
<head><meta charset='UTF-8'><title>Free Model Dashboard</title></head>
<body>
<h1>Free Model Dashboard</h1>
<p style='font-size:0.85em;color:#666'>Generated $(Get-Date -Format 'yyyy-MM-dd HH:mm')</p>
$provTable
$usageSection
<h2>Role Rankings</h2>
$roleTables
</body>
</html>
"@

Set-Content -Path $dashboardPath -Value $html -Encoding UTF8
Write-Host "Dashboard written to $dashboardPath" -ForegroundColor Green
