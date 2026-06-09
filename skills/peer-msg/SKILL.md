---
name: peer-msg
description: Send a message to another running Claude Code session. Triggers: "send a message to", "tell the other session", "message tab", "notify", "ask the session in tab", "peer msg", "send to tab".
---

# Peer Messaging

Send messages to other Claude Code sessions in this Tabby window.

## Steps

### 1. Resolve tabs via Playwright MCP paths

Call `list_tabs`. Filter to tabs with `claude.exe`. Extract the project from each tab's Playwright MCP path:

- `C:\OC\<Project>\node_modules\...\@playwright\mcp\cli.js` → project is `<Project>`, tab is local to that repo
- `npm-cache\...\@playwright\mcp\cli.js` → global install, project unknown from path alone

**Find yourself:** The tab whose Playwright path contains your current project directory.

**Find the target:** If the user names a project (e.g. "deepclaude"), match the tab whose Playwright path or process cmdlines reference that project. If ambiguous, show matches and ask.

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
