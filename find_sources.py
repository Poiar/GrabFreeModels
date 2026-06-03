import urllib.request, json, re

# Find benchmark datasets on HuggingFace
queries = ["open llm leaderboard", "arena leaderboard", "chatbot arena", "llm benchmark scores"]
for q in queries:
    url = f"https://huggingface.co/api/datasets?search={q.replace(" ", "+")}&limit=5"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        j = json.loads(resp.read())
        print(f"Query: {q}")
        if isinstance(j, list):
            for item in j[:3]:
                print(f"  - {item.get("id", "?")} likes={item.get("likes", 0)}")
        print()
    except Exception as e:
        print(f"FAIL: {q} -> {str(e)[:80]}")

