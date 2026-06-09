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
C:\OC\<Project>\node_modules\...\@playwright\mcp\cli.js  →  local install = that project
npm-cache\_npx\...\@playwright\mcp\cli.js                 →  global/cache = not this project (usually deepclaude)
```

**Self:** The tab whose Playwright path uses a LOCAL install in your project dir. When multiple tabs share the same project (all local), use `bash.exe` vs `pwsh.exe` as tiebreaker.

**Target:** The tab whose Playwright path matches the named project (local install). Prefer local over npm-cache.

Tabby matches tab ID prefixes in the `reply to:` field for readability, but `send_to_tab` requires the full UUID from `list_tabs`.

### 2. Send

```
send_to_tab <target-tab-id> "[peer · <project> — reply to: <your-tab-id>]: <message>"
```

`submit: true`. For first contact in a thread, include "answer briefly, then resume your task" before the closing bracket.

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

Keep replies concise — they appear as the other session's next user input. Use the full tab UUID from `list_tabs` for `send_to_tab`.
