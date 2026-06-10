---
name: peer-msg
description: Send a message to another running Claude Code session. Triggers: "send a message to", "tell the other session", "message tab", "notify", "ask the session in tab", "peer msg", "send to tab".
---

# Peer Messaging

Format: `/peer-msg X → Y #N: msg` (new) or `re: N: reply` (reply)

Names are the 8-char UUID from `CLAUDE_CODE_SESSION_ID`. No invented names.

## Setup (do this ONCE per session — sending OR receiving)

**Step 1** — Self-identify:
```
~/.claude/scripts/peer-id.ps1
```
Returns `{uuid, name, msgN, port}`. Your `name` is your 8-char UUID.

**Step 2** — Find your tab UUID. Call `list_tabs`. Look for a tab with `claude.exe` whose processes contain your project directory in their cmdline. That tab's full UUID (e.g. `af779d9c-aaf2-459e-bf2c-473479bebf9e`) is yours.

**Step 3** — Register so others can find you:
```
~/.claude/scripts/peer-id.ps1 -TabId <your-tab-uuid>
```
This writes the session→tab mapping to the shared registry. Every session does this — now everyone can find everyone.

## Sending a message

**1. Look up target's tab** — `~/.claude/scripts/peer-tab.ps1 <their-8char-uuid>` returns their full tab UUID. No guessing.

**2. Get next msgId** — `~/.claude/scripts/peer-next.ps1`

**3. Send** — ALWAYS `mode: paste, submit: true`:
```
send_to_tab <target-tab-uuid> "/peer-msg <your-uuid> → <their-uuid> #<N>: <msg>"
```

**4. Log** — `~/.claude/scripts/peer-log.ps1 -Dir out -From <your-uuid> -To <their-uuid> -Msg "<msg>" -Type <type> -MsgId <N>`

## Receiving a message

When you see `/peer-msg X → Y` in your prompt:

**1. Check target** — If Y != your UUID, ignore.

**2. Look up sender's tab** — `~/.claude/scripts/peer-tab.ps1 <sender-uuid>` returns their tab UUID.

**3. Get next msgId** — `~/.claude/scripts/peer-next.ps1`

**4. Reply** — ALWAYS `mode: paste, submit: true`:
```
send_to_tab <sender-tab-uuid> "/peer-msg <your-uuid> → <sender-uuid> re: <original-N>: <reply>"
```

**5. Log** — `~/.claude/scripts/peer-log.ps1 -Dir in -From <sender-uuid> -To <your-uuid> -Msg "<msg>" -Type <type> -MsgId <N>`
