/**
 * Fetch HuggingFace org/user avatars by scraping profile pages for creators missing icons.
 *
 * Usage: node scripts/fetch-hf-avatars.js [--dry-run]
 *   --dry-run  Only print what would be fetched, don't download
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const LOGOS_DIR = path.resolve(__dirname, '..', 'vue-model-manager', 'public', 'logos');
const DRY_RUN = process.argv.includes('--dry-run');

// Our creator slug → HF org/user slug to check
const HF_SLUG_MAP = {
  '01-ai': '01-ai',
  ai2: 'allenai',
  baai: 'BAAI',
  baichuan: 'baichuan-inc',
  'black-forest-labs': 'black-forest-labs',
  bria: 'briaai',
  'cognitive-computations': 'cognitivecomputations',
  fishaudio: 'fishaudio',
  gryphe: 'Gryphe',
  inclusion: 'AI4Inclusion',
  internlm: 'internlm',
  intfloat: 'intfloat',
  mosaicml: 'mosaicml',
  nous: 'NousResearch',
  openchat: 'openchat',
  paddlepaddle: 'PaddlePaddle',
  'pruna-ai': 'prunaai',
  sao10k: 'Sao10K',
  'sentence-transformers': 'sentence-transformers',
  sesame: 'sesame',
  shibing624: 'shibing624',
  stability: 'stabilityai',
  unknown: null,
};

const AUTO_TRY_SLUGS = [
  'ascend-tribe',
  'canopy-labs',
  'core42',
  'devstral',
  'fun-audio-llm',
  'index-team',
  'kwaipilot',
  'mini-max-ai',
  'nexagi',
  'nlper',
  'resemble-ai',
  'ring',
  'tongyi-mai',
  'wan',
];

function autoVariations(slug) {
  const vars = [slug];
  const noHyphens = slug.replace(/-/g, '');
  if (noHyphens !== slug) vars.push(noHyphens);
  if (slug.endsWith('-ai')) vars.push(slug.replace(/-ai$/, ''));
  vars.push(`${slug}ai`);
  return vars;
}

/** Fetch full HTML page as string */
function fetchHTML(url) {
  return new Promise((resolve) => {
    https
      .get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
        if (res.statusCode !== 200) return resolve(null);
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', () => resolve(null));
  });
}

/** Extract avatarUrl from HF profile page HTML (handles &quot; HTML entities) */
function extractAvatar(html) {
  if (!html) return null;
  // Try raw JSON quotes first
  let m = html.match(/"avatarUrl"\s*:\s*"(https:\/\/cdn-avatars\.huggingface\.co\/[^"]+)"/);
  if (m) return m[1];
  m = html.match(/"avatarUrl"\s*:\s*"(\/avatars\/[^"]+)"/);
  if (m) return 'https://huggingface.co' + m[1];
  // Try HTML-encoded quotes (&quot;)
  m = html.match(
    /avatarUrl&quot;\s*:\s*&quot;(https:\/\/cdn-avatars\.huggingface\.co\/[^&]+)&quot;/,
  );
  if (m) return m[1];
  m = html.match(/avatarUrl&quot;\s*:\s*&quot;(\/avatars\/[^&]+)&quot;/);
  if (m) return 'https://huggingface.co' + m[1];
  return null;
}

/** Extract org/user name and type from page (handles &quot; HTML entities) */
function extractInfo(html) {
  if (!html) return null;
  let nameM = html.match(/"name"\s*:\s*"([^"]+)"/);
  if (!nameM) nameM = html.match(/name&quot;\s*:\s*&quot;([^&]+)&quot;/);
  let typeM = html.match(/"type"\s*:\s*"(org|user)"/);
  if (!typeM) typeM = html.match(/type&quot;\s*:\s*&quot;(org|user)&quot;/);
  return {
    name: nameM ? nameM[1] : null,
    type: typeM ? typeM[1] : null,
  };
}

function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
        if (res.statusCode !== 200) {
          file.close();
          try {
            fs.unlinkSync(destPath);
          } catch {}
          return resolve(false);
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(true);
        });
      })
      .on('error', () => {
        file.close();
        try {
          fs.unlinkSync(destPath);
        } catch {}
        resolve(false);
      });
  });
}

async function tryFetchFromPage(hfSlug) {
  if (!hfSlug) return null;
  const html = await fetchHTML(`https://huggingface.co/${hfSlug}`);
  const avatarUrl = extractAvatar(html);
  if (!avatarUrl) return null;
  const info = extractInfo(html);
  return { avatarUrl, name: info?.name || hfSlug, type: info?.type || 'unknown' };
}

async function processSlug(ourSlug, hfSlug, results) {
  const existing = fs.readdirSync(LOGOS_DIR).find((f) => f.startsWith(ourSlug.toLowerCase() + '.'));
  if (existing) {
    console.log(`  ✓ ${ourSlug} already has logo, skipping`);
    return;
  }

  const info = await tryFetchFromPage(hfSlug);
  if (info) {
    const ext = (info.avatarUrl.match(/\.(svg|png|jpg|jpeg|webp)(\?|$)/i) || [])[1] || 'svg';
    const finalDest = path.join(LOGOS_DIR, `${ourSlug.toLowerCase()}.${ext}`);
    console.log(`  Found ${ourSlug} ← HF:${hfSlug} (${info.type}) → ${path.basename(finalDest)}`);
    if (!DRY_RUN) {
      const ok = await downloadFile(info.avatarUrl, finalDest);
      if (ok) results.fetched.push(ourSlug);
      else results.failed.push(ourSlug);
    } else {
      results.fetched.push(ourSlug);
    }
  } else {
    console.log(`  ✗ ${ourSlug}: no avatar found on HF page /${hfSlug}`);
    results.failed.push(ourSlug);
  }
}

async function main() {
  if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

  const results = { fetched: [], failed: [], skipped: [] };

  // Process mapped slugs
  for (const [ourSlug, hfSlug] of Object.entries(HF_SLUG_MAP)) {
    if (!hfSlug) {
      results.skipped.push(ourSlug);
      continue;
    }
    await processSlug(ourSlug, hfSlug, results);
  }

  // Process auto-try slugs
  for (const slug of AUTO_TRY_SLUGS) {
    const existing = fs.readdirSync(LOGOS_DIR).find((f) => f.startsWith(slug.toLowerCase() + '.'));
    if (existing) {
      console.log(`  ✓ ${slug} already has logo, skipping`);
      continue;
    }

    let found = false;
    for (const variant of autoVariations(slug)) {
      const info = await tryFetchFromPage(variant);
      if (info) {
        const ext = (info.avatarUrl.match(/\.(svg|png|jpg|jpeg|webp)(\?|$)/i) || [])[1] || 'svg';
        const finalDest = path.join(LOGOS_DIR, `${slug.toLowerCase()}.${ext}`);
        console.log(`  Found ${slug} ← HF:${variant} (${info.type}) → ${path.basename(finalDest)}`);
        if (!DRY_RUN) {
          const ok = await downloadFile(info.avatarUrl, finalDest);
          if (ok) results.fetched.push(slug);
          else results.failed.push(slug);
        } else {
          results.fetched.push(slug);
        }
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`  ✗ ${slug}: no HF page found (tried: ${autoVariations(slug).join(', ')})`);
      results.failed.push(slug);
    }
  }

  console.log(`\n---`);
  console.log(
    `Results: ${results.fetched.length} fetched, ${results.failed.length} failed, ${results.skipped.length} skipped`,
  );
  if (results.failed.length) console.log(`Failed: ${results.failed.join(', ')}`);
  if (DRY_RUN) console.log('(dry run — no files downloaded)');
}

main().catch(console.error);
