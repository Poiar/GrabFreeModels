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

## Open the app (headed, default)

```bash
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({headless:false});const p=await b.newPage();await p.goto('http://localhost:5173',{waitUntil:'networkidle'});await p.waitForTimeout(99999);await b.close();})();"
```

The browser stays open until the user closes it (or the script is killed).

## Screenshot a specific route

```bash
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({headless:false});const p=await b.newPage();await p.goto('http://localhost:5173/#/route',{waitUntil:'networkidle'});await p.waitForTimeout(2000);await p.screenshot({path:'C:\\Users\\pc\\AppData\\Local\\Temp\\opencode\\screenshot.png'});console.log('Screenshot saved');await b.close();})();"
```

## Complex checks (write temp script)

For anything the shell would mangle (double-quotes, `$$`, `>>`), write to a temp file:

`write` → `C:\Users\pc\AppData\Local\Temp\opencode\_check.js` :
```js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: false });
  const p = await b.newPage();
  p.on('console', msg => { if (msg.type() === 'error') console.log('ERR:', msg.text()); });

  await p.goto('http://localhost:5173/#/route', { waitUntil: 'networkidle', timeout: 15000 });
  await p.waitForTimeout(3000);

  const rows = await p.evaluate(() =>
    Array.from(document.querySelectorAll('tbody tr')).slice(0, 5).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
    )
  );
  console.table(rows);
  await b.close();
})();
```

```bash
node "C:\Users\pc\AppData\Local\Temp\opencode\_check.js"
```

## Headless mode (automated runs only)

Only when explicitly asked:

```bash
node -e "const {chromium}=require('playwright');(async()=>{const p=await (await chromium.launch({headless:true})).newPage();await p.goto('http://localhost:5173/#/route',{waitUntil:'networkidle'});await p.waitForTimeout(2000);console.log((await p.textContent('body')).substring(0,500));await p.context().browser().close();})();"
```

## Vite stale cache (500 on a Vue module after editing)

Kill the port and restart:
```bash
node scripts/kill-port.js --port 5173
```
Then restart from a separate terminal or Start-Process — the `bash` tool can't block on a long-running dev server.
