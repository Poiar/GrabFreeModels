import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:5173';
const SCREENSHOT_DIR = 'C:\\Users\\pc\\AppData\\Local\\Temp\\opencode';

const defects = [];
const warnings = [];
const passes = [];

function pass(msg) { passes.push(msg); console.log(`  ✅ ${msg}`); }
function warn(msg) { warnings.push(msg); console.log(`  ⚠️  ${msg}`); }
function fail(msg) { defects.push(msg); console.log(`  ❌ ${msg}`); }

async function screenshot(page, name) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}\\qa-${name}.png`, fullPage: false });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  console.log('\n=== QA INTERACTION TESTS ===\n');

  // Load dashboard first
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // ─── TEST 1: SuperModels - click row to navigate ───
  console.log('\n--- Test 1: SuperModels row click navigation ---');
  await page.goto(`${BASE}/#/models`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const vscrollRow = page.locator('.vscroll-row').first();
  if (await vscrollRow.count() > 0) {
    const modelName = await vscrollRow.textContent();
    await vscrollRow.click();
    await page.waitForTimeout(1000);
    const url = page.url();
    if (url.includes('/super/')) {
      pass(`SuperModels row navigated to detail: ${url}`);
      // Check the detail page loaded
      const h2 = await page.locator('h2').first().textContent();
      if (h2 && h2.length > 0) pass(`Detail page shows model name: "${h2.substring(0, 50)}"`);
      else fail('Detail page missing model name heading');

      // Check provider comparison table exists
      const provTable = await page.locator('table').count();
      if (provTable > 0) pass('Provider comparison table present');
      else fail('Provider comparison table missing');

      // Test expanding a provider row
      const provRow = page.locator('tbody tr').first();
      if (await provRow.count() > 0) {
        await provRow.click();
        await page.waitForTimeout(500);
        const expanded = await page.locator('.detail-row').count();
        if (expanded > 0) pass('Provider row expands to show details');
        else warn('Provider row did not expand on click');

        // Expand another row - first should collapse
        const provRow2 = page.locator('tbody tr').nth(1);
        if (await provRow2.count() > 0) {
          await provRow2.click();
          await page.waitForTimeout(500);
          const expanded2 = await page.locator('.detail-row').count();
          if (expanded2 >= 1) pass('Second provider row expand works');
        }
      }
    } else {
      fail(`Clicking SuperModels row did not navigate to /super/ URL: ${url}`);
    }
  } else {
    fail('No .vscroll-row found in SuperModels view');
  }

  // ─── TEST 2: All Models - click row for detail panel ───
  console.log('\n--- Test 2: All Models detail panel ---');
  await page.goto(`${BASE}/#/all`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const allRow = page.locator('.vscroll-row').first();
  if (await allRow.count() > 0) {
    await allRow.click();
    await page.waitForTimeout(1000);
    const detailPanel = await page.locator('.detail-panel').count();
    if (detailPanel > 0) pass('Detail panel opened on model click');
    else fail('Detail panel did not open on model click');

    // Close with X button
    const closeBtn = page.locator('.detail-close').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      const panelGone = await page.locator('.detail-panel').count() === 0;
      if (panelGone) pass('Detail panel closed via X button');
      else fail('Detail panel still visible after clicking X');
    }

    // Open again and close with Escape
    await allRow.click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const panelGone2 = await page.locator('.detail-panel').count() === 0;
    if (panelGone2) pass('Detail panel closed via Escape key');
    else fail('Detail panel still visible after Escape');

    // Open and close with backdrop click
    await allRow.click();
    await page.waitForTimeout(500);
    await page.locator('.detail-overlay').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);
    const panelGone3 = await page.locator('.detail-panel').count() === 0;
    if (panelGone3) pass('Detail panel closed via backdrop click');
    else fail('Detail panel still visible after backdrop click');
  } else {
    fail('No .vscroll-row found in All Models view');
  }

  // ─── TEST 3: Free Models - role switching ───
  console.log('\n--- Test 3: Free Models role pills ---');
  await page.goto(`${BASE}/#/free`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const rolePills = await page.locator('.status-btn').count();
  if (rolePills >= 5) pass(`Found ${rolePills} role filter pills`);
  else warn(`Expected 5 role pills, found ${rolePills}`);

  // Click "Build" role
  const buildPill = page.locator('.status-btn[data-role="build"]');
  if (await buildPill.count() > 0) {
    await buildPill.click();
    await page.waitForTimeout(500);
    const activePill = await page.locator('.status-btn.active').textContent();
    if (activePill?.includes('Build')) pass('Role switched to Build');
    else warn('Role pill click did not change active role');
  }

  // Check role info panel appears
  const roleInfo = await page.locator('.role-info-panel').count();
  if (roleInfo > 0) pass('Role info panel visible');
  else warn('Role info panel not visible');

  // ─── TEST 4: JQL filter functionality ───
  console.log('\n--- Test 4: JQL Filter ---');
  await page.goto(`${BASE}/#/all`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // Find the JQL input (it's inside .jql-bar or .query-builder)
  // Check if there's a visible input
  const jqlBar = page.locator('.jql-bar');
  if (await jqlBar.count() > 0) {
    pass('JQL bar present');

    // Check for filter chips area
    const chips = await page.locator('.jql-chips').count();
    if (chips > 0) pass('JQL chips area present');
  }

  // Check QueryBuilder component
  const qb = page.locator('.query-builder, [class*="query-builder"], [class*="QueryBuilder"]').count();
  if (await qb > 0) pass('Query Builder component present');
  else warn('Query Builder component not found');

  // Test the filter via URL
  await page.goto(`${BASE}/#/all?q=status:working`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const filterCount = await page.locator('.filter-count, .result-count').first().textContent();
  if (filterCount) {
    pass(`URL filter applied, count shows: "${filterCount.trim()}"`);
    // Should show fewer than total
    if (filterCount.includes('of') && !filterCount.includes('1239 of 1239')) {
      pass('Filter actually reduced results');
    }
  }

  // ─── TEST 5: Author view - click to expand detail ───
  console.log('\n--- Test 5: Author detail panel ---');
  await page.goto(`${BASE}/#/author`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const authorRow = page.locator('.vscroll-row').first();
  if (await authorRow.count() > 0) {
    await authorRow.click();
    await page.waitForTimeout(1000);
    const overlay = await page.locator('.family-detail-overlay').count(); // reuses family-detail class
    if (overlay > 0) pass('Author detail overlay appeared');
    else fail('Author detail overlay did not appear on click');

    // Close it
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // ─── TEST 6: Family view - click to expand detail ───
  console.log('\n--- Test 6: Family detail panel ---');
  await page.goto(`${BASE}/#/family`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const familyRow = page.locator('.vscroll-row').first();
  if (await familyRow.count() > 0) {
    await familyRow.click();
    await page.waitForTimeout(1000);
    const overlay = await page.locator('.family-detail-overlay').count();
    if (overlay > 0) pass('Family detail overlay appeared');
    else fail('Family detail overlay did not appear on click');

    // Close with backdrop click
    await page.mouse.click(50, 300);
    await page.waitForTimeout(500);
  }

  // ─── TEST 7: Navigation active state ───
  console.log('\n--- Test 7: Navigation active states ---');
  await page.goto(`${BASE}/#/models`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(500);

  const activeNav = await page.locator('.sidebar nav a.active').count();
  if (activeNav >= 1) pass(`Found ${activeNav} active nav link(s)`);
  else fail('No active nav link found');

  // Navigate to SuperModel detail - Super nav should still be active
  const firstVRow = page.locator('.vscroll-row').first();
  if (await firstVRow.count() > 0) {
    await firstVRow.click();
    await page.waitForTimeout(500);
    const superActive = await page.locator('.sidebar nav a.active').getAttribute('href');
    if (superActive?.includes('/models')) pass('Super nav stays active on detail page');
    else warn('Super nav may not stay active on detail page');
  }

  // ─── TEST 8: Issues view content ───
  console.log('\n--- Test 8: Issues view ---');
  await page.goto(`${BASE}/#/issues`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const issueCards = await page.locator('.issue-card').count();
  const severityBar = await page.locator('.severity-bar').count();
  const noIssues = await page.locator('text=No known issues').count();

  if (issueCards > 0) {
    pass(`Found ${issueCards} issue cards`);
    if (severityBar > 0) pass('Severity filter bar present');
    else warn('Severity filter bar missing');

    // Test severity filter click
    const sevPill = page.locator('.severity-pill').first();
    if (await sevPill.count() > 0) {
      await sevPill.click();
      await page.waitForTimeout(500);
      const activePill = await page.locator('.severity-pill.active').count();
      if (activePill > 0) pass('Severity filter pill toggles active state');
    }
  } else if (noIssues > 0) {
    pass('Shows "No known issues" message when empty');
  } else {
    warn('Issues view: no cards and no empty state message detected');
  }

  // Check sort bar only shows when there are issues
  const sortBar = await page.locator('.issues-sort-bar').count();
  if (issueCards > 0 && sortBar > 0) pass('Issues sort bar visible with issues');
  else if (issueCards === 0 && sortBar === 0) pass('Issues sort bar hidden when no issues');
  else if (issueCards > 0 && sortBar === 0) warn('Issues sort bar should be visible when there are issues');
  // Bug: sort bar is always visible regardless of issue count

  // ─── TEST 9: Dashboard stats accuracy ───
  console.log('\n--- Test 9: Dashboard stats ---');
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // Check that "Removed" stat only shows when there are removed models
  const removedCard = await page.locator('text=Removed').count();
  const removedValue = await page.locator('.stat-value.orange').textContent();

  // Check provider health cards exist
  const provCards = await page.locator('.provider-card').count();
  if (provCards > 0) pass(`Found ${provCards} provider health cards`);
  else fail('No provider health cards found');

  // ─── TEST 10: CSV/JSON export buttons ───
  console.log('\n--- Test 10: Export buttons ---');
  await page.goto(`${BASE}/#/all`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const exportBtns = await page.locator('.export-btn').count();
  if (exportBtns >= 2) pass(`Found ${exportBtns} export buttons (CSV + JSON)`);
  else warn(`Expected 2 export buttons, found ${exportBtns}`);

  // ─── SUMMARY ───
  console.log('\n\n=== QA INTERACTION SUMMARY ===');
  console.log(`  Passed:   ${passes.length}`);
  console.log(`  Warnings: ${warnings.length}`);
  console.log(`  Defects:  ${defects.length}`);

  if (defects.length > 0) {
    console.log('\n--- DEFECTS ---');
    defects.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
  }
  if (warnings.length > 0) {
    console.log('\n--- WARNINGS ---');
    warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  }

  const report = {
    timestamp: new Date().toISOString(),
    passed: passes,
    warnings,
    defects,
    consoleErrors,
  };
  fs.writeFileSync(`${SCREENSHOT_DIR}\\qa-interactions-report.json`, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to ${SCREENSHOT_DIR}\\qa-interactions-report.json`);

  await browser.close();
}

run().catch(e => { console.error('QA script crashed:', e); process.exit(1); });
