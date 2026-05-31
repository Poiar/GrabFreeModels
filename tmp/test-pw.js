const { chromium } = require('playwright');
(async () => {
  try {
    const b = await chromium.launch();
    const p = await b.newPage();
    await p.goto('http://localhost:5173/', { timeout: 15000 });
    console.log('Title:', await p.title());
    const n = await p.locator('.stat-card').count();
    console.log('Stat cards:', n);
    await p.screenshot({ path: 'C:\\OC\\GrabFreeModels\\tmp\\ss-test.png' });
    await b.close();
    console.log('ALL OK');
  } catch(e) {
    console.error('ERROR:', e.message);
  }
})();
