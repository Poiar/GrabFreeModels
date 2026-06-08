---
name: peer-inbox
description: Check recent peer-to-peer messages between Claude Code sessions. Triggers: "check inbox", "peer inbox", "any messages", "show messages from other sessions", "did anyone message me", "inbox".
---

# Peer Inbox

Check the shared message log to see recent inter-session messages.

## Steps

Read the message log:

```powershell
if (Test-Path "$env:USERPROFILE\.claude\peer-messages.jsonl") {
  Get-Content "$env:USERPROFILE\.claude\peer-messages.jsonl" -Tail 20 | ForEach-Object {
    $m = $_ | ConvertFrom-Json
    "$($m.at)  $($m.from_project) [$($m.from_slug)] → $($m.to_tab): $($m.message)"
  }
} else {
  "No peer messages yet."
}
```

Show the last 20 messages. If the user asks to reply, use `/peer-msg` with the source tab ID.
