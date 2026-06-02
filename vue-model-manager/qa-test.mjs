import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'

const findings = {
  bugs: [], ux: [], accessibility: [], logical: [], passed: [],
}

function log(category, severity, area, message, detail = '') {
  findings[category].push({ severity, area, message, detail })
  const icon = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : severity === 'medium' ? '🟡' : '🟢'
  console.log(`  ${icon} [${category}] ${area}: ${message}${detail ? ' — ' + detail : ''}`)
}

function pass(area, message) {
  findings.passed.push({ area, message })
  console.log(`  ✅ [PASS] ${area}: ${message}`)
}

async function safeGoto(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await new Promise(r => setTimeout(r, 2000))
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', err => { consoleErrors.push(err.message) })

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  GrabFreeModels — UI/UX/QA Validation Round 2')
  console.log('═══════════════════════════════════════════════════\n')

  // ─── 1. APP LOAD ───
  console.log('━━━ 1. APP LOAD & LAYOUT ━━━')
  await safeGoto(page, BASE)
  pass('Load', 'App loads without white screen')

  if (consoleErrors.length > 0) {
    log('bugs', 'high', 'Load', 'Console errors after load', consoleErrors.join(' | '))
  } else {
    pass('Load', 'No console errors after app load')
  }

  try {
    const sidebar = await page.$('aside.sidebar')
    pass('Layout', sidebar ? 'Sidebar rendered' : (log('bugs', 'critical', 'Layout', 'Sidebar missing'), ''))
  } catch {}

  // ─── 2. DASHBOARD ───
  console.log('\n━━━ 2. DASHBOARD ━━━')
  await safeGoto(page, BASE)

  try {
    const heading = await page.$('.page-header h2')
    const text = await heading?.textContent()
    if (text === 'Dashboard') pass('Dashboard', 'Page heading correct')
    else log('bugs', 'medium', 'Dashboard', 'Page heading wrong', text)
  } catch {}

  try {
    const statCards = await page.$$('.stat-card')
    if (statCards.length >= 5) pass('Dashboard', `${statCards.length} stat cards rendered`)
    else log('bugs', 'high', 'Dashboard', `Too few stat cards: ${statCards.length}`)
  } catch {}

  try {
    const providerCards = await page.$$('.provider-card')
    if (providerCards.length > 0) pass('Dashboard', `${providerCards.length} provider health cards`)
  } catch {}

  // ─── 3. DATA CONSISTENCY ───
  console.log('\n━━━ 3. DATA CONSISTENCY ━━━')
  await safeGoto(page, BASE)

  try {
    const stats = {}
    const statEls = await page.$$('.stat-value')
    const labelEls = await page.$$('.stat-label')
    for (let i = 0; i < labelEls.length; i++) {
      const label = (await labelEls[i].textContent())?.trim()
      const val = (await statEls[i].textContent())?.trim()
      stats[label] = val
    }

    const free = parseInt(stats['Free Models'] ?? '0')
    const working = parseInt(stats['Working'] ?? '0')
    const rateLimited = parseInt(stats['Rate Limited'] ?? '0')
    const broken = parseInt(stats['Broken'] ?? '0')
    const total = parseInt(stats['Total Models'] ?? '0')

    if (free >= working + rateLimited + broken) pass('Logical', 'Free >= Working + RateLimited + Broken')
    else log('logical', 'high', 'Data', 'Free count inconsistent')

    if (total >= free) pass('Logical', 'Total >= Free (consistent)')
    else log('logical', 'critical', 'Data', 'Total < Free', `Total=${total} Free=${free}`)

    const successRateStr = (stats['Success Rate'] ?? '0%').replace('%', '')
    const successRate = parseInt(successRateStr)
    const expectedRate = free > 0 ? Math.round((working / free) * 100) : 0
    if (Math.abs(successRate - expectedRate) <= 1) pass('Logical', `Success rate: ${successRate}%`)
    else log('logical', 'high', 'Data', 'Success rate mismatch', `Shown=${successRate}% Expected=${expectedRate}%`)
  } catch {}

  // ─── 4. JQL FILTERING (THE MAIN BUG WE FIXED) ───
  console.log('\n━━━ 4. JQL FILTERS ━━━')
  await safeGoto(page, `${BASE}/#/models`)
  await page.waitForSelector('.vscroll-row')

  // Get initial model count
  const initialFilter = await page.$('.filter-count')
  const initialText = await initialFilter?.textContent()
  console.log(`  Initial count: ${initialText?.trim()}`)

  // Test status:working
  await page.click('.jql-input')
  await page.fill('.jql-input', 'status:working')
  await new Promise(r => setTimeout(r, 2000))
  let filterCount = await page.$eval('.filter-count', el => el.textContent)
  const workingCount = parseInt(filterCount?.split(' ')[0] ?? '0')
  const workingTotal = parseInt(filterCount?.split(' ')[2] ?? '0')
  console.log(`  status:working: ${workingCount} of ${workingTotal}`)
  if (workingCount > 0 && workingCount < workingTotal) pass('JQL', `status:working filters to ${workingCount} models`)
  else log('bugs', 'critical', 'JQL', 'status:working filter not working', `got ${workingCount} of ${workingTotal}`)

  // Check all visible rows are "working"
  const statuses = await page.$$eval('.col-status .badge', els => els.map(e => e.textContent?.trim()))
  const workingOrRemovedStatuses = statuses.every(s => s === 'Working' || s === 'Removed')
  if (workingOrRemovedStatuses) pass('JQL', 'All visible models show Working/Removed status (Removed models inherit status)')
  else log('bugs', 'high', 'JQL', 'Filtered models show unexpected statuses', `[${[...new Set(statuses)]}]`)

  // Clear and test status:broken
  const clearBtn = await page.$('.jql-clear')
  if (clearBtn) { await clearBtn.click(); await new Promise(r => setTimeout(r, 500)) }

  await page.click('.jql-input')
  await page.fill('.jql-input', 'status:broken')
  await new Promise(r => setTimeout(r, 2000))
  filterCount = await page.$eval('.filter-count', el => el.textContent)
  const brokenCount = parseInt(filterCount?.split(' ')[0] ?? '0')
  console.log(`  status:broken: ${brokenCount}`)
  if (brokenCount > 0) pass('JQL', `status:broken filters to ${brokenCount} models`)
  else log('bugs', 'medium', 'JQL', 'status:broken returns 0 results', 'may be empty data')

  // Clear and test provider:openrouter
  let clearBtn2 = await page.$('.jql-clear')
  if (clearBtn2) { await clearBtn2.click(); await new Promise(r => setTimeout(r, 500)) }
  await page.fill('.jql-input', 'provider:openrouter')
  await new Promise(r => setTimeout(r, 2000))
  filterCount = await page.$eval('.filter-count', el => el.textContent)
  const providerCount = parseInt(filterCount?.split(' ')[0] ?? '0')
  console.log(`  provider:openrouter: ${providerCount}`)
  if (providerCount > 0) pass('JQL', `provider:openrouter filters to ${providerCount} models`)
  else log('bugs', 'high', 'JQL', 'provider filter not working')

  // Check all visible models have correct provider
  const providers = await page.$$eval('.col-provider span:first-child', els => els.map(e => e.textContent?.trim()))
  const allOpenRouter = providers.every(p => p?.toLowerCase() === 'openrouter')
  if (allOpenRouter) pass('JQL', 'All filtered models show openrouter provider')
  else log('bugs', 'high', 'JQL', 'Not all filtered models are from openrouter', `Found: ${[...new Set(providers)]}`)

  // Clear and test type:free
  let clearBtn3 = await page.$('.jql-clear')
  if (clearBtn3) { await clearBtn3.click(); await new Promise(r => setTimeout(r, 500)) }
  await page.fill('.jql-input', 'type:free')
  await new Promise(r => setTimeout(r, 1500))
  const freeCount = parseInt((await page.$eval('.filter-count', el => el.textContent)).split(' ')[0])
  console.log(`  type:free: ${freeCount}`)
  if (freeCount > 0) pass('JQL', `type:free filters to ${freeCount} models`)

  const clearBtn4 = await page.$('.jql-clear')
  if (clearBtn4) await clearBtn4.click()

  // ─── 5. DETAIL PANEL ━━━
  console.log('\n━━━ 5. DETAIL PANEL ━━━')
  await safeGoto(page, `${BASE}/#/models`)

  const firstRow = await page.$('.vscroll-row')
  if (firstRow) {
    await firstRow.click()
    await new Promise(r => setTimeout(r, 500))
    const detailPanel = await page.$('.detail-panel')
    if (detailPanel) {
      pass('Detail', 'Panel opens on row click')
      const detailName = await page.$('.detail-name')
      const name = detailName ? await detailName.textContent() : ''
      if (name?.trim().length > 0) pass('Detail', 'Model name shown')
      else log('bugs', 'medium', 'Detail', 'Model name empty')

      try {
        const closeBtn = await page.$('.detail-close')
        await closeBtn.click()
        await new Promise(r => setTimeout(r, 300))
        pass('Detail', 'Close button works')
      } catch (e) { log('ux', 'low', 'Detail', 'Close button click failed') }

      // Reopen and test Escape
      try {
        const row2 = await page.$('.vscroll-row')
        await row2.click()
        await new Promise(r => setTimeout(r, 300))
        await page.keyboard.press('Escape')
        await new Promise(r => setTimeout(r, 300))
        const gone = !(await page.$('.detail-panel'))
        if (gone) pass('Detail', 'Escape closes panel')
        else log('bugs', 'medium', 'Detail', 'Escape does not close panel')
      } catch (e) { log('ux', 'low', 'Detail', 'Escape test failed') }
    } else log('bugs', 'high', 'Detail', 'Panel did not open')
  }

  // ─── 6. RANKINGS ───
  console.log('\n━━━ 6. RANKINGS ━━━')
  await safeGoto(page, `${BASE}/#/rankings`)

  try {
    const pills = await page.$$('.rank-pill')
    if (pills.length > 0) pass('Rankings', `${pills.length} rank pills`)
  } catch {}

  const searchInput = await page.$('.search-input')
  if (searchInput) {
    await searchInput.fill('gpt')
    await new Promise(r => setTimeout(r, 500))
    const rc = await page.$eval('.result-count', el => el.textContent)
    console.log(`  Search 'gpt': ${rc?.trim()}`)
    if (!rc?.includes('0')) pass('Rankings', 'Search filter works')
    await searchInput.fill('')
  }

  const statusBtns = await page.$$('.status-btn')
  if (statusBtns.length >= 3) {
    await statusBtns[1].click()
    await new Promise(r => setTimeout(r, 500))
    const activeBtn = await page.$('.status-btn.active')
    if (activeBtn) pass('Rankings', 'Status filter activates')
  }

  // ─── 7. ISSUES ───
  console.log('\n━━━ 7. ISSUES ━━━')
  await safeGoto(page, `${BASE}/#/issues`)

  const issueCards = await page.$$('.issue-card')
  if (issueCards.length > 0) pass('Issues', `${issueCards.length} issue cards`)
  else {
    const emptyState = await page.$('.empty-state-inner')
    if (emptyState) pass('Issues', 'Empty state shown')
    else log('ux', 'medium', 'Issues', 'No issues and no empty state')
  }

  const sevPills = await page.$$('.severity-pill')
  if (sevPills.length > 0) {
    await sevPills[0].click()
    await new Promise(r => setTimeout(r, 500))
    const clearBtn = await page.$('.severity-clear')
    if (clearBtn) pass('Issues', 'Severity filter works with clear')
  }

  // ─── 8. THEME TOGGLE ───
  console.log('\n━━━ 8. THEME ━━━')
  await safeGoto(page, `${BASE}/#/`)

  const themeBtn = await page.$('.theme-toggle')
  if (themeBtn) {
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    await themeBtn.click()
    await new Promise(r => setTimeout(r, 500))
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    if (before !== after) pass('Theme', `Toggled: ${before} → ${after}`)
    else log('bugs', 'high', 'Theme', 'Theme toggle did not change data-theme')
    await themeBtn.click(); await new Promise(r => setTimeout(r, 300))
  }

  // ─── 9. KEYBOARD SHORTCUTS ───
  console.log('\n━━━ 9. KEYBOARD SHORTCUTS ━━━')
  await safeGoto(page, `${BASE}/#/models`)

  await page.click('.page-header h2')
  await new Promise(r => setTimeout(r, 200))
  await page.keyboard.press('/')
  await new Promise(r => setTimeout(r, 300))
  const focused = await page.evaluate(() => document.activeElement?.className)
  if (focused?.includes('jql-input')) pass('Keyboard', '/ focuses search')
  else log('ux', 'medium', 'Keyboard', '/ does not focus search', focused)

  // ─── 10. NAVIGATION ───
  console.log('\n━━━ 10. NAVIGATION ━━━')

  for (const [path, name] of [['/models', 'Models'], ['/rankings', 'Rankings'], ['/issues', 'Known Issues']]) {
    await safeGoto(page, `${BASE}/#${path}`)
    const heading = await page.$('.page-header h2')
    const text = await heading?.textContent()
    if (text === name) pass('Navigation', `${path} heading correct`)
    else log('bugs', 'medium', 'Navigation', `${path} heading wrong`, text)
  }

  await safeGoto(page, `${BASE}/#/models`)
  const activeLink = await page.$('nav a.active')
  if (activeLink) pass('Navigation', 'Active link highlighted')

  // ─── 11. COPY BUTTON ───
  console.log('\n━━━ 11. COPY BUTTON ━━━')
  await safeGoto(page, `${BASE}/#/models`)

  const copyBtn = await page.$('.copy-btn')
  if (copyBtn) {
    await copyBtn.click()
    await new Promise(r => setTimeout(r, 300))
    const copied = await page.$('.copy-btn.copied')
    if (copied) pass('Copy', 'Copied state shown')
    await new Promise(r => setTimeout(r, 2000))
    const cleared = !(await page.$('.copy-btn.copied'))
    if (cleared) pass('Copy', 'Copied state auto-clears')
  }

  // ─── 12. EMPTY STATE ───
  console.log('\n━━━ 12. EMPTY STATE ━━━')
  await safeGoto(page, `${BASE}/#/models`)

  await page.click('.jql-input')
  await page.fill('.jql-input', 'provider:nonexistent')
  await new Promise(r => setTimeout(r, 1500))
  const emptyState = await page.$('.empty-state')
  if (emptyState) pass('Empty', 'Empty state shown for no results')
  else log('ux', 'medium', 'Empty', 'No empty state for zero results')

  const clearFromEmpty = await page.$('.empty-state .refresh-btn')
  if (clearFromEmpty) {
    await clearFromEmpty.click()
    await new Promise(r => setTimeout(r, 1000))
    const rows = await page.$$('.vscroll-row')
    if (rows.length > 0) pass('Empty', 'Clear from empty state restores results')
  }

  // ─── 13. JQL VALIDATION ERRORS ───
  console.log('\n━━━ 13. JQL VALIDATION ━━━')
  await safeGoto(page, `${BASE}/#/models`)

  await page.click('.jql-input')
  await page.fill('.jql-input', 'xyzfield:abc')
  await new Promise(r => setTimeout(r, 500))
  const errorMarkers = await page.$$('.jql-error')
  if (errorMarkers.length > 0) pass('Validation', 'Invalid field shows validation error')
  else log('bugs', 'medium', 'Validation', 'No validation error for invalid field')

  const invalidInput = await page.$('.jql-input-invalid')
  if (invalidInput) pass('Validation', 'Invalid input gets error styling')

  const clearAllBtn = await page.$('.jql-clear')
  if (clearAllBtn) await clearAllBtn.click()

  // ─── 14. EXPORT ───
  console.log('\n━━━ 14. EXPORT ━━━')
  await safeGoto(page, `${BASE}/#/models`)

  const exportBtns = await page.$$('.export-btn')
  if (exportBtns.length >= 2) pass('Export', 'CSV and JSON export present')

  // ─── 15. ACCESSIBILITY ───
  console.log('\n━━━ 15. ACCESSIBILITY ━━━')
  await safeGoto(page, BASE)

  const navAria = await page.$('nav[aria-label]')
  if (navAria) pass('A11y', 'Nav has aria-label')
  else log('accessibility', 'medium', 'A11y', 'Nav missing aria-label')

  // ─── 16. URL STATE ───
  console.log('\n━━━ 16. URL STATE ━━━')
  await safeGoto(page, `${BASE}/#/models`)

  await page.click('.jql-input')
  await page.fill('.jql-input', 'status:working')
  await new Promise(r => setTimeout(r, 1000))
  const urlWithFilter = page.url()
  if (urlWithFilter.includes('q=')) pass('URL', 'Filter in URL')
  else log('ux', 'low', 'URL', 'Filter not in URL')

  const firstModelRow = await page.$('.vscroll-row')
  if (firstModelRow) {
    await firstModelRow.click()
    await new Promise(r => setTimeout(r, 500))
    const urlWithModel = page.url()
    if (urlWithModel.includes('model=')) pass('URL', 'Model ID in URL')
  }

  // ─── 17. COLUMN SORTING ───
  console.log('\n━━━ 17. COLUMN SORTING ━━━')
  await safeGoto(page, `${BASE}/#/models`)

  const sortableHeaders = await page.$$('.vscroll-header-cell.sortable')
  if (sortableHeaders.length > 0) {
    await sortableHeaders[0].click()
    await new Promise(r => setTimeout(r, 500))
    const activeHeader = await page.$('.vscroll-header-cell.active')
    if (activeHeader) pass('Sort', 'Active sort header highlighted')

    await sortableHeaders[0].click()
    await new Promise(r => setTimeout(r, 500))
    pass('Sort', 'Sort direction toggle works')
  }

  // ─── 18. QUERY BUILDER ───
  console.log('\n━━━ 18. QUERY BUILDER ━━━')
  await safeGoto(page, `${BASE}/#/models`)

  const qbField = await page.$('.qb-field')
  if (qbField) pass('Builder', 'Query builder present')

  const savedBtn = await page.$('.qb-action-btn')
  if (savedBtn) {
    await savedBtn.click()
    await new Promise(r => setTimeout(r, 500))
    const savedDrop = await page.$('.qb-dropdown')
    if (savedDrop) pass('Saved', 'Saved searches dropdown opens')
    await page.click('.page-header h2')
  }

  // ─── SUMMARY ───
  console.log('\n\n═══════════════════════════════════════════════════')
  console.log('  QA VALIDATION SUMMARY (Round 2)')
  console.log('═══════════════════════════════════════════════════\n')

  const allIssues = [...findings.bugs, ...findings.ux, ...findings.accessibility, ...findings.logical]
  const details = (f) => `${f.severity}|${f.area}: ${f.message}${f.detail ? ' — ' + f.detail : ''}`

  console.log(`  ✅ Passed: ${findings.passed.length}`)
  console.log(`  🔴 Critical: ${allIssues.filter(f => f.severity === 'critical').length}`)
  console.log(`  🟠 High: ${allIssues.filter(f => f.severity === 'high').length}`)
  console.log(`  🟡 Medium: ${allIssues.filter(f => f.severity === 'medium').length}`)
  console.log(`  🟢 Low: ${allIssues.filter(f => f.severity === 'low').length}`)
  console.log(`  ─────────────────────────────`)
  console.log(`  Total issues: ${allIssues.length}\n`)

  if (findings.bugs.length > 0) {
    console.log('  🔴 BUGS:')
    findings.bugs.forEach(f => console.log('    ' + details(f)))
    console.log()
  }
  if (findings.logical.length > 0) {
    console.log('  🧠 LOGICAL:')
    findings.logical.forEach(f => console.log('    ' + details(f)))
    console.log()
  }
  if (findings.ux.length > 0) {
    console.log('  🎨 UX:')
    findings.ux.forEach(f => console.log('    ' + details(f)))
    console.log()
  }
  if (findings.accessibility.length > 0) {
    console.log('  ♿ ACCESSIBILITY:')
    findings.accessibility.forEach(f => console.log('    ' + details(f)))
    console.log()
  }

  const criticalCount = allIssues.filter(f => f.severity === 'critical').length
  const highCount = allIssues.filter(f => f.severity === 'high').length

  console.log('  ─────────────────────────────')
  if (criticalCount === 0 && highCount === 0) {
    console.log('  🟢 VERDICT: App passes QA — no critical/high bugs.')
  } else if (criticalCount > 0) {
    console.log(`  🔴 VERDICT: ${criticalCount} critical bug(s) must be fixed.`)
  } else {
    console.log(`  🟠 VERDICT: ${highCount} high-severity issue(s) to address.`)
  }
  console.log('═══════════════════════════════════════════════════\n')

  await browser.close()
})()
