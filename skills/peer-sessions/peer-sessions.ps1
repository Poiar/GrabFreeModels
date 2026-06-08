param(
  [string[]]$RepoRoots,       # only scan sessions under these git roots
  [hashtable]$MaxPerRepo      # e.g. @{"C:\OC\GrabFreeModels"=2; "C:\OC\deepclaude"=1}
)

$ErrorActionPreference = "Stop"
$now = Get-Date

# Discover all transcript dirs → cwd via most recent transcript tail
$discovered = @{}  # cwd → [transcriptDir, ...]
$allDirs = Get-ChildItem "$env:USERPROFILE\.claude\projects" -Directory -ErrorAction SilentlyContinue

foreach ($d in $allDirs) {
  $latest = Get-ChildItem "$($d.FullName)\*.jsonl" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { continue }
  if ($latest.LastWriteTime -lt $now.AddMinutes(-120)) { continue }

  $tail = Get-Content $latest.FullName -Tail 10
  $cwd = ""
  foreach ($line in $tail) {
    if ($line -match '"cwd"\s*:\s*"([^"]+)"') { $cwd = $Matches[1] -replace '\\\\', '\'; break }
  }
  if (-not $cwd) { continue }

  if (-not $discovered.ContainsKey($cwd)) { $discovered[$cwd] = @() }
  $discovered[$cwd] += $d.Name
}

# Resolve git root for each cwd
function Get-GitRoot($path) {
  $p = $path
  while ($p -and $p -ne (Split-Path $p -Parent)) {
    if (Test-Path (Join-Path $p ".git")) { return $p }
    $p = Split-Path $p -Parent
  }
  return $path  # fallback: no .git found
}

# Group transcript dirs by git root
$byRepo = @{}
foreach ($cwd in $discovered.Keys) {
  $root = Get-GitRoot $cwd
  if ($RepoRoots -and $RepoRoots -notcontains $root) { continue }
  if (-not $byRepo.ContainsKey($root)) { $byRepo[$root] = @{cwds=@(); slugDirs=@{}} }
  $byRepo[$root].cwds += $cwd
  foreach ($sd in $discovered[$cwd]) {
    $byRepo[$root].slugDirs[$sd] = $cwd
  }
}

$results = @()
foreach ($root in $byRepo.Keys) {
  $repoName = Split-Path $root -Leaf
  $max = if ($MaxPerRepo -and $MaxPerRepo.ContainsKey($root)) { $MaxPerRepo[$root] }
         elseif ($MaxPerRepo -and $MaxPerRepo.ContainsKey($repoName)) { $MaxPerRepo[$repoName] }
         else { 3 }
  $count = 0

  # Collect all transcripts across all slug dirs in this repo, sorted by time
  $allTranscripts = @()
  foreach ($sd in $byRepo[$root].slugDirs.Keys) {
    $dirTranscripts = Get-ChildItem "$env:USERPROFILE\.claude\projects\$sd\*.jsonl" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending
    foreach ($f in $dirTranscripts) {
      if ($f.LastWriteTime -lt $now.AddMinutes(-30)) { break }
      $allTranscripts += @{File=$f; SlugDir=$sd}
    }
  }
  $allTranscripts = $allTranscripts | Sort-Object { $_.File.LastWriteTime } -Descending

  foreach ($item in $allTranscripts) {
    if ($count -ge $max) { break }
    $f = $item.File

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

    if ($lastText -match 'auto-probe from peer-sessions') { $state = "Idle" }

    $workingOn = if ($away) { $away }
                 elseif ($lastPrompt) { $lastPrompt }
                 elseif ($lastText) { $lastText.Substring(0, [Math]::Min(120, $lastText.Length)) }
                 else { "(idle at prompt)" }

    $workingOn = $workingOn -replace '\s*\(disable recaps in /config\)\s*$', ''
    $workingOn = $workingOn -replace '\n.*', ''

    # Normalize paths (transcripts store cwd with escaped backslashes)
    $cwdNorm = ($cwd -replace '\\\\', '\').TrimEnd('\')
    $rootNorm = $root.TrimEnd('\')
    $displayPath = if ($cwdNorm -eq $rootNorm) { $rootNorm }
                   else { $rootNorm + ' / ' + ($cwdNorm -replace [regex]::Escape($rootNorm + '\'), '') }

    $results += [pscustomobject]@{
      Project   = $displayPath
      Root      = $root
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
