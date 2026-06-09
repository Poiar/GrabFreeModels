---
name: peer-msg
description: Send a message to another running Claude Code session. Triggers: "send a message to", "tell the other session", "message tab", "notify", "ask the session in tab", "peer msg", "send to tab".
---

# Peer Messaging

Send messages to other Claude Code sessions via `send_to_tab`. Use the full tab UUID — prefix matching is display-only.

## Steps

### 1. Resolve IDs

**Self:** Read from `$env:USERPROFILE\.claude\tab-id.txt` (cached at session start). If missing, call `list_tabs` and find your tab by matching your project dir against Playwright MCP paths.

**Target:** Call `list_tabs`, find tabs with `claude.exe`, and identify the target by its Playwright MCP path — a local install under `C:\OC\<Project>\node_modules\...\@playwright\mcp\cli.js` means that project; an `npm-cache\_npx\...` path means global (usually deepclaude). Prefer local over npm-cache.

### 2. Send

First contact — include the protocol instruction:

```
send_to_tab <target-id> "[peer · <project> — reply to: <your-tab-id> · answer briefly, then resume your task]: <message>"
```

Submit with `submit: true`.

### 3. Log

```powershell
$m = @{direction="out";from_tab="<your-id>";from_proj="$pwd";to_tab="<target>";to_proj="<target-project>";message="<msg>";at=(Get-Date -Format "o")} | ConvertTo-Json -Compress
Add-Content "$env:USERPROFILE\.claude\peer-messages.jsonl" $m
```

## Reply flow

When you receive a `[peer · ...]` message, the `reply to:` field contains the sender's tab UUID. Your ID is in the cache file — no need to call `list_tabs`. Drop the instruction and reply:

```
send_to_tab <reply-to-id> "[peer · <your project> — reply to: <your-tab-id>]: <reply>"
```

Log as in step 3, plus an inbound entry (`direction="in"`, `from_tab` = their ID, `to_tab` = your ID). Keep replies concise.
