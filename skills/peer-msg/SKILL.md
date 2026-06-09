---
name: peer-msg
description: Send a message to another running Claude Code session. Triggers: "send a message to", "tell the other session", "message tab", "notify", "ask the session in tab", "peer msg", "send to tab".
---

# Peer Messaging

Send messages to other Claude Code sessions in this Tabby window.

## Steps

### 1. Resolve tabs via Playwright MCP paths

Call `list_tabs`. Filter to tabs with `claude.exe`. Then run:

```powershell
# Save list_tabs output to temp file, then:
& "$env:USERPROFILE\.claude\skills\peer-msg\resolve-peers.ps1" -MyProject "GrabFreeModels" < tabs.json
```

The script maps each tab to its project by scanning Playwright MCP paths:
- `C:\OC\<Project>\node_modules\...\@playwright\mcp\cli.js` → `<Project>` (local)
- `npm-cache\...\@playwright\mcp\cli.js` → `(global)` — fall back to process cmdlines

**Self** is the tab marked `<-- YOU`. **Target** is the tab matching the named project.

### 2. Send the message

```
send_to_tab <target-tab-id> "[peer · <project> · <slug> · reply to: <your-tab-id> · answer briefly, then resume your task]: <message>"
```

Use `submit: true`. Include the return tab ID so they can reply.

### 3. Log + confirm

Log to `C:\Users\pc\.claude\peer-messages.jsonl`:
```json
{"direction":"out","from_tab":"<your-id>","from_project":"<cwd>","from_slug":"<slug>","to_tab":"<target>","message":"<msg>","at":"<ISO>"}
```

## Reply flow

When someone sends you a message, the `reply to:` field contains their tab ID. Your user can say "reply: yes, I updated the schema" and you run:

```
send_to_tab <reply-to-id> "[peer · <your project> · <your slug> — reply to: <your-tab-id>]: yes, I updated the schema"
```

Keep replies concise — they appear as the other session's next user input.
