---
name: peer-msg
description: Send a message to another running Claude Code session. Triggers: "send a message to", "tell the other session", "message tab", "notify", "ask the session in tab", "peer msg", "send to tab".
---

# Peer Messaging

Send messages to other Claude Code sessions in this Tabby window.

## Steps

### 1. Find the target tab

If the user doesn't specify a tab ID, call `list_tabs` and show them the running peer sessions first (see peer-sessions skill). Let them pick.

### 2. Get your return address

Get your own tab ID from `list_tabs` (the tab with `bash.exe` or `git.exe` in its process tree, or match by your cwd).

### 3. Send the message

```
send_to_tab <target-tab-id> "[peer · <project> · <slug> · reply to: <your-tab-id> · answer briefly, then resume your task]: <message>"
```

Use `submit: true`. Include the return tab ID so they can reply.

### 4. Log + confirm

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
