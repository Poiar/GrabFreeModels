const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('http://localhost:5173/#/models', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  const outDir = 'C:\\Users\\pc\\AppData\\Local\\Temp\\opencode\\screenshots';
  fs.mkdirSync(outDir, { recursive: true });

  // Check the vscroll-row structure
  const rowInfo = await page.evaluate(() => {
    const rows = document.querySelectorAll('.vscroll-row');
    if (!rows.length) return 'no rows found';
    const first = rows[0];
    const cs = window.getComputedStyle(first);
    const cells = first.querySelectorAll('.vscroll-cell');
    const cellInfo = Array.from(cells).map(c => {
      const s = window.getComputedStyle(c);
      return {
        className: c.className,
        width: s.width,
        minWidth: s.minWidth,
        maxWidth: s.maxWidth,
        display: s.display,
        flex: s.flex,
      };
    });
    return {
      rowDisplay: cs.display,
      rowHeight: cs.height,
      rowPadding: cs.padding,
      rowMargin: cs.margin,
      rowFlex: cs.flex,
      totalRows: rows.length,
      cells: cellInfo,
      innerHTML: first.innerHTML.substring(0, 500),
    };
  });
  console.log('Row info:', JSON.stringify(rowInfo, null, 2));

  // Check what the vue-virtual-scroller renders
  const scrollerInfo = await page.evaluate(() => {
    const scroller = document.querySelector('.vue-recycle-scroller');
    if (!scroller) return 'no scroller';
    const views = scroller.querySelectorAll('.vue-recycle-scroller__item-view');
    const viewInfo = Array.from(views).slice(0, 3).map(v => {
      const s = window.getComputedStyle(v);
      return {
        position: s.position,
        height: s.height,
        transform: s.transform,
        width: s.width,
      };
    });
    return {
      totalViews: views.length,
      views: viewInfo,
    };
  });
  console.log('Scroller info:', JSON.stringify(scrollerInfo, null, 2));

  // Screenshot just the table area
  const tableEl = await page.$('.vscroll-table');
  if (tableEl) {
    await tableEl.screenshot({ path: path.join(outDir, 'models-table-only.png') });
    console.log('Table screenshot saved');
  }

  // Screenshot the whole page
  await page.screenshot({ path: path.join(outDir, 'models-fullpage.png'), fullPage: true });
  console.log('Full page saved');

  await b.close();
})();
