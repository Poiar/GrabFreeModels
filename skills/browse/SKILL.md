---
name: browse
description: Browser automation CLI by Browserbase. Triggers: "browse this URL", "scrape this site", "automate browser", "extract data from webpage", "take a screenshot of", "fill out a form", "click a button on", or any task requiring browser interaction. Works locally (no account needed) or with Browserbase cloud (proxies, verified sessions, bot bypass). Preferred over Playwright scripts for quick one-off scraping, screenshots, and form interaction.
---

# Browse

`browse` is a CLI tool for browser automation, built by Browserbase. It manages a local Chromium browser session and provides commands for navigation, page inspection, element interaction, and screenshots.

## Modes

| Mode | Flag | Needs account | Use case |
|------|------|---------------|----------|
| Local browser | `--local` (default) | No | Quick scraping, screenshots, form fill |
| Cloud remote | `--remote` | Yes (Browserbase) | Bot bypass, verified sessions, proxies |

All examples below use `--local` which works out of the box.

## Core Workflow

```bash
# 1. Open a page
browse open https://example.com --local

# 2. Inspect the page
browse snapshot              # accessibility tree with refs
browse get title             # page title
browse get text body         # visible text
browse get html body         # raw HTML
browse get markdown body     # markdown rendering

# 3. Interact with elements (use refs from snapshot)
browse click @0-12           # click element by ref
browse fill @0-13 "text"     # fill input by ref
browse type "hello"          # type at current focus
browse key Enter             # press key
browse select @0-14 "option" # select dropdown option

# 4. Extract data
browse eval 'document.title'                           # run JS
browse eval 'JSON.stringify([...document.querySelectorAll("a")].map(a => a.href))'  # extract links

# 5. Screenshot
browse screenshot --path C:\Users\pc\AppData\Local\Temp\opencode\page.png
browse screenshot --full-page --path page.png

# 6. Navigate
browse back
browse forward
browse reload

# 7. Cleanup
browse stop                  # stop the browser daemon
```

## Snapshot & Refs

`snapshot` prints an accessibility tree with numbered refs like `[0-12]`. Use these refs for targeted interaction:

```bash
browse snapshot
# [0-12] heading: Example Domain
# [0-17] link: Learn more

browse click @0-17           # click the link
browse get text @0-12        # get heading text
browse get box @0-12         # get element bounding box
browse highlight @0-12       # highlight element (headed mode)
```

## Eval for Data Extraction

`browse eval` runs JavaScript in the page context — the most powerful extraction tool:

```bash
# Extract structured data
browse eval 'JSON.stringify(Array.from(document.querySelectorAll(".item")).map(el => ({
  title: el.querySelector("h2")?.textContent?.trim(),
  price: el.querySelector(".price")?.textContent?.trim(),
  link: el.querySelector("a")?.href
})))'

# Check element count
browse eval 'document.querySelectorAll("article").length'

# Get all links
browse eval 'JSON.stringify([...document.querySelectorAll("a")].map(a => ({text: a.textContent.trim(), href: a.href})))'
```

## When to Use Browse vs. Alternatives

| Situation | Tool |
|-----------|------|
| Quick one-off scrape, screenshot, form fill | `browse` (this skill) |
| Complex multi-page scraping pipeline | Playwright script (`extract-*.js`) |
| Static HTML, no JS needed | `webfetch` |
| JS-rendered page, no bot protection | `web-fetch.js` (Playwright) |
| Bot-protected page (Cloudflare, DataDome) | `browse --remote` with Browserbase proxies |
| Structured extraction from known site | `browse skills add <domain>/<task>` |

## Browse Skills Catalog

Pre-built automation recipes for specific sites:

```bash
# Search the catalog
browse skills find "restaurant reviews"
browse skills find yelp
browse skills find travel --limit 5

# Install a skill (downloads SKILL.md to ~/.config/browserbase/skills/)
browse skills add yelp.com/extract-reviews

# List installed
browse skills list
```

Skills are stored at `~/.config/browserbase/skills/<domain>/<task>/SKILL.md`.

## Cloud Fetch (Lightweight)

For simple page retrieval without a full browser session (requires Browserbase API key):

```bash
browse cloud fetch https://example.com                    # markdown output
browse cloud fetch https://example.com --format raw       # raw HTML
browse cloud fetch https://example.com --output page.html # save to file
browse cloud fetch https://example.com --proxies          # use proxies
```

## Common Patterns

### Scrape a list of items

```bash
browse open https://example.com/products --local
browse eval 'JSON.stringify([...document.querySelectorAll(".product-card")].map(card => ({
  name: card.querySelector(".name")?.textContent?.trim(),
  price: card.querySelector(".price")?.textContent?.trim()
})))'
```

### Fill and submit a form

```bash
browse open https://example.com/search --local
browse snapshot
browse fill @0-5 "search query"
browse click @0-8            # submit button
browse wait networkidle      # wait for results
browse get text body
```

### Screenshot a specific element

```bash
browse screenshot --clip 100,200,800,600 --path cropped.png
```

### Wait for page to load

```bash
browse wait networkidle
browse wait domcontentloaded
browse wait 3000             # wait 3 seconds
```

## Troubleshooting

- **Daemon not running**: `browse open <url> --local` auto-starts it
- **Page not loaded**: Add `browse wait networkidle` or `browse wait 3000`
- **Element not found**: Run `browse snapshot` to see current page state
- **Empty eval result**: Page may still be loading; wait first
- **Screenshot path with spaces**: Quote the path: `--path "C:\My Folder\file.png"`
- **Session issues**: `browse stop` then retry
