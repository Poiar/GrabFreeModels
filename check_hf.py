import urllib.request, json

# Check the Open LLM leaderboard results dataset
urls = [
    "https://huggingface.co/api/datasets/open-llm-leaderboard-old/results",
    "https://huggingface.co/api/datasets/lmsys/chatbot_arena_conversations",
]
for url in urls:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        j = json.loads(resp.read())
        print(f"OK: {url}")
        print(f"  Keys: {list(j.keys())[:10]}")
        if "cardData" in j:
            cd = j["cardData"]
            print(f"  cardData keys: {list(cd.keys())[:10]}")
        # Check for files/parquet info
        if "siblings" in j:
            for s in j["siblings"][:5]:
                print(f"  File: {s.get("rfilename", "?")}")
        print()
    except Exception as e:
        print(f"FAIL: {url} -> {str(e)[:100]}")
        print()

