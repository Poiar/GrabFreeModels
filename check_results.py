import urllib.request, json

# Check a sample results file from Open LLM leaderboard
url = "https://huggingface.co/datasets/open-llm-leaderboard-old/resolve/main/results.json"
try:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    resp = urllib.request.urlopen(req, timeout=15)
    data = resp.read()
    print(f"Size: {len(data)} bytes")
    try:
        j = json.loads(data)
        if isinstance(j, dict):
            print(f"Top keys: {list(j.keys())[:10]}")
            # Check structure
            first_key = list(j.keys())[0] if j else None
            if first_key:
                print(f"First entry ({first_key}): {json.dumps(j[first_key], indent=2)[:500]}")
        elif isinstance(j, list):
            print(f"List length: {len(j)}")
            if len(j) > 0:
                print(f"First item keys: {list(j[0].keys())[:10]}")
                print(f"First item: {json.dumps(j[0], indent=2)[:500]}")
    except Exception as e:
        print(f"Not JSON: {e}")
except Exception as e:
    print(f"FAIL: {e}")

