import urllib.request, json

# Try to get arena leaderboard data from known sources
urls = [
    "https://huggingface.co/datasets/lmarena-ai/chatbot-arena-leaderboard/resolve/main/data/leaderboard.csv",
    "https://huggingface.co/datasets/lmarena-ai/chatbot-arena-leaderboard/raw/main/data/leaderboard.csv",
]
for url in urls:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=15)
        data = resp.read()
        print(f"OK ({resp.status}): {url}")
        print(f"Size: {len(data)}")
        text = data.decode("utf-8", errors="replace")
        lines = text.split("\n")[:10]
        for l in lines:
            print(f"  {l[:200]}")
        print()
    except Exception as e:
        print(f"FAIL: {url} -> {str(e)[:100]}")
        print()

