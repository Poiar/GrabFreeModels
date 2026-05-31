---
name: playwright-test
description: Use when asked to test, screenshot, or verify a page in the Vue frontend. Also use when asked "does it load?", "does it render?", "check the page", or "use playwright". Triggers: http://localhost:5173, screenshot, render check, UI test.
---

# Playwright Frontend Testing

The Vue frontend runs at `http://localhost:5173` (Vite dev server). Use Playwright headless to verify pages render correctly — `webfetch` only retrieves the static HTML shell since the app is a JS SPA.

## Prerequisites

Playwright is a dependency at both root and `vue-model-manager/`. Browsers are already installed by prior sessions; re-run only if launch fails:

```powershell
npx playwright install
```

## Pattern

Place scripts in a temp file under `C:\Users\pc\AppData\Local\Temp\opencode\` so they don't land in the workspace. Always use a IIFE scoped to the current dir — Vite resolves `playwright` from the workspace `node_modules`.

```powershell
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/#/route', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Dump rendered text
  console.log(await page.textContent('body'));

  // Or inspect specific elements
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('tbody tr')).slice(0, 5).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
    )
  );
  console.table(rows);

  await browser.close();
})();
"
```

## Tips

- Use `{ waitUntil: 'networkidle' }` so Vite finishes hydrating the SPA before assertions.
- `page.textContent('body')` dumps everything the Vue app rendered (equivalent to "sees" in the browser).
- For screenshots: `await page.screenshot({ path: 'C:/Users/pc/AppData/Local/Temp/shot.png' })`.
- If `.status-btn:nth-child(3)` fails, target by text instead: `await page.click('button:has-text("Untested")')`.
- `playwright` resolves from `node_modules` at either workspace root or `vue-model-manager/` — no install needed in the one-liner.
