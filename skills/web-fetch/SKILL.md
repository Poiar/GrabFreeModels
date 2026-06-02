---
name: web-fetch
description: Fetch page content using Playwright — JS rendering, bot bypass. Triggers: "fetch this URL", "get page content", "scrape", any URL retrieval that fails with webfetch.
---

# Web Fetch

Use Playwright to retrieve real page content. Works on sites that block `webfetch` (bot detection, Cloudflare, JS-rendered SPAs).

## Basic usage

From workspace root (default cwd for bash):

```bash
node scripts/web-fetch.js --url "https://example.com"
```

## Common options

```bash
# Extract a specific element
node scripts/web-fetch.js --url "https://example.com" --selector "article.main"

# Disable JS (slightly faster, still beats webfetch on TLS fingerprinting)
node scripts/web-fetch.js --url "https://example.com" --no-js

# Screenshot + text
node scripts/web-fetch.js --url "https://example.com" --screenshot "C:\Users\pc\AppData\Local\Temp\opencode\page.png"

# Longer output (default 8000 chars)
node scripts/web-fetch.js --url "https://example.com" --maxChars 20000

# Faster wait strategy for slow pages
node scripts/web-fetch.js --url "https://example.com" --waitUntil domcontentloaded --timeout 15000
```

## When to use

| Situation | Use |
|---|---|
| Static HTML page | `webfetch` (faster, simpler) |
| JS-rendered SPA | `web-fetch.js` — this skill |
| Cloudflare / bot-protected | `web-fetch.js` — this skill |
| Need screenshot | `web-fetch.js --screenshot <path>` |
| Need specific element | `web-fetch.js --selector <css>` |

## Troubleshooting

- **Chromium not found**: Run `npx playwright install chromium`
- **Timeout**: Increase `--timeout` or switch `--waitUntil domcontentloaded`
- **Empty output**: Try `--waitUntil domcontentloaded` for pages that never reach `networkidle`
