# health-badge.ps1
# Generates a Shields.io compatible JSON badge describing overall free‑model health.
# Output file: badge/health.json (create the folder if it doesn't exist).

$badgeDir = "C:\OC\GrabFreeModels\badge"
if (-not (Test-Path $badgeDir)) { New-Item -ItemType Directory -Path $badgeDir | Out-Null }

$jsonPath = "C:\OC\GrabFreeModels\available-models.json"
$data = Get-Content $jsonPath -Raw | ConvertFrom-Json

$free = $data.models | Where-Object { $_.is_free }
$working = $free | Where-Object { $_.status.result -eq 'working' }
$percent = [math]::Round(($working.Count / $free.Count) * 100)

$color = if ($percent -ge 80) { 'green' } elseif ($percent -ge 50) { 'yellow' } else { 'red' }

$badge = @{
    schemaVersion = 1
    label = 'free models'
    message = "$percent% working"
    color = $color
}

$badge | ConvertTo-Json -Depth 3 | Set-Content -Path (Join-Path $badgeDir 'health.json') -Encoding UTF8
Write-Host "Health badge written to $badgeDir\health.json" -ForegroundColor Green
