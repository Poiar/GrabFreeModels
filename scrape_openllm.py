import urllib.request, re

# Scrape the Open LLM leaderboard page
url = "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard"
try:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    resp = urllib.request.urlopen(req, timeout=15)
    html = resp.read().decode("utf-8", errors="replace")
    print(f"Size: {len(html)} bytes")
    
    # Look for embedded data
    # Check for __NEXT_DATA__
    match = re.search(r"window\.__NEXT_DATA__\s*=\s*({.+?});", html, re.DOTALL)
    if match:
        print("Found __NEXT_DATA__")
        try:
            j = json.loads(match.group(1))
            # Navigate to find model data
            props = j.get("props", {}).get("pageProps", {})
            print(f"pageProps keys: {list(props.keys())[:10]}")
        except Exception as e:
            print(f"Parse error: {e}")
    
    # Look for model names in the HTML
    model_pattern = r">([A-Za-z0-9\-._]+(?:/[A-Za-z0-9\-._]+)?)</(?:td|span|div)"
    models = re.findall(model_pattern, html)
    unique = list(dict.fromkeys(models))[:30]
    print(f"Sample model names: {unique[:20]}")
except Exception as e:
    print(f"FAIL: {str(e)[:100]}")

