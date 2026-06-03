import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/#/author`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const body = document.querySelector('.vscroll-body');
    const row = document.querySelector('.vscroll-row');
    return {
      bodyClass: body?.className || 'not found',
      bodyTag: body?.tagName,
      rowCount: document.querySelectorAll('.vscroll-row').length,
      // Check if DynamicScroller rendered
      dsWrapper: !!document.querySelector('[class*="dynamic-scroller"]'),
      rsWrapper: !!document.querySelector('[class*="recycle-scroller"]'),
      // Check the row's click handler
      rowHTML: row?.outerHTML.substring(0, 300),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });
