const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = 'C:\\OC\\GrabFreeModels\\tmp';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const results = [];
function pass(name) { results.push({ name, ok: true }); console.log(`  ✅ ${name}`); }
function fail(name, reason) { results.push({ name, ok: false, reason }); console.log(`  ❌ ${name} — ${reason}`); }

(async () => {
  console.log('🚀 Launching Chromium...\n');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // ── Dashboard ──
  console.log('📊 Dashboard');
  await page.goto(BASE);
  await page.waitForSelector('.stat-card', { timeout: 15000 });

  const title = await page.title();
  title.includes('Dashboard') ? pass(`Title: "${title}"`) : fail('Title', `Got "${title}"`);
  (await page.textContent('.brand h1')).trim() === 'GrabFreeModels' ? pass('Brand heading') : fail('Brand heading', 'mismatch');

  const statCount = await page.locator('.stat-card').count();
  statCount >= 4 ? pass(`Stat cards (${statCount})`) : fail('Stat cards', `Only ${statCount}`);

  const providerCards = await page.locator('.provider-card').count();
  providerCards > 0 ? pass(`Provider cards (${providerCards})`) : fail('Provider cards', 'none');

  const bars = await page.locator('.bar-fill').count();
  bars > 0 ? pass(`Health bars (${bars})`) : fail('Health bars', 'none');

  const navLinks = await page.locator('.sidebar nav a').count();
  navLinks === 4 ? pass(`Nav links (${navLinks})`) : fail('Nav links', `got ${navLinks}`);

  await page.screenshot({ path: path.join(OUT, 'ss-dashboard.png') });

  // ── Models ──
  console.log('\n🤖 Models');
  await page.click('.sidebar nav a:has-text("Models")');
  await page.waitForSelector('.filters', { timeout: 10000 });

  (await page.textContent('.page-header h2')).trim() === 'Models' ? pass('Page heading') : fail('Page heading', 'mismatch');
  await page.locator('.filters input').first().fill('deepseek');
  await page.waitForTimeout(500);
  const filtered = await page.locator('table tbody tr').count();
  filtered > 0 ? pass(`Search filter (${filtered} results)`) : fail('Search filter', 'no results');
  await page.locator('.filters input').first().fill('');
  await page.waitForTimeout(500);
  await page.selectOption('.filters select:nth-of-type(2)', 'working');
  await page.waitForTimeout(500);
  const working = await page.locator('table tbody tr').count();
  working > 0 ? pass(`Status filter (${working} working)`) : fail('Status filter', 'no results');
  await page.selectOption('.filters select:nth-of-type(2)', '');
  await page.waitForTimeout(500);

  // Test sort direction doesn't reset page
  await page.selectOption('.filters select:nth-of-type(4)', 'context');
  await page.waitForTimeout(300);
  await page.click('.sort-dir-btn');
  await page.waitForTimeout(300);
  const pageInfo = await page.textContent('.page-info');
  pageInfo.includes('Page 1') ? pass('Sort dir keeps page') : fail('Sort dir resets page', pageInfo);

  await page.screenshot({ path: path.join(OUT, 'ss-models.png') });

  // ── Rankings ──
  console.log('\n🏆 Rankings');
  await page.click('.sidebar nav a:has-text("Rankings")');
  await page.waitForSelector('.ranking-section', { timeout: 10000 });

  (await page.textContent('.page-header h2')).trim() === 'Rankings' ? pass('Page heading') : fail('Page heading', 'mismatch');
  const sections = await page.locator('.ranking-section').count();
  sections > 0 ? pass(`Ranking sections (${sections})`) : fail('Ranking sections', 'none');
  const top3 = await page.locator('.rank-num.top3').count();
  top3 > 0 ? pass(`Top-3 badges (${top3})`) : fail('Top-3 badges', 'none');

  await page.screenshot({ path: path.join(OUT, 'ss-rankings.png') });

  // ── Issues ──
  console.log('\n⚠️ Issues');
  await page.click('.sidebar nav a:has-text("Issues")');
  await page.waitForSelector('.issue-card, .empty-state', { timeout: 10000 });

  (await page.textContent('.page-header h2')).trim() === 'Known Issues' ? pass('Page heading') : fail('Page heading', 'mismatch');
  const issueCards = await page.locator('.issue-card').count();
  issueCards > 0 ? pass(`Issue cards (${issueCards})`) : fail('Issue cards', 'none');

  await page.screenshot({ path: path.join(OUT, 'ss-issues.png') });

  // ── Title updates per route ──
  console.log('\n📝 Route titles');
  await page.click('.sidebar nav a:has-text("Dashboard")');
  await page.waitForTimeout(300);
  (await page.title()).includes('Dashboard') ? pass('Dashboard title') : fail('Dashboard title', await page.title());

  await page.click('.sidebar nav a:has-text("Models")');
  await page.waitForTimeout(300);
  (await page.title()).includes('Models') ? pass('Models title') : fail('Models title', await page.title());

  await page.click('.sidebar nav a:has-text("Rankings")');
  await page.waitForTimeout(300);
  (await page.title()).includes('Rankings') ? pass('Rankings title') : fail('Rankings title', await page.title());

  await page.click('.sidebar nav a:has-text("Issues")');
  await page.waitForTimeout(300);
  (await page.title()).includes('Known Issues') ? pass('Issues title') : fail('Issues title', await page.title());

  // ── Summary ──
  await browser.close();
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📋 ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) results.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.name}: ${r.reason}`));
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
