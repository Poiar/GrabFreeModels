---
name: peer-sessions
description: Discover what other running Claude Code sessions are working on. Triggers: "what are other sessions doing", "peer sessions", "other claude tabs", "check other tabs", "who else is working", "tab context", "what's running in other tabs", "show other sessions".
---

# Peer Session Discovery

Discover what other running Claude Code sessions in this Tabby window are working on — without interrupting them.

## Steps

### 1. Identify running projects

Call `list_tabs`. Count peer tabs per project:
- Extract project dir from each peer's Playwright MCP path (`C:\OC\<X>\node_modules\...\@playwright\mcp\cli.js` → `C:\OC\<X>`)
- Npm-cache Playwright paths → check `dc.ps1` or node cmdlines for the project dir
- Exclude your own tab (the one with `bash.exe` or `git.exe`)
- For the project you're in, add +1 to the count (to account for your session)

### 2. Run scanner with counts

```powershell
& "$env:USERPROFILE\.claude\skills\peer-sessions\peer-sessions.ps1" -MaxPerRepo @{"C:\OC\Foo"=2; "C:\OC\Bar"=1}
```

The script returns the N most recent sessions per project. Filter out the line matching your last prompt.

### 3. Present

```
<cwd> — <branch> — <State>
<summary>
```

To message a discovered session, use `/peer-msg` with the project path shown.
