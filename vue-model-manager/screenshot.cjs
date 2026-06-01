const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const b = await chromium.launch({ headless: true });
  const viewport = { width: 1600, height: 900 };
  const outDir = 'C:\\Users\\pc\\AppData\\Local\\Temp\\opencode\\screenshots';
  fs.mkdirSync(outDir, { recursive: true });

  const pages = [
    { url: 'http://localhost:5173/#/', name: 'dashboard-final' },
    { url: 'http://localhost:5173/#/models', name: 'models-final' },
    { url: 'http://localhost:5173/#/rankings', name: 'rankings-final' },
    { url: 'http://localhost:5173/#/issues', name: 'issues-final' },
  ];

  for (const p of pages) {
    const page = await b.newPage();
    await page.setViewportSize(viewport);
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(outDir, `${p.name}.png`), fullPage: true });
    console.log(`Saved: ${p.name}.png`);
    await page.close();
  }

  await b.close();
})();
