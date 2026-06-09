---
name: peer-msg
description: Send a message to another running Claude Code session. Triggers: "send a message to", "tell the other session", "message tab", "notify", "ask the session in tab", "peer msg", "send to tab".
---

# Peer Messaging

Send messages to other Claude Code sessions in this Tabby window via `send_to_tab`. The other session sees it as input, responds, and continues its task.

## Steps

### 1. Resolve tabs

Call `list_tabs`. Find tabs with `claude.exe`. Extract project from the Playwright MCP path:

```
C:\OC\<Project>\node_modules\...\@playwright\mcp\cli.js  →  <Project> (local)
npm-cache\...\@playwright\mcp\cli.js                      →  global — fall back to dc.ps1 cmdline
```

**Self:** The tab whose Playwright path contains your current project directory, AND has `bash.exe` or `git.exe` (tiebreaker when multiple tabs share the same project).

**Target:** The tab whose Playwright path (or dc.ps1 fallback) matches the named project.

### 2. Send

```
send_to_tab <target-tab-id> "[peer · <project> · reply to: <your-tab-id> · answer briefly, then resume your task]: <message>"
```

`submit: true`. No slug — it's unreliable. The `reply to:` field is the routing mechanism.

### 3. Log

```powershell
$m = @{direction="out";from_tab="<your-id>";from_project="$pwd";to_tab="<target>";message="<msg>";at=(Get-Date -Format "o")} | ConvertTo-Json -Compress
Add-Content "$env:USERPROFILE\.claude\peer-messages.jsonl" $m
```

## Reply flow

When you receive a `[peer · ...]` message, the `reply to:` field contains the sender's tab ID. Reply:

```
send_to_tab <reply-to-id> "[peer · <your project> — reply to: <your-tab-id>]: <reply>"
```

Keep replies concise — they appear as the other session's next user input.
