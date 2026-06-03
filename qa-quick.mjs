import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
let ok = 0, fail = 0;
function pass(m) { ok++; console.log(`  ✅ ${m}`); }
function fail_(m) { fail++; console.log(`  ❌ ${m}`); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Author overlay click
  await page.goto(`${BASE}/#/author`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const aRow = page.locator('.vscroll-row').first();
  if (await aRow.count() > 0) {
    await aRow.click();
    await page.waitForTimeout(800);
    if (await page.locator('.family-detail-overlay').count() > 0) pass('Author overlay opens on click');
    else fail_('Author overlay did not appear');
  } else fail_('No author rows');

  // Author overlay Escape close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if (await page.locator('.family-detail-overlay').count() === 0) pass('Author overlay closes on Escape');
  else fail_('Author overlay still visible after Escape');

  // Family overlay click
  await page.goto(`${BASE}/#/family`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const fRow = page.locator('.vscroll-row').first();
  if (await fRow.count() > 0) {
    await fRow.click();
    await page.waitForTimeout(800);
    if (await page.locator('.family-detail-overlay').count() > 0) pass('Family overlay opens on click');
    else fail_('Family overlay did not appear');
  } else fail_('No family rows');

  // Family overlay Escape close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if (await page.locator('.family-detail-overlay').count() === 0) pass('Family overlay closes on Escape');
  else fail_('Family overlay still visible after Escape');

  console.log(`\n${ok} passed, ${fail} failed`);
  await browser.close();
  if (fail > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
