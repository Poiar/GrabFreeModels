param(
  [string]$MyProject = ""  # optional: mark which tab is "self"
)

# Pipe in list_tabs JSON from stdin
$json = $input | Out-String
$tabs = $json | ConvertFrom-Json

$results = @()
foreach ($tab in $tabs.tabs) {
  $hasClaude = $tab.processes | Where-Object { $_.command -eq "claude.exe" }
  if (-not $hasClaude) { continue }

  # Extract project from Playwright MCP path
  $project = $null
  $pwNode = $tab.processes | Where-Object {
    $_.cmdline -match 'playwright.*mcp.*cli\.js'
  } | Select-Object -First 1

  if ($pwNode) {
    if ($pwNode.cmdline -match 'C:\\OC\\([^\\]+)\\node_modules') {
      $project = $Matches[1]
    }
    # npm-cache means global install — leave $project null, fall through
  }

  # Fallback: check dc.ps1 for project path (handles global playwright installs)
  if (-not $project) {
    $dcNode = $tab.processes | Where-Object { $_.cmdline -match 'dc\.ps1' } | Select-Object -First 1
    if ($dcNode -and $dcNode.cmdline -match 'C:\\OC\\([^\\]+)\\') {
      $project = $Matches[1]
    }
  }

  # Self: same project + has bash/git (tiebreaker for same-project tabs)
  # If no tab has bash/git, falls back to first same-project match
  $sameProject = ($MyProject -and $project -eq $MyProject)
  $hasBashOrGit = ($tab.processes | Where-Object { $_.command -match '^(bash|git)\.exe$' } | Select-Object -First 1).Count -gt 0
  $self = $false  # resolved after collecting all results

  $results += [pscustomobject]@{
    TabId       = $tab.id
    Project     = if ($project) { $project } else { "?" }
    SameProject = $sameProject
    HasBash     = $hasBashOrGit
    Self        = $false
    LocalPW     = ($pwNode -and $pwNode.cmdline -notmatch 'npm-cache')
  }
}

# Resolve self: prefer bash/git, fall back to first same-project tab
$selfResolved = $false
foreach ($r in $results) {
  if (-not $selfResolved -and $r.SameProject) {
    if ($r.HasBash -or ($results | Where-Object { $_.SameProject -and $_.HasBash }).Count -eq 0) {
      $r.Self = $true
      $selfResolved = $true
    }
  }
}

# Output
Write-Host ""
foreach ($r in $results) {
  $marker = if ($r.Self) { " <- YOU" } else { "" }
  $pwInfo = if ($r.LocalPW) { "local" } else { "global" }
  Write-Host "$($r.TabId.Substring(0,8))  $($r.Project)  (pw: $pwInfo)$marker"
}
Write-Host ""
