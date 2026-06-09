---
name: peer-msg
description: Send a message to another running Claude Code session. Triggers: "send a message to", "tell the other session", "message tab", "notify", "ask the session in tab", "peer msg", "send to tab".
---

# Peer Messaging

Format: `/peer-msg X → Y #N: msg` (new) or `re: N: reply` (reply)

## Steps

**1. Self** — `~/.claude/scripts/peer-id.ps1` returns `{uuid, name, msgN}`. If `unknown`, auto-identify via `list_tabs` (match your proxy port to the tab whose `node.exe start-proxy.ts` cmdline contains it), then cache: `~/.claude/scripts/peer-id.ps1 <uuid> <first8>`

**2. Target** — `list_tabs`, find tab with `claude.exe`, map name (first 8 chars of UUID) to full UUID.

**3. Send** — `~/.claude/scripts/peer-next.ps1` returns the next msgId. Then send. Always prefix with `/peer-msg`:

```
send_to_tab <uuid> "/peer-msg <you> → <them> #<N>: <msg>"
```

**4. Log** — `$env:USERPROFILE\.claude\scripts\peer-log.ps1 -Dir out -From <you> -To <them> -Msg "<msg>" -MsgId <N>`

## Reply flow

If `Y` matches your name → reply. If not → ignore.

```
send_to_tab <uuid> "/peer-msg <you> → <them> re: <N>: <reply>"
```

Log inbound: `$env:USERPROFILE\.claude\scripts\peer-log.ps1 -Dir in -From <them> -To <you> -Msg "<msg>" -MsgId <N>`. Log reply: same as send, with `-Refs <N>`.
