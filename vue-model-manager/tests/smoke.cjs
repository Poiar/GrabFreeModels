const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.log(`  FAIL: ${msg}`); }
}

async function getCount(page) {
  const el = await page.$('.result-count') || await page.$('.filter-count');
  if (!el) return 0;
  const text = await el.textContent();
  return(parseInt(text) || 0);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  async function waitForContent() {
    await page.waitForSelector('.type-pills, .jql-input, .vscroll-row, .empty-state, .result-count, .filter-count, table', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  // ── Free: role pills show models ──
  console.log('\n=== Free: role pills should show models ===');
  await page.goto(`${BASE}/#/free`, { waitUntil: 'networkidle', timeout: 15000 });
  await waitForContent();

  const pills = await page.$$('.type-pills .status-btn');
  assert(pills.length >= 4, `${pills.length} role pills found (expected >= 4)`);

  for (const pill of pills) {
    const text = await pill.textContent();
    const label = text.trim();
    await pill.click();
    await page.waitForTimeout(1500);
    const empty = await page.$('.empty-state');
    const count = await getCount(page);
    assert(!empty && count > 0, `Role "${label}" has ${count} results (expected > 0)`);
  }

  // ── All: JQL source filter ──
  console.log('\n=== All: JQL source filter ===');
  await page.goto(`${BASE}/#/all`, { waitUntil: 'networkidle', timeout: 15000 });
  await waitForContent();

  const input = await page.$('.jql-input');
  if (input) {
    await input.click();
    await input.fill('source:curated');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(2000);
    const curatedCount = await getCount(page);
    assert(curatedCount > 0, `source:curated returns ${curatedCount} results`);

    await input.click();
    await input.fill('source:models.dev');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(2000);
    const mdCount = await getCount(page);
    assert(mdCount > 0, `source:models.dev returns ${mdCount} results`);

    await input.click();
    await input.fill('');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1500);
    const allCount = await getCount(page);
    assert(allCount > curatedCount, `Clearing filter returns ${allCount} (more than curated ${curatedCount})`);
  } else {
    failed++;
    console.log('  FAIL: JQL input not found');
  }

  // ── Navigation: data persists across route switches ──
  console.log('\n=== Navigation: data persists across route switches ===');
  await page.goto(`${BASE}/#/all`, { waitUntil: 'networkidle', timeout: 15000 });
  await waitForContent();
  const allCount1 = await getCount(page);
  assert(allCount1 > 0, `All page shows ${allCount1} results`);

  await page.click('nav a[href="#/"]');
  await page.waitForTimeout(2000);
  const heading = await page.$('h2');
  const headingText = heading ? await heading.textContent() : '';
  assert(headingText.includes('Dashboard'), 'Dashboard renders after navigating from All');

  await page.click('nav a[href="#/all"]');
  await page.waitForTimeout(2000);
  const allCount2 = await getCount(page);
  assert(allCount2 > 0, `All page re-renders with ${allCount2} results after returning`);

  // ── Console errors ──
  console.log('\n=== Console errors ===');
  assert(errors.length === 0, `No console errors (got ${errors.length})`);
  if (errors.length > 0) errors.slice(0, 5).forEach(e => console.log(`    ERR: ${e}`));

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
