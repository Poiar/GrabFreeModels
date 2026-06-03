import urllib.request, re

# Check what other AA leaderboard pages exist
pages = [
    "https://artificialanalysis.ai/leaderboards/models",
    "https://artificialanalysis.ai/leaderboards/providers",
    "https://artificialanalysis.ai/leaderboards/coding",
    "https://artificialanalysis.ai/leaderboards/math",
    "https://artificialanalysis.ai/leaderboards/reasoning",
    "https://artificialanalysis.ai/leaderboards/agents",
    "https://artificialanalysis.ai/api/models/leaderboard",
]

for url in pages:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        data = resp.read()
        print(f"OK ({resp.status}): {url}")
        print(f"  Size: {len(data)}")
        if b"<table" in data:
            # Count table rows
            rows = re.findall(r"<tr", data)
            print(f"  Table rows: {len(rows)}")
        print()
    except Exception as e:
        print(f"FAIL: {url} -> {str(e)[:80]}")
        print()

