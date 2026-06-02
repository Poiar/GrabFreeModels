const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const captured = {};

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/frontend/models') && !captured.models) {
      try { captured.models = await response.json(); } catch(e) {}
    }
  });

  await page.goto('https://openrouter.ai/rankings', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(8000);

  if (captured.models) {
    const models = captured.models.data || captured.models;
    fs.writeFileSync('C:\\Users\\pc\\AppData\\Local\\Temp\\opencode\\or-frontend-models.json', JSON.stringify(captured.models, null, 2));

    // Show all available fields for a few models
    const targets = ['gpt-oss-120b', 'deepseek-v4-flash', 'owl-alpha'];
    for (const slug of targets) {
      const m = models.find(m => m.slug && m.slug.includes(slug));
      if (m) {
        console.log(`\n=== ${m.slug} ===`);
        console.log(JSON.stringify(m, null, 2).slice(0, 4000));
      }
    }

    // Show all unique top-level keys across all models
    const allKeys = new Set();
    models.forEach(m => Object.keys(m).forEach(k => allKeys.add(k)));
    console.log('\n=== All unique keys across all models ===');
    console.log([...allKeys].sort().join(', '));

    // Check the 'default_order' field for our target models
    console.log('\n=== default_order values ===');
    for (const slug of targets) {
      const m = models.find(m => m.slug && m.slug.includes(slug));
      if (m) console.log(`${slug}: default_order=${JSON.stringify(m.default_order)}`);
    }

    // Look for any model with non-null default_order
    const withOrder = models.filter(m => m.default_order !== null && m.default_order !== undefined);
    console.log(`\nModels with default_order: ${withOrder.length}`);
    withOrder.slice(0,20).forEach(m => console.log(`  ${m.slug}: ${JSON.stringify(m.default_order)}`));
  }

  await browser.close();
})().catch(e => console.error(e.message));
