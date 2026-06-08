---
name: peer-msg
description: Send a message to another running Claude Code session. Triggers: "send a message to", "tell the other session", "message tab", "notify", "ask the session in tab", "peer msg", "send to tab", "message the", "tell the deepclaude", "ask the grabfreemodels".
---

# Peer Messaging

Send messages to other Claude Code sessions in this Tabby window.

## Steps

### 1. Resolve target and self

Call `list_tabs`. Filter to tabs with `claude.exe`. Then:

**Find yourself:** The tab whose Playwright MCP path contains your current project directory (e.g. `C:\OC\GrabFreeModels\node_modules\...\@playwright\mcp\cli.js`). Note that tab ID — it's your return address.

**Find the target:** If the user gave a project name (e.g. "deepclaude"), find the peer tab whose process tree contains that project path (look for `dc.ps1`, node cmdlines, or Playwright MCP paths). If ambiguous (multiple matches), show the matches and ask which one. If the user gave a tab ID directly, use it.

### 2. Send

```
send_to_tab <target-id> "[peer · <your-project> · reply: <your-tab-id>]: <message>"
```

`submit: true`. The `reply:` field lets them respond to you with `/peer-msg <your-tab-id> msg`.

### 3. Log

```powershell
$m = @{dir="out";from_tab="<your-id>";from_proj="<cwd>";to_tab="<target>";msg="<msg>";at=(Get-Date -Format "o")} | ConvertTo-Json -Compress
Add-Content "$env:USERPROFILE\.claude\peer-messages.jsonl" $m
```

## Reply flow

When you receive a message with `reply: <tab-id>`, the user can say "reply: <msg>" and you send back. No manual ID lookup needed — the return address is in the message.
