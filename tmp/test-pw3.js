const { chromium } = require('playwright');
(async () => {
  try {
    const b = await chromium.launch();
    const p = await b.newPage();
    await p.goto('http://localhost:5173/', { timeout: 15000, waitUntil: 'domcontentloaded' });
    // Wait for data to load (spinner to disappear)
    await p.waitForSelector('.stat-card', { timeout: 15000 });
    const n = await p.locator('.stat-card').count();
    console.log('Stat cards:', n);
    const title = await p.title();
    console.log('Title:', title);
    await p.screenshot({ path: 'C:\\OC\\GrabFreeModels\\tmp\\ss-final.png' });
    await b.close();
    console.log('ALL OK');
  } catch(e) {
    console.error('ERROR:', e.message);
  }
})();
