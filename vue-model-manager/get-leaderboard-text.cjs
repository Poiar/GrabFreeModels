const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://openrouter.ai/rankings', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(10000);

  // Get entire page text
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text.slice(0, 30000));

  // Try to find the leaderboard data in the rendered DOM
  const leaderboard = await page.evaluate(() => {
    // Look for tabular data, list items, or specific data attributes
    const results = [];
    // Try to find model names and any associated scores/rankings
    const allText = document.body.innerText;
    // Extract lines that look like rankings (numbered items)
    const lines = allText.split('\n');
    let inLeaderboard = false;
    for (const line of lines) {
      if (line.includes('LLM Leaderboard') || line.includes('Leaderboard')) inLeaderboard = true;
      if (line.includes('Market Share') || line.includes('Categories')) inLeaderboard = false;
      if (inLeaderboard && line.trim()) results.push(line.trim());
    }
    return results;
  });

  console.log('\n=== LEADERBOARD SECTION ===');
  leaderboard.forEach(l => console.log(l));

  await browser.close();
})().catch(e => console.error(e.message));
