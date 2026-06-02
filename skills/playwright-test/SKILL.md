---
name: playwright-test
description: Use when asked to test, screenshot, or verify a page in the Vue frontend. Triggers: http://localhost:5173, "does it render?", "use playwright", screenshot, UI check.
---

# Playwright Frontend Testing

The Vue SPA at `http://localhost:5173` requires JS — `webfetch` only gets the static shell. Use Playwright instead.

**Default: headed mode** (`headless: false`). The browser opens visibly so the user interacts with the app directly. Only use `headless: true` when explicitly asked for a headless/automated run.

`playwright` resolves from workspace root. **Always `cd` to workspace root first** — the `bash` tool does this by default.

To skip the ~150MB Chromium auto-download on `npm install`, set the env var before installing:
```bash
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1; npm install
```
Then install Chromium on demand: `npx playwright install chromium`

## Patterns

**Open headed:** `chromium.launch({headless:false})` → `goto('http://localhost:5173',{waitUntil:'networkidle'})` → `waitForTimeout(99999)` (keeps browser open).

**Screenshot:** Same pattern, add `.screenshot({path:'C:\Users\pc\AppData\Local\Temp\opencode\\screenshot.png'})` before `b.close()`.

**Complex checks:** For anything the shell would mangle, write a temp `.js` file and run it with `node`. Use `p.evaluate()` to query DOM, `p.on('console', ...)` to capture errors.

**Headless:** Only when explicitly asked — add `headless:true` and use `p.textContent('body')` for quick checks.

## Vite stale cache

If you get 500 on a Vue module after editing: `node scripts/kill-port.js --port 5173`, then restart the dev server.
