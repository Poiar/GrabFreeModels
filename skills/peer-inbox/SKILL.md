---
name: peer-inbox
description: Check recent peer-to-peer messages between Claude Code sessions. Triggers: "check inbox", "peer inbox", "any messages", "show messages from other sessions", "did anyone message me", "inbox".
---

# Peer Inbox

Check the shared message log for messages addressed to this project.

## Steps

### 1. Read messages for this project

```powershell
$log = "$env:USERPROFILE\.claude\peer-messages.jsonl"
if (-not (Test-Path $log)) {
  Write-Host "No peer messages yet."
  return
}

$here = (Get-Location).Path.TrimEnd('\')
$found = $false
Get-Content $log -Tail 50 | ForEach-Object {
  $m = try { $_ | ConvertFrom-Json } catch { $null }
  if (-not $m -or -not $m.to_proj) { continue }
  $to = $m.to_proj.ToString().TrimEnd('\')
  if ($to -eq $here -or $to -eq '*') {
    $found = $true
    $from = if ($m.from_proj) { $m.from_proj } elseif ($m.from_project) { $m.from_project } else { "unknown" }
    $msg = if ($m.message) { $m.message } else { $m.msg }
    Write-Host "$($m.at)  from $from: $msg"
  }
}
if (-not $found) {
  Write-Host "No messages for this project."
}
```

The filter on `to_proj` means you only see messages meant for you — no noise from cross-project chatter.

### Reply

To reply, run `/peer-msg` with the project name from `from_proj` — e.g., if `from_proj` is `C:\OC\deepclaude`, target is `deepclaude`.
