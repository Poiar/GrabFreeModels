# model-summary.ps1
# Quick overview of model statuses and role ranking sizes

$ModelsFile = "C:\OC\GrabFreeModels\available-models.json"
$json = Get-Content $ModelsFile -Raw | ConvertFrom-Json

$free = $json.models | Where-Object { $_.is_free }
$working = $free | Where-Object { $_.status.result -eq 'working' }
$rateLimited = $free | Where-Object { $_.status.result -eq 'rate_limited' }
$broken = $free | Where-Object { $_.status.result -eq 'broken' }

Write-Host "Free models: $($free.Count)" -ForegroundColor Cyan
Write-Host "  Working: $($working.Count)" -ForegroundColor Green
Write-Host "  Rate‑limited: $($rateLimited.Count)" -ForegroundColor Yellow
Write-Host "  Broken: $($broken.Count)" -ForegroundColor Red

Write-Host "\nRanking entry counts:" -ForegroundColor Cyan
foreach ($role in $json._role_rankings.PSObject.Properties.Name) {
  if ($role -eq 'description') { continue }
  $cnt = $json._role_rankings.$role.Count
  Write-Host "  $role: $cnt" -ForegroundColor White
}
