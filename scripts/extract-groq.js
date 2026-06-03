#!/usr/bin/env node
/**
 * extract-groq.js
 * Scrape model data from https://console.groq.com/docs/models using Playwright.
 *
 * Usage:
 *   node scripts/extract-groq.js [--output <path>] [--timeout 30000]
 *
 * Options:
 *   --output    Output file path (default: groq-models.json in project root)
 *   --timeout   Navigation timeout in ms (default: 30000)
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const outputPath = get('--output') || path.join(__dirname, '..', 'groq-models.json');
const timeout = parseInt(get('--timeout') || '30000', 10);

(async () => {
  console.log('Launching Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to https://console.groq.com/docs/models...');
    await page.goto('https://console.groq.com/docs/models', { waitUntil: 'networkidle', timeout });

    const models = await page.evaluate(() => {
      const result = [];

      const tables = document.querySelectorAll('table');
      const allHeadings = document.querySelectorAll('h2, h3');
      const getSection = (table) => {
        let section = 'unknown';
        for (const h of allHeadings) {
          if (h.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) {
            section = h.textContent.trim();
          }
        }
        return section;
      };
      for (const table of tables) {
        const section = getSection(table);

        const rows = table.querySelectorAll('tbody tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 2) continue;

          // Model ID is in a div's id attribute inside cell 0
          const idDiv = cells[0].querySelector('div[id]');
          if (!idDiv) continue;
          const modelId = idDiv.id;

          // Display name is the cell text minus the model ID
          const fullText = cells[0].textContent.trim().replace(/\s+/g, ' ');
          const displayName = fullText.replace(modelId, '').replace(/\s*\/\s*$/, '').trim() || modelId;

          const speedText = cells[1]?.textContent?.trim() || '';
          const speed = speedText && speedText !== '-' ? parseInt(speedText.replace(/[,.]/g, ''), 10) || null : null;

          const pricingText = cells[2]?.textContent?.trim() || '';
          let inputPrice = null;
          let outputPrice = null;
          if (pricingText && pricingText !== '-' && !pricingText.includes('per')) {
            const dollarParts = pricingText.match(/\$[\d.]+/g);
            if (dollarParts) {
              inputPrice = parseFloat(dollarParts[0].replace('$', ''));
              if (dollarParts.length > 1) outputPrice = parseFloat(dollarParts[1].replace('$', ''));
            }
          }

          const ctxText = cells[4]?.textContent?.trim() || '';
          const contextLength = ctxText && ctxText !== '-' ? parseInt(ctxText.replace(/[,]/g, ''), 10) || null : null;

          result.push({
            model_id: modelId,
            display_name: displayName,
            section,
            speed_tps: speed,
            input_price_per_million: inputPrice,
            output_price_per_million: outputPrice,
            context_length: contextLength,
            is_free: inputPrice === null || inputPrice === 0,
          });
        }
      }

      return result;
    });

    console.log(`Extracted ${models.length} models from ${new Set(models.map(m => m.section)).size} sections`);

    const bySection = {};
    for (const m of models) {
      if (!bySection[m.section]) bySection[m.section] = [];
      bySection[m.section].push(m.model_id);
    }
    for (const [section, ids] of Object.entries(bySection)) {
      console.log(`  ${section}: ${ids.length} models`);
      for (const id of ids) console.log(`    - ${id}`);
    }

    const output = {
      _generated: new Date().toISOString(),
      total: models.length,
      models,
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nWrote ${models.length} models to ${outputPath}`);

  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
