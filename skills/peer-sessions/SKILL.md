---
name: peer-sessions
description: Discover what other running Claude Code sessions are working on. Triggers: "what are other sessions doing", "peer sessions", "other claude tabs", "check other tabs", "who else is working", "tab context", "what's running in other tabs", "show other sessions".
---

# Peer Session Discovery

Show what other Claude Code sessions are running — without interrupting them.

**1. Self** — `~/.claude/scripts/peer-id.ps1` to get your UUID (exclude yourself).

**2. List** — `list_tabs`. For each tab with `claude.exe` that isn't you, report:
- Short name (first 8 chars of UUID)
- Project (Playwright path: `C:\OC\<X>\node_modules\...` → `C:\OC\<X>`; npm-cache → deepclaude)

**3. Context** — For each session, check inbox (`peer-inbox`) or process cmdlines for recent activity.

To message a discovered session, use `/peer-msg` with the short name.
