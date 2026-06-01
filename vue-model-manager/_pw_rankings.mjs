import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

// Log console errors
page.on('console', msg => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
});

await page.goto('http://localhost:5173/rankings', { waitUntil: 'networkidle', timeout: 15000 });

// Wait for the store to load data
await page.waitForFunction(() => {
  const rows = document.querySelectorAll('tbody tr');
  const unranked = document.querySelectorAll('.unranked-card');
  const empty = document.querySelector('.empty-state');
  return rows.length > 0 || unranked.length > 0 || empty !== null;
}, { timeout: 10000 }).catch(() => console.log('Timed out waiting for content'));

await page.waitForTimeout(2000);
await page.screenshot({ path: 'C:/Users/pc/AppData/Local/Temp/opencode/rankings-full.png', fullPage: true });
console.log('Full page screenshot saved');

// Check loading state
const loadingState = await page.evaluate(() => {
  const store = document.querySelector('.loading') || document.querySelector('[data-loading]');
  const emptyState = document.querySelector('.empty-state');
  const tbody = document.querySelector('tbody');
  const rows = tbody ? tbody.querySelectorAll('tr') : [];
  return {
    hasLoading: store !== null,
    hasEmpty: emptyState !== null,
    rowCount: rows.length,
    bodyText: document.body.innerText.substring(0, 500),
  };
});
console.log('Page state:', JSON.stringify(loadingState, null, 2));

// Try fetching the JSON directly from the page context
const jsonStatus = await page.evaluate(async () => {
  try {
    const resp = await fetch('/available-models.json');
    const data = await resp.json();
    return {
      ok: true,
      modelCount: data.models?.length ?? 0,
      roles: Object.keys(data._role_rankings ?? {}),
      roleSizes: Object.fromEntries(Object.entries(data._role_rankings ?? {}).map(([k, v]) => [k, v.length])),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
console.log('JSON data:', JSON.stringify(jsonStatus, null, 2));

const rows = await page.$$eval('tbody tr', trs => trs.map(tr => {
  const cells = tr.querySelectorAll('td');
  return {
    rankings: cells[0]?.innerText ?? '',
    model: cells[1]?.innerText ?? '',
    provider: cells[2]?.innerText ?? '',
    status: cells[3]?.innerText ?? '',
    context: cells[4]?.innerText ?? '',
    tools: cells[5]?.innerText ?? '',
  };
}));
console.log('--- TABLE DATA (first 30 rows) ---');
rows.slice(0, 30).forEach((r, i) => console.log(JSON.stringify({i, ...r})));
console.log('Total rows on page:', rows.length);

const unrankedCards = await page.$$eval('.unranked-card', cards => cards.map(c => ({
  name: c.querySelector('.unranked-name')?.textContent ?? '',
  id: c.querySelector('.model-id')?.textContent ?? '',
})));
console.log('--- UNRANKED MODELS ---');
unrankedCards.forEach((c, i) => console.log(i, c.name, '|', c.id));
console.log('Unranked count:', unrankedCards.length);

// Get pagination info
const pgInfo = await page.$('.pg-info');
if (pgInfo) {
  console.log('Pagination:', await pgInfo.textContent());
}

const resultCount = await page.$('.result-count');
if (resultCount) {
  console.log('Result count:', await resultCount.textContent());
}

await browser.close();
