---
name: peer-msg
description: Send a message to another running Claude Code session. Triggers: "send a message to", "tell the other session", "message tab", "notify", "ask the session in tab", "peer msg", "send to tab".
---

# Peer Messaging

Send messages to other Claude Code sessions in this Tabby window via `send_to_tab`. The other session sees it as input, responds, and continues its task.

## Steps

### 1. Resolve tabs

**Self:** Read your tab ID from `$env:USERPROFILE\.claude\tab-id.txt` (cached at session start). If missing, call `list_tabs`, find your tab (Playwright path = local install in your project dir), and cache it there.

**Target:** Call `list_tabs`. Find tabs with `claude.exe`. Extract project from the Playwright MCP path:

```
C:\OC\<Project>\node_modules\...\@playwright\mcp\cli.js  →  local install = that project
npm-cache\_npx\...\@playwright\mcp\cli.js                 →  global/cache = not this project (usually deepclaude)
```

The target is the tab whose Playwright path matches the named project (local install). Prefer local over npm-cache.

Tabby matches tab ID prefixes in the `reply to:` field for readability, but `send_to_tab` requires the full UUID from `list_tabs`.

### 2. Send

First contact in a thread — include the instruction so the recipient knows the protocol:

```
send_to_tab <target-id> "[peer · <project> — reply to: <your-tab-id> · answer briefly, then resume your task]: <message>"
```

`submit: true`.

### 3. Log

```powershell
$m = @{direction="out";from_tab="<your-id>";from_proj="$pwd";to_tab="<target>";to_proj="<target-project>";message="<msg>";at=(Get-Date -Format "o")} | ConvertTo-Json -Compress
Add-Content "$env:USERPROFILE\.claude\peer-messages.jsonl" $m
```

## Reply flow

When you receive a `[peer · ...]` message, the `reply to:` field contains the sender's full tab UUID. Your tab ID is cached at `$env:USERPROFILE\.claude\tab-id.txt` — read it directly, no need to call `list_tabs`. Drop the instruction — it served its purpose on first contact:

```
send_to_tab <reply-to-id> "[peer · <your project> — reply to: <your-tab-id>]: <reply>"
```

Log both inbound and outbound so the JSONL has a complete record:

```powershell
# Outbound (reply you're sending):
$m = @{direction="out";from_tab="<your-id>";from_proj="$pwd";to_tab="<reply-to-id>";to_proj="<their-project>";message="<reply>";at=(Get-Date -Format "o")} | ConvertTo-Json -Compress
Add-Content "$env:USERPROFILE\.claude\peer-messages.jsonl" $m

# Inbound (message you received):
$m = @{direction="in";from_tab="<their-id>";to_tab="<your-id>";message="<their-message>";at=(Get-Date -Format "o")} | ConvertTo-Json -Compress
Add-Content "$env:USERPROFILE\.claude\peer-messages.jsonl" $m
```

Keep replies concise — they appear as the other session's next user input. Always use the full tab UUID for `send_to_tab`.
