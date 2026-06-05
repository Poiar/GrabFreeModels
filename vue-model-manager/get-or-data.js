const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let modelsData = null;

  page.on('response', async (response) => {
    if (response.url().includes('/api/frontend/models') && !modelsData) {
      try {
        modelsData = await response.json();
      } catch {}
    }
  });

  await page.goto('https://openrouter.ai/rankings', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  if (modelsData) {
    const models = modelsData.data || modelsData;
    console.log('Total models:', models.length);
    console.log('Top-level keys:', Object.keys(models[0] || {}).join(', '));

    // Save full data for analysis
    fs.writeFileSync(
      'C:\\Users\\pc\\AppData\\Local\\Temp\\opencode\\or-frontend-models.json',
      JSON.stringify(modelsData, null, 2),
    );

    // Check specific models
    for (const slug of [
      'gpt-oss-120b',
      'deepseek-v4-flash',
      'owl-alpha',
      'glm-4.5',
      'gemini-3',
      'hy3',
      'parakeet',
      'qwen3.7',
    ]) {
      const m = models.find((m) => m.slug && m.slug.includes(slug));
      if (m) {
        console.log(`\n=== ${m.slug} ===`);
        console.log(JSON.stringify(m, null, 2).slice(0, 3000));
      }
    }
  } else {
    console.log('No models data captured');
  }

  await browser.close();
})().catch((e) => console.error(e.message));
