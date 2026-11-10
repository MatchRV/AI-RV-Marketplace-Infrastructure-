"""Photo/own-page pass, step 1: fetch each candidate unit's own page politely. Raw HTML saved gzipped; parsing is separate."""
import json, gzip, hashlib, os, re, sys, time, threading, collections, urllib.robotparser, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import requests
D = '/workspace/google-scraper-pilot/import-candidate'; P = f'{D}/photopass'
UA = "Mozilla/5.0 (compatible; MatchRV-InventoryPilot/0.2; +https://matchrv.com; jonathan@matchrv.com)"
H = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9"}
DELAY = 2.5
rows = [json.loads(l) for l in open(f'{D}/import_candidate_rows.ndjson')]
done = set()
if os.path.exists(f'{P}/fetch_log.ndjson'):
    for l in open(f'{P}/fetch_log.ndjson'): done.add(json.loads(l)['url'])
by = collections.defaultdict(list)
for r in rows:
    if r['url'] in done: continue
    by[urllib.parse.urlsplit(r['url']).netloc.lower()].append(r)
lock = threading.Lock(); log = open(f'{P}/fetch_log.ndjson', 'a')
def key(u): return hashlib.sha1(u.encode()).hexdigest()[:20]
def host_job(host, rs):
    s = requests.Session(); s.headers.update(H)
    rp = urllib.robotparser.RobotFileParser(); robots_ok = True
    try:
        rr = s.get(f'https://{host}/robots.txt', timeout=20)
        if rr.status_code == 200: rp.parse(rr.text.splitlines())
        else: rp.parse([])
    except Exception: rp.parse([])
    time.sleep(DELAY)
    for r in rs:
        u = r['url']; rec = {'url': u, 'host': host, 't': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
        if not rp.can_fetch(UA, u) and not rp.can_fetch('MatchRV-InventoryPilot', u):
            rec['result'] = 'robots_disallow'
        else:
            try:
                g = s.get(u, timeout=40, allow_redirects=True)
                rec.update(status=g.status_code, final=g.url, bytes=len(g.content), hist=[h.status_code for h in g.history])
                if g.content:
                    with gzip.open(f'{P}/pages/{key(u)}.html.gz', 'wb') as f: f.write(g.content)
                rec['result'] = 'fetched'
            except Exception as e:
                rec['result'] = f'error:{type(e).__name__}'
            time.sleep(DELAY)
        with lock: log.write(json.dumps(rec) + '\n'); log.flush()
hosts = sorted(by.items(), key=lambda x: -len(x[1]))
print(f'{sum(len(v) for v in by.values())} urls across {len(hosts)} hosts; largest {hosts[0][0] if hosts else None} {len(hosts[0][1]) if hosts else 0}', flush=True)
with ThreadPoolExecutor(64) as ex:
    list(ex.map(lambda kv: host_job(*kv), hosts))
print('DONE', time.strftime('%I:%M %p'), flush=True)
