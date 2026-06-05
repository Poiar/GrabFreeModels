#!/usr/bin/env node
/**
 * web-fetch.js
 * Fetch a real page using Playwright (bypasses bot detection, executes JS).
 *
 * Usage:
 *   node scripts/web-fetch.js --url <url> [--timeout 30000] [--waitUntil networkidle|domcontentloaded|load]
 *                                [--selector <css>] [--maxChars 8000] [--no-js] [--screenshot <path>]
 *
 * Options:
 *   --url         Target URL (required)
 *   --timeout     Navigation timeout in ms (default: 30000)
 *   --waitUntil   When to consider navigation done (default: networkidle)
 *   --selector    CSS selector to extract a specific element's text
 *   --maxChars    Truncate output at this many characters (default: 8000, 0 = unlimited)
 *   --no-js       Disable JavaScript execution
 *   --screenshot  Save a screenshot to this path before extracting content
 */

const { chromium } = require('playwright');

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};

const url = get('--url');
if (!url) {
  console.error('Error: --url is required');
  process.exit(1);
}

const timeout = parseInt(get('--timeout') || '30000', 10);
const waitUntil = get('--waitUntil') || 'networkidle';
const selector = get('--selector') || null;
const maxChars = parseInt(get('--maxChars') || '8000', 10);
const noJs = args.includes('--no-js');
const screenshotPath = get('--screenshot') || null;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    javaScriptEnabled: !noJs,
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil, timeout });

    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Screenshot saved: ${screenshotPath}`);
    }

    let text;
    if (selector) {
      await page.waitForSelector(selector, { timeout: Math.min(timeout, 10000) }).catch(() => {});
      text = await page.textContent(selector).catch(() => null);
    } else {
      text = await page.evaluate(() => document.body.innerText);
    }

    if (!text) {
      console.log('(no content found)');
    } else if (maxChars > 0 && text.length > maxChars) {
      console.log(text.slice(0, maxChars) + '\n…(truncated)');
    } else {
      console.log(text);
    }
  } catch (err) {
    console.error(`Fetch failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
