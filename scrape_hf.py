import urllib.request, json, re

# HuggingFace models API - search for our specific models
our_models = [
    "google/gemini-3.5-flash",
    "Qwen/Qwen3-8B",
    "meta-llama/Llama-3.1-8B-Instruct",
    "openai/gpt-oss-120b",
    "google/gemma-3-4b-it",
    "Mistral-Small-3.1-24B-Instruct",
    "nvidia/Nemotron-3-Nano-9B-v2",
]

for model_id in our_models:
    url = f"https://huggingface.co/api/models/{model_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        resp = urllib.request.urlopen(req, timeout=10)
        j = json.loads(resp.read())
        print(f"=== {model_id} ===")
        # Check all possible benchmark fields
        for k in ["eval_results", "results", "benchmarks", "model-index", "metrics"]:
            if k in j and j[k]:
                print(f"  {k}: {json.dumps(j[k])[:200]}")
        # Check tags
        tags = j.get("tags", [])
        bench = [t for t in tags if any(x in t.lower() for x in ["mmlu", "gsm", "human", "arc", "bench"])]
        if bench:
            print(f"  bench tags: {bench}")
        # Check widgetData for any scores
        wd = j.get("widgetData", [])
        if wd:
            for w in wd[:3]:
                if isinstance(w, dict) and "metrics" in str(w).lower():
                    print(f"  widgetData: {json.dumps(w)[:200]}")
        if not any(k in j for k in ["eval_results", "results", "benchmarks"]):
            print(f"  No benchmark data in API response")
        print()
    except Exception as e:
        print(f"FAIL {model_id}: {str(e)[:80]}")
        print()

