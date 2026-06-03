const https = require('https');
https.get('https://artificialanalysis.ai/leaderboards/models', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const names = [];
    const tbody = d.substring(d.indexOf('<tbody'), d.indexOf('</tbody>'));
    const rowParts = tbody.split('<tr');
    for (let i = 1; i < rowParts.length; i++) {
      const tdStart = rowParts[i].indexOf('<td');
      if (tdStart < 0) continue;
      const content = rowParts[i].indexOf('>', tdStart) + 1;
      const tdEnd = rowParts[i].indexOf('</td>', content);
      let cellText = rowParts[i].substring(content, tdEnd);
      cellText = cellText.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
      const rest = rowParts[i].substring(tdEnd);
      const intelMatch = rest.match(/<td[^>]*>(\d+)<\/td>/);
      if (intelMatch && parseInt(intelMatch[1]) > 10) {
        names.push(cellText);
      }
    }
    const keywords = ['GLM', 'GPT-OSS', 'Gemini', 'Gemma', 'Laguna', 'Mistral', 'Qwen'];
    for (const kw of keywords) {
      const matches = names.filter(n => n.includes(kw));
      if (matches.length > 0) {
        console.log('--- ' + kw + ' ---');
        matches.forEach(m => console.log('  ' + m));
      }
    }
  });
}).on('error', e => console.error(e.message));
