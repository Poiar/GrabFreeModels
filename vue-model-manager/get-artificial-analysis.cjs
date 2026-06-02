const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const apiCalls = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('leaderboard') || url.includes('benchmark') || url.includes('elo') || url.includes('score')) {
      try {
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('json') || ct.includes('csv')) {
          const body = await response.text();
          apiCalls.push({ url, body: body.slice(0, 20000) });
        }
      } catch(e) {}
    }
  });

  await page.goto('https://artificialanalysis.ai/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(10000);

  const text = await page.evaluate(() => document.body.innerText);
  console.log('=== ARTIFICIAL ANALYSIS TEXT ===');
  console.log(text.slice(0, 20000));

  console.log('\n=== API CALLS ===');
  for (const call of apiCalls) {
    console.log(`\nURL: ${call.url}`);
    console.log(call.body.slice(0, 5000));
  }

  await browser.close();
})().catch(e => console.error(e.message));
