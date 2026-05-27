# sync-models.ps1
# Fetches latest free model lists from all providers and diffs against available-models.json
#
# Usage: .\scripts\sync-models.ps1 [-Apply]
#   -Apply  : Write changes to available-models.json (default: dry-run / report only)

param([switch]$Apply)

$ErrorActionPreference = "Stop"
$ModelsFile = "C:\OC\GrabFreeModels\available-models.json"
$AuthFile   = "C:\Users\pc\.local\share\opencode\auth.json"

$auth    = Get-Content $AuthFile | ConvertFrom-Json
$models  = (Get-Content $ModelsFile | ConvertFrom-Json).models
$existingIds = $models | ForEach-Object { $_.id }

function Get-OpenRouterFreeModels {
    $all = (Invoke-RestMethod -Uri "https://openrouter.ai/api/v1/models").data
    $free = $all | Where-Object { $_.pricing -eq "0" -or $_.id -like "*:free" }
    return $free
}

function Get-CerebrasModels {
    $headers = @{ "Authorization" = "Bearer " + $auth.cerebras.key }
    $data = (Invoke-RestMethod -Uri "https://api.cerebras.ai/v1/models" -Headers $headers).data
    return $data | ForEach-Object {
        @{
            id             = $_.id
            name           = $_.id
            context_length = 131072
        }
    }
}

function Get-NvidiaFreeModels {
    $headers = @{ "Authorization" = "Bearer " + $auth.nvidia.key }
    $data = (Invoke-RestMethod -Uri "https://integrate.api.nvidia.com/v1/models" -Headers $headers).data
    # NVIDIA free-tier: no pricing info (free) or $0, but only chat/LLM models (not embed/safety/reward)
    return $data | Where-Object {
        ($_.object -eq "model") -and
        ($_.task -eq $null -or $_.task -eq "chat" -or $_.task -eq "text-generation" -or $_.type -eq "chat") -and
        (
            -not $_.pricing -or $_.pricing -eq "0" -or
            ($_.pricing.input -eq "0" -and $_.pricing.output -eq "0")
        ) -and
        # Exclude known non-LLM model types
        ($_.id -notmatch "embed|reward|detector|translate|clip|neva|vila|kosmos|riva|gliner|ising|calibration") -and
        ($_.id -notmatch "nemoguard|nemoretriever|content-safety|parse")
    }
}

Write-Host "=== Syncing free models ===" -ForegroundColor Cyan
Write-Host ""

# --- OpenRouter ---
Write-Host "[OpenRouter] Fetching..." -ForegroundColor Yellow
$orModels = Get-OpenRouterFreeModels
Write-Host "  Found $($orModels.Count) free models"

$newOr = @()
foreach ($m in $orModels) {
    $id = "openrouter/$($m.id)"
    if ($existingIds -notcontains $id) {
        $newOr += [PSCustomObject]@{
            id = $id
            name = $m.id
            provider = "OpenRouter"
            context_length = $m.context_length
            pricing = $m.pricing
        }
    }
}
Write-Host "  New: $($newOr.Count)" -ForegroundColor Green
foreach ($n in $newOr) { Write-Host "    + $($n.id)" }

# --- Cerebras ---
Write-Host ""
Write-Host "[Cerebras] Fetching..." -ForegroundColor Yellow
try {
    $cbModels = Get-CerebrasModels
    Write-Host "  Found $($cbModels.Count) models"
    $newCb = @()
    foreach ($m in $cbModels) {
        if ($existingIds -notcontains $m.id) {
            $newCb += $m
        }
    }
    Write-Host "  New: $($newCb.Count)" -ForegroundColor Green
    foreach ($n in $newCb) { Write-Host "    + $($n.id)" }
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
    $newCb = @()
}

# --- NVIDIA ---
Write-Host ""
Write-Host "[NVIDIA] Fetching..." -ForegroundColor Yellow
try {
    $nvModels = Get-NvidiaFreeModels
    Write-Host "  Found $($nvModels.Count) free models"
    $newNv = @()
    foreach ($m in $nvModels) {
        if ($existingIds -notcontains $m.id -and $existingIds -notcontains "nvidia/$($m.id)") {
            $newNv += [PSCustomObject]@{
                id = $m.id
                name = $m.id
                provider = "NVIDIA"
                context_length = $m.context_length
            }
        }
    }
    Write-Host "  New: $($newNv.Count)" -ForegroundColor Green
    foreach ($n in $newNv) { Write-Host "    + $($n.id)" }
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
    $newNv = @()
}

# --- Detect removed models ---
Write-Host ""
Write-Host "[Status Check] Models in JSON but no longer in OpenRouter/Cerebras..." -ForegroundColor Yellow
$allCurrentFreeIds = @()
$allCurrentFreeIds += $orModels | ForEach-Object { "openrouter/$($_.id)" }
$allCurrentFreeIds += $cbModels | ForEach-Object { $_.id }

# Only flag models whose primary source is OpenRouter or Cerebras
# (HuggingFace, LLM Gateway, NVIDIA models come from separate APIs)
$orCbProviders = @("OpenRouter", "Cerebras")
$potentiallyRemoved = @()
foreach ($m in $models) {
    if (-not $m.is_free) { continue }
    if ($m.provider -eq "OpenCode Zen") { continue }
    if ($m.id -eq "openrouter/openrouter/free") { continue }
    if ($orCbProviders -contains $m.provider -and $allCurrentFreeIds -notcontains $m.id) {
        $potentiallyRemoved += $m.id
    }
}
Write-Host "  Potentially removed: $($potentiallyRemoved.Count)" -ForegroundColor Magenta
foreach ($r in $potentiallyRemoved) { Write-Host "    ? $r" }

# --- Summary ---
$totalNew = $newOr.Count + $newCb.Count + $newNv.Count
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "  New models found:    $totalNew"
Write-Host "  Potentially removed: $($potentiallyRemoved.Count)"

if (-not $Apply) {
    Write-Host ""
    Write-Host "Dry-run mode. Use -Apply to update available-models.json" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Applying changes..." -ForegroundColor Yellow

    $json = Get-Content $ModelsFile | ConvertFrom-Json

    # Add new OpenRouter models
    foreach ($m in $newOr) {
        $entry = @{
            id = $m.id
            name = $m.name
            provider = "OpenRouter"
            context_length = $m.context_length
            input_price_per_million = 0
            output_price_per_million = 0
            is_free = $true
            best_for = @("General tasks")
            notes = "Auto-discovered by sync script"
            status = @{ tested = $null; result = "untested"; detail = "Not yet tested" }
        }
        $json.models += $entry
    }

    # Add new Cerebras models
    foreach ($m in $newCb) {
        $entry = @{
            id = $m.id
            name = $m.name
            provider = "Cerebras"
            context_length = $m.context_length
            input_price_per_million = 0
            output_price_per_million = 0
            is_free = $true
            best_for = @("General tasks")
            notes = "Auto-discovered by sync script"
            status = @{ tested = $null; result = "untested"; detail = "Not yet tested" }
        }
        $json.models += $entry
    }

    # Add new NVIDIA models
    foreach ($m in $newNv) {
        $entry = @{
            id = $m.id
            name = $m.name
            provider = "NVIDIA"
            context_length = $m.context_length
            input_price_per_million = 0
            output_price_per_million = 0
            is_free = $true
            best_for = @("General tasks")
            notes = "Auto-discovered by sync script"
            status = @{ tested = $null; result = "untested"; detail = "Not yet tested" }
        }
        $json.models += $entry
    }

    # Flag potentially removed models
    foreach ($m in $json.models) {
        if ($potentiallyRemoved -contains $m.id -and $m.is_free) {
            $m.status.result = "untested"
            $m.status.detail = "Model may no longer be offered as free — re-check needed"
        }
    }

    $json | ConvertTo-Json -Depth 10 | Set-Content $ModelsFile
    Write-Host "  Updated $ModelsFile" -ForegroundColor Green

    # Validate
    try {
        $null = [System.Text.Json.JsonDocument]::Parse([System.IO.File]::ReadAllText($ModelsFile))
        Write-Host "  JSON validation: OK" -ForegroundColor Green
    } catch {
        Write-Host "  JSON validation: FAILED - $_" -ForegroundColor Red
    }
}
