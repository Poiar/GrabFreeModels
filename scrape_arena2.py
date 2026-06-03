import urllib.request

# Try LMSYS GitHub for arena leaderboard
urls = [
    "https://raw.githubusercontent.com/lmarena/chatbot-arena-leaderboard/main/leaderboard.csv",
    "https://raw.githubusercontent.com/lmarena/arena-leaderboard/main/leaderboard.csv",
    "https://raw.githubusercontent.com/lmarena/lmarena.github.io/main/_data/leaderboard.yml",
    "https://lmsys.org/blog/2025-06-03-arena-hard/",
]
for url in urls:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        data = resp.read()
        print(f"OK ({resp.status}): {url}")
        print(f"Size: {len(data)}")
        if b"," in data[:200]:
            lines = data.decode("utf-8", errors="replace").split("\n")[:5]
            for l in lines:
                print(f"  {l[:200]}")
        print()
    except Exception as e:
        print(f"FAIL: {url} -> {str(e)[:100]}")
        print()

