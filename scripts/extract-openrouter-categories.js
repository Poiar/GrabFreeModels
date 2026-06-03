#!/usr/bin/env node
/**
 * extract-openrouter-categories.js
 *
 * Scrapes OpenRouter model category/rankings data from the OpenRouter website.
 * Extracts best_for tags like "Programming (#9)" per model.
 *
 * OpenRouter renders categories as <button> elements with <span title="Ranked at #N in Category">
 * inside each model card div.
 *
 * Usage:
 *   node scripts/extract-openrouter-categories.js
 */

const playwright = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://openrouter.ai/models?q=free&order=newest';
const OUTPUT = path.join(__dirname, '..', 'data', 'openrouter-categories.json');

(async () => {
  console.log('Launching Playwright...');
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const models = await page.evaluate(() => {
      const categoryButtons = document.querySelectorAll('button');
      const cardMap = new Map();

      categoryButtons.forEach(btn => {
        const span = btn.querySelector('span');
        if (!span) return;
        const title = span.getAttribute('title') || '';
        if (!title.startsWith('Ranked at #')) return;

        const categoryText = span.textContent.trim();

        // Walk up to find the model card container with a model link
        let el = btn;
        let modelId = null;
        for (let i = 0; i < 15; i++) {
          el = el.parentElement;
          if (!el || el.tagName === 'BODY') break;
          const link = el.querySelector('a[href*="/"][href*=":"]');
          if (link) {
            modelId = link.getAttribute('href').replace(/^\//, '');
            break;
          }
        }

        if (modelId) {
          if (!cardMap.has(modelId)) cardMap.set(modelId, { modelId, categories: [] });
          cardMap.get(modelId).categories.push(categoryText);
        }
      });

      return Array.from(cardMap.values());
    });

    console.log(`\nExtracted ${models.length} models with category data:\n`);
    for (const m of models) {
      console.log(`  ${m.modelId}`);
      m.categories.forEach(c => console.log(`    ${c}`));
    }

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify({ scraped_at: new Date().toISOString(), models }, null, 2));
    console.log(`\nSaved to ${OUTPUT}`);

    await browser.close();
  } catch (err) {
    console.error('Scrape failed:', err.message);
    await browser.close();
    process.exit(1);
  }
})();
