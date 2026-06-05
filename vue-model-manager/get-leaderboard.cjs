const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const apiCalls = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') && !url.includes('statsig') && !url.includes('surveys') && !url.includes('image-proxy') && !url.includes('favicon')) {
      try {
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const body = await response.text();
          apiCalls.push({ url, body: body.slice(0, 10000) });
        }
      } catch {}
    }
  });

  await page.goto('https://openrouter.ai/rankings', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(10000);

  console.log('=== API CALLS ===');
  for (const call of apiCalls) {
    console.log(`\nURL: ${call.url}`);
    console.log(call.body.slice(0, 5000));
    console.log('---');
  }

  await browser.close();
})().catch(e => console.error(e.message));
