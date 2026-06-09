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
    Write-Host "$($m.at)  from $($m.from_proj): $($m.msg)"
  }
}
if (-not $found) {
  Write-Host "No messages for this project."
}
```

The filter on `to_proj` means you only see messages meant for you — no noise from cross-project chatter.

### Reply

To reply, use `/peer-msg` with the `from_proj` shown in the message as the target.
