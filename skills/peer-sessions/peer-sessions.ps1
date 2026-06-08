param(
  [string[]]$ProjectPaths,
  [hashtable]$MaxPerProject  # e.g. @{"C:\OC\GrabFreeModels"=2; "C:\OC\deepclaude"=1}
)

$ErrorActionPreference = "Stop"
$now = Get-Date

# Resolve projects
$scan = @{}
if ($ProjectPaths) {
  foreach ($p in $ProjectPaths) {
    $slug = ($p -replace '^([A-Z]):\\', '$1--') -replace '[\\/:]', '-'
    $td = "$env:USERPROFILE\.claude\projects\$slug"
    if (Test-Path $td) { $scan[$slug] = $p }
  }
} else {
  $transcriptDirs = Get-ChildItem "$env:USERPROFILE\.claude\projects" -Directory -ErrorAction SilentlyContinue
  foreach ($d in $transcriptDirs) {
    $path = $d.Name -replace '^([A-Z])--', '$1:\' -replace '-', '\'
    if (Test-Path $path) { $scan[$d.Name] = $path }
  }
}

$results = @()
foreach ($entry in $scan.GetEnumerator()) {
  $projPath = $entry.Value
  $count = 0
  $transcripts = Get-ChildItem "$env:USERPROFILE\.claude\projects\$($entry.Key)\*.jsonl" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending

  foreach ($f in $transcripts) {
    if ($f.LastWriteTime -lt $now.AddMinutes(-30)) { break }
    $max = if ($MaxPerProject -and $MaxPerProject.ContainsKey($projPath)) { $MaxPerProject[$projPath] } else { 3 }
    if ($count -ge $max) { break }

    $tailLines = Get-Content $f.FullName -Tail 25
    $lastText = ""; $away = ""; $lastPrompt = ""
    $cwd = ""; $branch = ""; $slug = ""; $state = "Active"

    foreach ($line in $tailLines) {
      if ($line -match '"slug"\s*:') {
        $slug = ($line | ConvertFrom-Json).slug
      }
      if ($line -match '"cwd"\s*:') {
        $cwd = ($line | ConvertFrom-Json).cwd
      }
      if ($line -match '"gitBranch"\s*:') {
        $branch = ($line | ConvertFrom-Json).gitBranch
      }
      if ($line -match '"type"\s*:\s*"last-prompt"') {
        $lastPrompt = ($line | ConvertFrom-Json).lastPrompt
      }
      if ($line -match '"subtype"\s*:\s*"away_summary"') {
        $away = ($line | ConvertFrom-Json).content
        $state = "Idle"
      }
      if ($line -match '"type"\s*:\s*"user"' -and $line -notmatch '"isMeta"\s*:\s*true') {
        if ($state -eq "Active") { $state = "Mid-turn" }
      }
      if ($line -match '"type"\s*:\s*"assistant"' -and $line -match '"content"\s*:') {
        if ($state -ne "Idle") { $state = "Active" }
        $j = $line | ConvertFrom-Json
        foreach ($c in $j.message.content) {
          if ($c.type -eq "text") { $lastText = $c.text }
        }
      }
    }

    # Stale auto-probe → not really active
    if ($lastText -match 'auto-probe from peer-sessions') { $state = "Idle" }

    $workingOn = if ($away) { $away }
                 elseif ($lastPrompt) { $lastPrompt }
                 elseif ($lastText) { $lastText.Substring(0, [Math]::Min(120, $lastText.Length)) }
                 else { "(idle at prompt)" }

    # Strip noise
    $workingOn = $workingOn -replace '\s*\(disable recaps in /config\)\s*$', ''
    $workingOn = $workingOn -replace '\n.*', ''

    $results += [pscustomobject]@{
      Project   = $cwd
      Branch    = $branch
      Slug      = $slug
      State     = $state
      WorkingOn = $workingOn
      SessionId = $f.BaseName
    }
    $count++
  }
}

$i = 0
foreach ($r in $results) {
  $i++
  Write-Host "$i. [$($r.State)] $($r.Project) | $($r.Branch) | $($r.Slug)"
  Write-Host "   $($r.WorkingOn)"
  Write-Host ""
}
