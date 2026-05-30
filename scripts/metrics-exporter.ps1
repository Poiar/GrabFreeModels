# metrics-exporter.ps1
# Serves Prometheus-compatible metrics for GrabFreeModels provider health.
# Runs a lightweight HTTP listener on the specified port.
#
# Usage: pwsh -File metrics-exporter.ps1 [-Port 9100]

param(
    [int]$Port = 9180,
    [string]$ModelsFile = $env:MODELS_FILE_PATH
)

if (-not $ModelsFile) {
    $ModelsFile = if ($IsLinux -or $IsMacOS) { "/app/available-models.json" } else { "C:\OC\GrabFreeModels\available-models.json" }
}

# Create HTTP listener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")
$listener.Start()
Write-Host "Metrics exporter listening on port $Port" -ForegroundColor Green

# Reload JSON on each scrape to reflect latest state
function Get-Metrics {
    try {
        $json = Get-Content $ModelsFile -Raw | ConvertFrom-Json
    } catch {
        return "# Error reading models file`n"
    }

    $lines = @()

    # Provider-level metrics
    $lines += "# HELP model_provider_working Number of working free models per provider"
    $lines += "# TYPE model_provider_working gauge"
    $lines += "# HELP model_provider_total Total number of free models tracked per provider"
    $lines += "# TYPE model_provider_total gauge"
    $lines += "# HELP model_provider_rate_limited Number of rate-limited free models per provider"
    $lines += "# TYPE model_provider_rate_limited gauge"
    $lines += "# HELP model_provider_broken Number of broken free models per provider"
    $lines += "# TYPE model_provider_broken gauge"

    $free = $json.models | Where-Object { $_.is_free }
    $providers = $free | Group-Object -Property provider

    foreach ($p in $providers) {
        $working  = ($p.Group | Where-Object { $_.status.result -eq 'working' }).Count
        $rl       = ($p.Group | Where-Object { $_.status.result -eq 'rate_limited' }).Count
        $broken   = ($p.Group | Where-Object { $_.status.result -eq 'broken' }).Count
        $total    = $p.Count
        $provider = $p.Name

        $lines += "model_provider_working{provider=`"$provider`"} $working"
        $lines += "model_provider_total{provider=`"$provider`"} $total"
        $lines += "model_provider_rate_limited{provider=`"$provider`"} $rl"
        $lines += "model_provider_broken{provider=`"$provider`"} $broken"
    }

    # Overall working ratio
    $totalWorking = ($free | Where-Object { $_.status.result -eq 'working' }).Count
    $totalFree    = $free.Count
    $ratio       = if ($totalFree -gt 0) { $totalWorking / $totalFree } else { 0 }

    $lines += "# HELP model_overall_working_ratio Ratio of working free models to total free models"
    $lines += "# TYPE model_overall_working_ratio gauge"
    $lines += "model_overall_working_ratio $ratio"

    # Test summary info
    $testDate = $json._test_summary.date
    $lines += "# HELP model_test_timestamp Unix timestamp of last validation run"
    $lines += "# TYPE model_test_timestamp gauge"
    try {
        $ts = [DateTimeOffset]::Parse($testDate).ToUnixTimeSeconds()
        $lines += "model_test_timestamp $ts"
    } catch {
        $lines += "model_test_timestamp 0"
    }

    return ($lines -join "`n") + "`n"
}

# Main loop
while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response

    $metrics = Get-Metrics
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($metrics)

    $response.ContentType = "text/plain; version=0.0.4"
    $response.ContentLength64 = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.OutputStream.Close()
}

$listener.Stop()
