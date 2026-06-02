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
          apiCalls.push({ url, body: body.slice(0, 15000) });
        }
      } catch(e) {}
    }
  });

  // Check the compare page and the models page for benchmark data
  await page.goto('https://openrouter.ai/compare', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(8000);

  const text = await page.evaluate(() => document.body.innerText);
  console.log('=== COMPARE PAGE TEXT ===');
  console.log(text.slice(0, 10000));

  console.log('\n=== API CALLS ===');
  for (const call of apiCalls) {
    console.log(`\nURL: ${call.url}`);
    console.log(call.body.slice(0, 5000));
  }

  await browser.close();
})().catch(e => console.error(e.message));
