import urllib.request, json, re, os, sys

def fetch_url(url):
    headers = {"User-Agent": "Mozilla/5.0"}
    req = urllib.request.Request(url, headers=headers)
    return urllib.request.urlopen(req, timeout=15).read()

html = fetch_url("https://artificialanalysis.ai/leaderboards/models").decode("utf-8", errors="replace")
models = []
tbody = html[html.find("<tbody"):html.find("</tbody>")]
for row in tbody.split("<tr")[1:]:
    cells = []
    pos = 0
    while True:
        td = row.find("<td", pos)
        if td < 0: break
        content = row.find(">", td) + 1
        td_end = row.find("</td>", content)
        if td_end < 0: break
        text = re.sub(r"<[^>]+>", "", row[content:td_end]).strip()
        cells.append(text)
        pos = td_end + 5
    if len(cells) < 8: continue
    try:
        intel = int(cells[3])
        if intel < 10: continue
    except: continue
    models.append({"name": cells[0], "intelligence": intel})
print(f"AA: {len(models)} models")

DB_URL = os.environ.get("DATABASE_URL", "")
if DB_URL:
    import psycopg2
    conn = psycopg2.connect(DB_URL, sslmode="require")
    cur = conn.cursor()
    cur.execute("SELECT dm.id, dm.full_id, sm.name FROM datapoint_models dm JOIN super_models sm ON sm.id = dm.super_model_id WHERE dm.is_free = true AND dm.status_result = 
'
working
'
 AND dm.is_removed = false")
    our = cur.fetchall()
    print(f"Our: {len(our)} models")
    def norm(n): return re.sub(r"[^a-z0-9]", "", n.lower())
    matched = 0
    for aa in models:
        aa_n = norm(aa["name"])
        for dm_id, full_id, name in our:
            if aa_n == norm(name):
                matched += 1
                break
    print(f"Matched: {matched}")
    conn.close()
