# install-metrics-service.ps1
# Installs the metrics exporter as a Windows service using nssm (if available) or sc.exe.
# Usage: pwsh -File install-metrics-service.ps1 [-Port <port>]

param(
    [int]$Port = 9180,
    [string]$ServiceName = "GrabFreeModelsMetrics"
)

$scriptPath = (Get-Item $MyInvocation.MyCommand.Path).Directory.FullName + "\metrics-exporter.ps1"

# Ensure the exporter script exists
if (-not (Test-Path $scriptPath)) {
    Write-Error "Metrics exporter script not found at $scriptPath"
    exit 1
}

# Build the command line for the service
$command = "pwsh.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -Port $Port"

# Try nssm first (if installed)
$nssmPath = "C:\Program Files\nssm\win64\nssm.exe"
if (Test-Path $nssmPath) {
    & $nssmPath install $ServiceName $command
    & $nssmPath set $ServiceName Start SERVICE_AUTO_START
    & $nssmPath start $ServiceName
    Write-Host "Service $ServiceName installed and started via nssm." -ForegroundColor Green
} else {
    # Fallback to sc.exe – create a basic service that runs the command via cmd /c
    $binPath = "cmd.exe /c `"$command`""
    sc.exe create $ServiceName binPath= "$binPath" start= auto
    sc.exe start $ServiceName
    Write-Host "Service $ServiceName installed and started via sc.exe. Consider installing nssm for better handling." -ForegroundColor Yellow
}
