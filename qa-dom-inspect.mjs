import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // ─── Inspect SuperModels DOM ───
  console.log('\n=== SuperModels DOM Inspection ===');
  await page.goto(`${BASE}/#/models`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Dump the main content area HTML structure (first 5000 chars)
  const mainHTML = await page.evaluate(() => {
    const main = document.querySelector('.main-content, main, [class*="main"], #app > div');
    if (main) return main.innerHTML.substring(0, 5000);
    return document.body.innerHTML.substring(0, 5000);
  });
  console.log('\n--- Main content HTML (truncated) ---');
  console.log(mainHTML);

  // Check what selectors exist for table rows
  const rowSelectors = [
    'table tbody tr',
    '.vscroll-item',
    '.recycle-scroller__item',
    '[class*="table-row"]',
    '[class*="list-item"]',
    '[class*="vscroll"]',
    '[class*="virtual"]',
    '.recycle-scroller',
    '[class*="model-row"]',
    'tr',
  ];
  console.log('\n--- Row selector counts ---');
  for (const sel of rowSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0) console.log(`  ${sel}: ${count}`);
  }

  // Check if data is actually loaded
  const modelCount = await page.evaluate(() => {
    const store = window.__pinia?._s;
    if (store) {
      for (const [key, val] of store) {
        if (key === 'models') {
          return {
            models: val.models?.length,
            supers: val.supers?.length,
            superModels: val.superModels?.length,
            loaded: val.loaded,
            loading: val.loading,
            error: val.error,
          };
        }
      }
    }
    return null;
  });
  console.log('\n--- Pinia store state ---');
  console.log(JSON.stringify(modelCount, null, 2));

  // ─── Inspect All Models / JQL DOM ───
  console.log('\n\n=== All Models DOM Inspection ===');
  await page.goto(`${BASE}/#/all`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  const allInputs = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    return Array.from(inputs).map(i => ({
      type: i.type,
      placeholder: i.placeholder || '',
      className: i.className?.substring(0, 100) || '',
      id: i.id || '',
    }));
  });
  console.log('--- Inputs on All page ---');
  allInputs.forEach(i => console.log(`  type=${i.type} placeholder="${i.placeholder}" class="${i.className}"`));

  // Look for filter-related elements
  const filterElements = await page.evaluate(() => {
    const all = document.querySelectorAll('[class*="filter"], [class*="jql"], [class*="query"], [class*="search"]');
    return Array.from(all).slice(0, 20).map(e => ({
      tag: e.tagName,
      className: e.className?.substring(0, 150) || '',
      text: e.textContent?.substring(0, 50) || '',
    }));
  });
  console.log('\n--- Filter-related elements ---');
  filterElements.forEach(e => console.log(`  <${e.tag}> class="${e.className}" text="${e.text}"`));

  // ─── Inspect SuperModels: check if table exists but uses different structure ───
  console.log('\n\n=== SuperModels: Full table check ===');
  await page.goto(`${BASE}/#/models`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  const tableInfo = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    const result = [];
    tables.forEach(t => {
      result.push({
        className: t.className,
        rows: t.querySelectorAll('tr').length,
        headers: Array.from(t.querySelectorAll('th')).map(h => h.textContent?.trim()),
      });
    });

    // Also check for any elements with "model" in text
    const body = document.body.innerText;
    const modelLines = body.split('\n').filter(l => l.trim().length > 0 && l.trim().length < 100).slice(0, 30);

    return { tables: result, sampleText: modelLines };
  });
  console.log('--- Tables ---');
  console.log(JSON.stringify(tableInfo.tables, null, 2));
  console.log('\n--- Sample body text ---');
  tableInfo.sampleText.forEach(l => console.log(`  "${l}"`));

  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
