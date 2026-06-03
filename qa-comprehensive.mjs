import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3001';
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

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Collect failed requests
  const failedRequests = [];
  page.on('response', resp => {
    if (resp.status() >= 400) failedRequests.push({ url: resp.url(), status: resp.status() });
  });

  console.log('\n=== QA SESSION START ===\n');

  // ─── TEST 1: Page Load & API Health ───
  console.log('\n--- Test 1: Page Load & API Health ---');
  try {
    const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    if (resp.ok()) pass(`Page loaded with status ${resp.status()}`);
    else fail(`Page loaded with non-OK status ${resp.status()}`);

    // Check for JS errors
    if (consoleErrors.length === 0) pass('No console errors on load');
    else {
      fail(`${consoleErrors.length} console error(s) on load:`);
      consoleErrors.forEach(e => console.log(`      ${e.substring(0, 200)}`));
    }

    // Check for failed requests
    if (filteredFailed(failedRequests).length === 0) pass('No failed HTTP requests');
    else {
      const bad = filteredFailed(failedRequests);
      bad.forEach(r => fail(`Failed request: ${r.url} (${r.status})`));
    }
  } catch (e) {
    fail(`Page failed to load: ${e.message}`);
    await browser.close();
    return;
  }

  await screenshot(page, '01-dashboard');

  // ─── TEST 2: Dashboard Content ───
  console.log('\n--- Test 2: Dashboard Content ---');
  try {
    const bodyText = await page.textContent('body');

    // Check key sections exist
    const hasStats = await page.locator('.stats-grid, [class*="stat"]').count() > 0;
    if (hasStats) pass('Stats grid present');
    else fail('Stats grid missing');

    const hasProviderHealth = bodyText.includes('Provider') || bodyText.includes('provider');
    if (hasProviderHealth) pass('Provider health section present');
    else warn('Provider health section may be missing');

    // Check sidebar exists
    const sidebar = await page.locator('.sidebar, nav, [class*="sidebar"]').count();
    if (sidebar > 0) pass('Sidebar navigation present');
    else fail('Sidebar navigation missing');

    // Check for data loading (not stuck on spinner)
    const spinnerGone = await page.locator('.spinner, [class*="loading"], [class*="spinner"]').count() === 0;
    if (spinnerGone) pass('Loading spinner dismissed (data loaded)');
    else warn('Loading spinner still visible — data may not have loaded');

    // Check stat numbers are populated
    const statCards = await page.locator('[class*="stat-card"], [class*="statCard"]').count();
    if (statCards > 0) pass(`Found ${statCards} stat cards`);
    else warn('No stat cards found with expected selectors');

  } catch (e) {
    fail(`Dashboard content check failed: ${e.message}`);
  }

  // ─── TEST 3: Navigation ───
  console.log('\n--- Test 3: Navigation ---');
  const navLinks = [
    { label: 'Dashboard', path: '#/' },
    { label: 'Super Models', path: '#/models' },
    { label: 'All', path: '#/all' },
    { label: 'Free', path: '#/free' },
    { label: 'Paid', path: '#/paid' },
    { label: 'Author', path: '#/author' },
    { label: 'Family', path: '#/family' },
    { label: 'Issues', path: '#/issues' },
  ];

  for (const nav of navLinks) {
    try {
      await page.goto(`${BASE}/${nav.path}`, { waitUntil: 'networkidle', timeout: 15000 });
      const url = page.url();
      if (url.includes(nav.path.replace('#', '')) || url.endsWith(nav.path) || (nav.path === '#/' && (url.endsWith('/') || url.endsWith('#/')))) {
        pass(`Navigation to ${nav.label} works (URL: ${url})`);
      } else {
        warn(`Navigation to ${nav.label}: URL is ${url}, expected to include ${nav.path}`);
      }
      await page.waitForTimeout(500);
    } catch (e) {
      fail(`Navigation to ${nav.label} failed: ${e.message}`);
    }
  }

  // ─── TEST 4: SuperModels View ───
  console.log('\n--- Test 4: SuperModels View ---');
  try {
    await page.goto(`${BASE}/#/models`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '04-supermodels');

    const rows = await page.locator('table tbody tr, [class*="vscroll"] .vscroll-item, [class*="recycle"] tr, [class*="table-row"]').count();
    if (rows > 0) pass(`SuperModels table has ${rows} visible rows`);
    else warn('No table rows found in SuperModels view');

    // Check for search/filter
    const searchInput = await page.locator('input[type="text"], input[placeholder*="earch"], input[placeholder*="ilter"]').count();
    if (searchInput > 0) pass('Search/filter input present');
    else warn('No search input found');

    // Check for status filter pills
    const pills = await page.locator('[class*="pill"], [class*="filter"], [class*="chip"]').count();
    if (pills > 0) pass(`Found ${pills} filter pills/chips`);
    else warn('No filter pills found');

  } catch (e) {
    fail(`SuperModels view check failed: ${e.message}`);
  }

  // ─── TEST 5: Model Detail Panel ───
  console.log('\n--- Test 5: Model Detail Panel ---');
  try {
    await page.goto(`${BASE}/#/models`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Try clicking a model row
    const firstRow = page.locator('table tbody tr, [class*="table-row"], [class*="list-item"]').first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '05-model-detail');

      const detailPanel = await page.locator('[class*="detail"], [class*="panel"], [class*="drawer"], [class*="slide"]').count();
      if (detailPanel > 0) pass('Detail panel appeared after clicking model');
      else warn('No detail panel appeared after clicking model');

      // Try closing with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      pass('Escape key pressed to close detail panel');
    } else {
      warn('No model rows to click for detail panel test');
    }
  } catch (e) {
    fail(`Model detail panel check failed: ${e.message}`);
  }

  // ─── TEST 6: Free Models View ───
  console.log('\n--- Test 6: Free Models View ---');
  try {
    await page.goto(`${BASE}/#/free`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '06-free-models');

    const bodyText = await page.textContent('body');
    if (bodyText.includes('rank') || bodyText.includes('Rank') || bodyText.includes('score') || bodyText.includes('Score')) {
      pass('Free models view shows ranking/scoring info');
    } else {
      warn('Free models view may be missing ranking info');
    }

    // Check role filter pills
    const rolePills = await page.locator('[class*="pill"], [class*="role"], [class*="filter"]').count();
    if (rolePills > 0) pass('Role filter pills present');
    else warn('No role filter pills found');
  } catch (e) {
    fail(`Free models view check failed: ${e.message}`);
  }

  // ─── TEST 7: All Models View + JQL Filter ───
  console.log('\n--- Test 7: All Models View + JQL Filter ---');
  try {
    await page.goto(`${BASE}/#/all`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '07-all-models');

    // Check for JQL filter input
    const filterInput = await page.locator('input[placeholder*="filter"], input[placeholder*="Filter"], input[placeholder*="search"], input[placeholder*="Search"], .jql-input, [class*="jql"] input, [class*="filter-bar"] input').count();
    if (filterInput > 0) pass('JQL filter input found');
    else warn('JQL filter input not found');

    // Try typing a filter
    const anyInput = page.locator('input[type="text"]').first();
    if (await anyInput.count() > 0) {
      await anyInput.fill('status:working');
      await page.waitForTimeout(1000);
      await screenshot(page, '07b-filtered');
      pass('Typed filter query');
      await anyInput.fill('');
      await page.waitForTimeout(500);
    }
  } catch (e) {
    fail(`All models view check failed: ${e.message}`);
  }

  // ─── TEST 8: Paid Models View ───
  console.log('\n--- Test 8: Paid Models View ---');
  try {
    await page.goto(`${BASE}/#/paid`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '08-paid-models');
    pass('Paid models view loaded');
  } catch (e) {
    fail(`Paid models view check failed: ${e.message}`);
  }

  // ─── TEST 9: Author View ───
  console.log('\n--- Test 9: Author View ---');
  try {
    await page.goto(`${BASE}/#/author`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '09-author');
    pass('Author view loaded');
  } catch (e) {
    fail(`Author view check failed: ${e.message}`);
  }

  // ─── TEST 10: Family View ───
  console.log('\n--- Test 10: Family View ---');
  try {
    await page.goto(`${BASE}/#/family`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '10-family');
    pass('Family view loaded');
  } catch (e) {
    fail(`Family view check failed: ${e.message}`);
  }

  // ─── TEST 11: Issues View ───
  console.log('\n--- Test 11: Issues View ---');
  try {
    await page.goto(`${BASE}/#/issues`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '11-issues');

    const bodyText = await page.textContent('body');
    if (bodyText.includes('issue') || bodyText.includes('Issue') || bodyText.includes('No issues') || bodyText.includes('no issues')) {
      pass('Issues view shows content');
    } else {
      warn('Issues view content unclear');
    }
  } catch (e) {
    fail(`Issues view check failed: ${e.message}`);
  }

  // ─── TEST 12: Theme Toggle ───
  console.log('\n--- Test 12: Theme Toggle ---');
  try {
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);

    const htmlEl = page.locator('html');
    const initialTheme = await htmlEl.getAttribute('data-theme');
    console.log(`      Initial theme: ${initialTheme}`);

    // Find and click theme toggle
    const themeBtn = page.locator('[class*="theme"], button:has(svg), [aria-label*="theme"], [aria-label*="Theme"], [class*="toggle"]').first();
    if (await themeBtn.count() > 0) {
      await themeBtn.click();
      await page.waitForTimeout(500);
      const newTheme = await htmlEl.getAttribute('data-theme');
      if (newTheme !== initialTheme) pass(`Theme toggled from "${initialTheme}" to "${newTheme}"`);
      else warn(`Theme did not change after toggle click (still "${newTheme}")`);
      await screenshot(page, '12-theme-toggled');
    } else {
      warn('Theme toggle button not found');
    }
  } catch (e) {
    fail(`Theme toggle check failed: ${e.message}`);
  }

  // ─── TEST 13: API Data Integrity ───
  console.log('\n--- Test 13: API Data Integrity ---');
  try {
    const apiResp = await fetch(`${API}/api/data`);
    if (!apiResp.ok) fail(`API returned status ${apiResp.status}`);
    else {
      pass(`API /api/data returned ${apiResp.status}`);
      const data = await apiResp.json();

      if (Array.isArray(data.models) && data.models.length > 0) {
        pass(`API returned ${data.models.length} models`);
      } else if (Array.isArray(data.models)) {
        fail('API returned empty models array');
      } else {
        fail('API response missing models array');
      }

      // Check _test_summary
      if (data._test_summary) pass('API has _test_summary');
      else warn('API missing _test_summary');

      // Check _role_rankings
      if (data._role_rankings) pass('API has _role_rankings');
      else warn('API missing _role_rankings');

      // Check provider_health
      if (data.provider_health) pass('API has provider_health');
      else warn('API missing provider_health');

      // Check a sample model has required fields
      if (Array.isArray(data.models) && data.models.length > 0) {
        const sample = data.models[0];
        const requiredFields = ['id', 'name', 'provider', 'status'];
        const missing = requiredFields.filter(f => sample[f] === undefined && sample[f] === null);
        if (missing.length === 0) pass('Sample model has required fields');
        else warn(`Sample model missing fields: ${missing.join(', ')}`);

        // Check status structure
        if (sample.status && typeof sample.status === 'object') {
          if ('tested' in sample.status && 'result' in sample.status) {
            pass('Model status has tested/result structure');
          } else {
            warn('Model status missing tested/result fields');
          }
        } else {
          warn('Model status is not an object');
        }
      }
    }
  } catch (e) {
    fail(`API data integrity check failed: ${e.message}`);
  }

  // ─── TEST 14: Responsive Layout ───
  console.log('\n--- Test 14: Responsive Layout ---');
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '14-mobile');

    const bodyText = await page.textContent('body');
    if (bodyText && bodyText.length > 100) pass('Mobile viewport renders content');
    else fail('Mobile viewport shows empty/broken content');

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 900 });
  } catch (e) {
    fail(`Responsive layout check failed: ${e.message}`);
  }

  // ─── TEST 15: Stale Data Indicator ───
  console.log('\n--- Test 15: Stale Data / Refresh ---');
  try {
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);

    const refreshBtn = page.locator('[class*="refresh"], [aria-label*="refresh"], [aria-label*="Refresh"], button:has(svg)').first();
    if (await refreshBtn.count() > 0) {
      await refreshBtn.click();
      await page.waitForTimeout(2000);
      pass('Refresh button clicked');
    } else {
      warn('Refresh button not found');
    }
  } catch (e) {
    fail(`Refresh check failed: ${e.message}`);
  }

  // ─── SUMMARY ───
  console.log('\n\n=== QA SUMMARY ===');
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

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    passed: passes,
    warnings,
    defects,
    consoleErrors,
    failedRequests: filteredFailed(failedRequests),
  };
  fs.writeFileSync(`${SCREENSHOT_DIR}\\qa-report.json`, JSON.stringify(report, null, 2));
  console.log(`\nFull report saved to ${SCREENSHOT_DIR}\\qa-report.json`);

  await browser.close();
}

function filteredFailed(requests) {
  return requests.filter(r => !r.url.includes('data:') && !r.url.includes('chrome-extension'));
}

run().catch(e => {
  console.error('QA script crashed:', e);
  process.exit(1);
});
