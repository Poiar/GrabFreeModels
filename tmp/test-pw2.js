const { chromium } = require('playwright');
(async () => {
  try {
    const b = await chromium.launch();
    const p = await b.newPage();
    // Disable cache
    await p.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache' });
    await p.goto('http://localhost:5173/', { timeout: 15000, waitUntil: 'networkidle' });
    const html = await p.content();
    // Extract title and script src
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const scriptMatch = html.match(/src="([^"]*\.js)"/);
    console.log('Title:', titleMatch?.[1]);
    console.log('Script:', scriptMatch?.[1]);
    const n = await p.locator('.stat-card').count();
    console.log('Stat cards:', n);
    await b.close();
  } catch(e) {
    console.error('ERROR:', e.message);
  }
})();
