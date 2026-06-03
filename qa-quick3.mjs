import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Force hard reload
  await page.goto(`${BASE}/#/author`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.evaluate(() => location.reload(true));
  await page.waitForTimeout(2000);

  const scrollerExists = await page.evaluate(() => {
    return {
      dynamicEl: !!document.querySelector('[class*="dynamic-scroller"]'),
      recycleEl: !!document.querySelector('[class*="recycle"]'),
      vscrollBody: !!document.querySelector('.vscroll-body'),
      rowCount: document.querySelectorAll('.vscroll-row').length,
    };
  });
  console.log('Scroller state:', JSON.stringify(scrollerExists));

  // Check the scroller type by looking at the body class
  const bodyClass = await page.evaluate(() => {
    const body = document.querySelector('.vscroll-body');
    return body?.className || 'not found';
  });
  console.log('vscroll-body class:', bodyClass);

  // Try to directly invoke the click handler via Vue
  const result = await page.evaluate(() => {
    const row = document.querySelector('.vscroll-row');
    if (!row) return 'no row';

    // Find the vue component that has selectedAuthor
    function getVueInstance(el, depth = 0) {
      if (depth > 15) return null;
      if (el.__vueParentComponent) {
        const ctx = el.__vueParentComponent.props || {};
        // The component exposing rows owns selectedAuthor
      }
      for (const child of el.children || []) {
        const r = getVueInstance(child, depth + 1);
        if (r) return r;
      }
      return null;
    }

    // Check if the row has __vueEventHandlers (Vue 3.3+)
    const keys = Object.keys(row).filter(k => k.startsWith('__vue'));
    return { vueKeys: keys };
  });
  console.log('Row Vue keys:', JSON.stringify(result));

  // Click the row
  const row = page.locator('.vscroll-row').first();
  await row.click();
  await page.waitForTimeout(1000);
  const overlay = await page.locator('.family-detail-overlay').count();
  console.log('Overlay after click:', overlay);

  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });
