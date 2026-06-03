import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${BASE}/#/author`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);

  // Check the row structure after switch to DynamicScroller
  const info = await page.evaluate(() => {
    const row = document.querySelector('.vscroll-row');
    if (!row) return 'no row';

    // Check parent chain
    const dsi = row.closest('[class*="dynamic-scroller-item"]');
    const ds = document.querySelector('[class*="dynamic-scroller"]');

    // Check if vue event handlers exist on the row
    let hasVueHandler = false;
    let el = row;
    while (el) {
      if (el.__vueParentComponent) {
        const exposed = el.__vueParentComponent.exposed || {};
        const ctx = el.__vueParentComponent.ctx || {};
        hasVueHandler = !!el.__vueParentComponent.props;
        break;
      }
      el = el.parentElement;
    }

    return {
      rowClass: row.className,
      rowHTML: row.outerHTML.substring(0, 400),
      hasDynamicScroller: !!ds,
      dsiClass: dsi?.className || 'none',
      hasVueHandler,
      // Check all event listeners (won't work in all browsers but try)
      onclick: typeof row.onclick,
    };
  });
  console.log('Row info:', JSON.stringify(info, null, 2));

  // Try clicking the row via Playwright
  const row = page.locator('.vscroll-row').first();
  const box = await row.boundingBox();
  if (box) {
    console.log(`Clicking at (${box.x + box.width / 2}, ${box.y + box.height / 2})`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1000);

    // Check if overlay appeared
    const overlay = await page.evaluate(() => document.querySelector('.family-detail-overlay') !== null);
    console.log('Overlay after mouse click:', overlay);

    // Debug: try to find what element was actually clicked
    const clickedTag = await page.evaluate(() => {
      // Set up a one-time check
      return document.activeElement?.tagName || 'none';
    });
    console.log('Active element:', clickedTag);
  }

  // Let's try a COMPLETELY different approach — use router push to open the detail
  // First check: does the click handler fire at all?
  await page.evaluate(() => {
    const row = document.querySelector('.vscroll-row');
    if (!row) return;

    // Patch click to log
    const origDispatch = Event.prototype.dispatchEvent;
    window.__clicked = false;
    row.addEventListener('click', () => { window.__clicked = true; }, true);
  });

  // Click again
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);
    const clicked = await page.evaluate(() => window.__clicked);
    console.log('Click event reached row:', clicked);
  }

  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });
