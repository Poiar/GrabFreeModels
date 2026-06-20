const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.log(`  FAIL: ${msg}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // ── Helpers ──────────────────────────────────────────────

  async function dispatchErrorEvent(opts = {}) {
    return page.evaluate((o) => {
      const error = new Error(o.message || 'Test error');
      Object.defineProperty(error, 'stack', {
        value: o.stack || `Error: ${o.message}\n    at ${o.source || 'test.js'}:${o.line || 1}:${o.col || 1}`,
      });
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: o.message || 'Test error',
          filename: o.source || 'test.js',
          lineno: o.line || 1,
          colno: o.col || 1,
          error,
        }),
      );
    }, opts);
  }

  async function dispatchRejection(reason) {
    return page.evaluate((msg) => {
      const error = new Error(msg);
      window.dispatchEvent(
        new PromiseRejectionEvent('unhandledrejection', {
          reason: error,
          promise: Promise.reject(error).catch(() => {}),
        }),
      );
    }, reason || 'Test rejection');
  }

  async function panelState() {
    return page.evaluate(() => {
      const panel = document.getElementById('vibe-error-console');
      if (!panel) return { exists: false, visible: false, errorCount: 0, errors: [] };
      const items = panel.querySelectorAll('.vibe-error-item');
      const errors = [];
      items.forEach((el) => {
        errors.push({
          message: el.querySelector('b')?.textContent || '',
          meta: el.querySelector('.vibe-error-meta')?.textContent || '',
          hasStack: !!el.querySelector('pre')?.textContent,
        });
      });
      const empty = panel.querySelector('.vibe-error-empty');
      return {
        exists: true,
        visible: getComputedStyle(panel).display !== 'none',
        errorCount: items.length,
        errors,
        emptyShown: !!empty,
      };
    });
  }

  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
  // Wait for Vue app to mount
  await page.waitForSelector('.layout', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // ═══════════════════════════════════════════════════════════
  // Panel auto-opens on ErrorEvent
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== Panel auto-opens on ErrorEvent ===');

  await dispatchErrorEvent({
    message: 'Test error: cannot read property X',
    source: 'widget.js',
    line: 42,
    col: 7,
  });

  await page.waitForTimeout(500);

  let state = await panelState();
  assert(state.exists, 'Panel element exists in DOM');
  assert(state.visible, 'Panel is visible after error');
  assert(state.errorCount === 1, `1 error captured (got ${state.errorCount})`);
  if (state.errors[0]) {
    assert(
      state.errors[0].message.includes('cannot read property X'),
      `Error message captured: "${state.errors[0].message}"`,
    );
    assert(
      state.errors[0].meta.includes('widget.js'),
      `Source file in meta: "${state.errors[0].meta}"`,
    );
    assert(
      state.errors[0].meta.includes('42') || state.errors[0].meta.includes('line 42'),
      `Line number in meta: "${state.errors[0].meta}"`,
    );
    assert(state.errors[0].hasStack, 'Stack trace captured');
  }

  // ═══════════════════════════════════════════════════════════
  // Unhandled rejection captured
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== Unhandled rejection captured ===');

  await dispatchRejection('Async operation timed out');

  await page.waitForTimeout(500);

  state = await panelState();
  assert(state.errorCount === 2, `2 errors after rejection (got ${state.errorCount})`);
  if (state.errors[0]) {
    assert(
      state.errors[0].message.includes('Async operation timed out'),
      `Rejection message: "${state.errors[0].message}"`,
    );
    assert(
      state.errors[0].meta.includes('inline/runtime'),
      `Rejection shows inline/runtime: "${state.errors[0].meta}"`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Multiple errors stack in order (newest first)
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== Multiple errors stack correctly ===');

  await dispatchErrorEvent({ message: 'Error #1', source: 'a.js', line: 10, col: 1 });
  await dispatchErrorEvent({ message: 'Error #2', source: 'b.js', line: 20, col: 1 });
  await dispatchErrorEvent({ message: 'Error #3', source: 'c.js', line: 30, col: 1 });

  await page.waitForTimeout(500);

  state = await panelState();
  assert(state.errorCount === 5, `5 total errors (got ${state.errorCount})`);
  // Newest should be first
  if (state.errors[0]) {
    assert(state.errors[0].message.includes('Error #3'), `Newest first: "${state.errors[0].message}"`);
  }
  if (state.errors[4]) {
    assert(state.errors[4].message.includes('cannot read property X'), `Oldest last: "${state.errors[4].message}"`);
  }

  // ═══════════════════════════════════════════════════════════
  // Clear button empties error list
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== Clear button empties error list ===');

  await page.locator('button:has-text("Clear")').click();
  await page.waitForTimeout(300);

  state = await panelState();
  assert(state.visible, 'Panel still visible after clear');
  assert(state.errorCount === 0, `0 errors after clear (got ${state.errorCount})`);
  assert(state.emptyShown, '"No errors captured yet" shown');

  // ═══════════════════════════════════════════════════════════
  // Close button hides panel; new error re-opens it
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== Close / re-open cycle ===');

  await page.locator('button:has-text("Close")').click();
  await page.waitForTimeout(300);

  state = await panelState();
  assert(!state.exists, 'Panel removed from DOM after close');

  // Trigger a new error — panel should re-appear
  await dispatchErrorEvent({ message: 'Error after close', source: 'reopen.js', line: 1, col: 1 });
  await page.waitForTimeout(500);

  state = await panelState();
  assert(state.exists && state.visible, 'Panel re-opened on new error');
  assert(state.errorCount === 1, '1 fresh error after re-open');

  // ═══════════════════════════════════════════════════════════
  // Copy Errors button
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== Copy Errors button ===');

  // Clear first, then add a known error for predictable clipboard content
  await page.locator('button:has-text("Clear")').click();
  await page.waitForTimeout(200);

  await dispatchErrorEvent({
    message: 'Clipboard test error',
    source: 'clipboard-test.js',
    line: 99,
    col: 3,
    stack: 'Error: Clipboard test error\n    at clipboard-test.js:99:3\n    at Module.run (app.js:12:1)',
  });
  await page.waitForTimeout(300);

  // Grant clipboard permission and click copy
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page2 = await context.newPage();
  await page2.goto(`${BASE}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
  await page2.waitForSelector('.layout', { timeout: 10000 }).catch(() => {});
  await page2.waitForTimeout(1000);

  await page2.evaluate((o) => {
    const error = new Error(o.message);
    Object.defineProperty(error, 'stack', { value: o.stack });
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: o.message,
        filename: o.source,
        lineno: o.line,
        colno: o.col,
        error,
      }),
    );
  }, {
    message: 'Clipboard test error',
    source: 'clipboard-test.js',
    line: 99,
    col: 3,
    stack: 'Error: Clipboard test error\n    at clipboard-test.js:99:3\n    at Module.run (app.js:12:1)',
  });
  await page2.waitForTimeout(500);

  await page2.locator('button:has-text("Copy Errors")').click();
  await page2.waitForTimeout(500);

  const clipText = await page2.evaluate(() => navigator.clipboard.readText());
  assert(
    clipText && clipText.includes('Clipboard test error'),
    'Clipboard contains error message',
  );
  assert(
    clipText && clipText.includes('clipboard-test.js'),
    'Clipboard contains source file',
  );
  assert(
    clipText && clipText.includes('line 99'),
    'Clipboard contains line number',
  );
  assert(
    clipText && clipText.includes('col 3'),
    'Clipboard contains column number',
  );
  assert(
    clipText && clipText.includes('Module.run'),
    'Clipboard contains stack trace',
  );
  console.log(`  INFO: Clipboard content:\n${clipText}`);

  await context.close();

  // ═══════════════════════════════════════════════════════════
  // Error source shows inline/runtime for sourceless errors
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== Source fallback for sourceless errors ===');

  await page.locator('button:has-text("Clear")').click();
  await page.waitForTimeout(200);

  // Trigger error without a source file (like rejections or eval)
  await page.evaluate(() => {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Eval error',
        filename: '',
        lineno: 0,
        colno: 0,
        error: new Error('Eval error'),
      }),
    );
  });
  await page.waitForTimeout(300);

  state = await panelState();
  if (state.errors[0]) {
    assert(
      state.errors[0].meta.includes('inline/runtime'),
      `Sourceless shows "inline/runtime": "${state.errors[0].meta}"`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Cap at 50 errors
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== Max 50 error cap ===');

  await page.locator('button:has-text("Clear")').click();
  await page.waitForTimeout(200);

  for (let i = 0; i < 55; i++) {
    await dispatchErrorEvent({ message: `Error ${i + 1}`, source: 'cap.js', line: i + 1, col: 1 });
  }
  await page.waitForTimeout(800);

  state = await panelState();
  assert(state.errorCount <= 50, `Capped at 50 errors (got ${state.errorCount})`);

  // ═══════════════════════════════════════════════════════════
  // Done
  // ═══════════════════════════════════════════════════════════
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
