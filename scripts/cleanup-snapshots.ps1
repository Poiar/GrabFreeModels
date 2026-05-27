# cleanup-snapshots.ps1
# Retains the most recent N snapshots (default 30) and deletes older ones.
# Usage: pwsh -File cleanup-snapshots.ps1 [-Keep 30]

param(
    [int]$Keep = 30,
    [string]$SnapshotDir = "C:\OC\GrabFreeModels\snapshots"
)

if (-not (Test-Path $SnapshotDir)) {
    Write-Host "Snapshot directory does not exist: $SnapshotDir" -ForegroundColor Yellow
    exit 0
}

$files = Get-ChildItem -Path $SnapshotDir -Filter "available-models-*.json" | Sort-Object LastWriteTime -Descending
if ($files.Count -le $Keep) {
    Write-Host "Only $($files.Count) snapshots present – nothing to delete." -ForegroundColor Green
    exit 0
}
$toDelete = $files[$Keep..($files.Count-1)]
foreach ($f in $toDelete) {
    Remove-Item -LiteralPath $f.FullName -Force
    Write-Host "Deleted old snapshot: $($f.Name)" -ForegroundColor Gray
}
