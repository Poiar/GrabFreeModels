#!/usr/bin/env node
/**
 * extract-modelsdev.js
 * Scrape free model data from https://models.dev/ using Playwright.
 *
 * Usage:
 *   node scripts/extract-modelsdev.js [--output <path>] [--all] [--timeout 30000]
 *
 * Options:
 *   --output    Output file path (default: modelsdev-free-models.json in project root)
 *   --all       Include non-free models (default: free only)
 *   --timeout   Navigation timeout in ms (default: 30000)
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};

const outputPath = get('--output') || path.join(__dirname, '..', 'modelsdev-free-models.json');
const includeAll = args.includes('--all');
const timeout = parseInt(get('--timeout') || '30000', 10);

(async () => {
  console.log('Launching Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to https://models.dev/...');
    await page.goto('https://models.dev/', { waitUntil: 'networkidle', timeout });

    const rawModels = await page.evaluate(() => {
      if (typeof window.__TABLE_DATA__ !== 'undefined') return window.__TABLE_DATA__;
      if (typeof window.__DATA__ !== 'undefined') return window.__DATA__;
      return null;
    });

    if (!rawModels || !Array.isArray(rawModels)) {
      console.error(
        'Could not find model data in page. Tried window.__TABLE_DATA__ and window.__DATA__.',
      );
      console.error(
        'The site may have changed its data injection method. Inspect the page source.',
      );
      process.exitCode = 1;
      return;
    }

    console.log(`Found ${rawModels.length} models on the page.`);

    const models = includeAll
      ? rawModels
      : rawModels.filter((m) => (m.inputCost ?? 0) === 0 && (m.outputCost ?? 0) === 0);

    const uniqueModelIds = new Set(models.map((m) => m.modelId)).size;

    const byProvider = {};
    for (const m of models) {
      const pid = m.providerId;
      if (!byProvider[pid]) byProvider[pid] = { name: m.providerName, count: 0, textCount: 0 };
      byProvider[pid].count++;
      if (Array.isArray(m.output) && m.output.includes('text')) byProvider[pid].textCount++;
    }

    const result = {
      _generated: new Date().toISOString(),
      total: models.length,
      unique_model_ids: uniqueModelIds,
      by_provider: byProvider,
      models,
    };

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(
      `\nExported ${models.length} free models (${uniqueModelIds} unique) across ${Object.keys(byProvider).length} providers.`,
    );
    console.log(`Output: ${outputPath}`);
  } catch (err) {
    console.error(`Extraction failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
