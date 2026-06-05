const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const apiCalls = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('leaderboard') || url.includes('arena') || url.includes('elo') || url.includes('benchmark')) {
      try {
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('json') || ct.includes('csv')) {
          const body = await response.text();
          apiCalls.push({ url, body: body.slice(0, 20000) });
        }
      } catch {}
    }
  });

  // Try the Arena leaderboard page
  await page.goto('https://lmarena.ai/?leaderboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(12000);

  // Get rendered text
  const text = await page.evaluate(() => document.body.innerText);
  console.log('=== ARENA PAGE TEXT ===');
  console.log(text.slice(0, 20000));

  console.log('\n=== API CALLS ===');
  for (const call of apiCalls) {
    console.log(`\nURL: ${call.url}`);
    console.log(call.body.slice(0, 5000));
  }

  await browser.close();
})().catch(e => console.error(e.message));
