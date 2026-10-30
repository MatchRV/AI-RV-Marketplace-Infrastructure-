"""Readability probe for the 1,195 new dealer domains: robots.txt + homepage + one inventory page. No bypass."""
import json,re,time,urllib.robotparser,concurrent.futures as cf,requests,datetime
T=json.load(open('/workspace/scrape-2026-10-26/target_new_dealers_marketcheck.json'))
UA="Mozilla/5.0 (compatible; MatchRV-collector/1.0)"
BOT=re.compile(r'cdn-cgi/challenge-platform|challenges\.cloudflare\.com|cf-chl|Just a moment\.\.\.|Attention Required|_Incapsula_Resource|px-captcha|captcha-delivery|datadome|Access Denied|Request unsuccessful|g-recaptcha|hcaptcha',re.I)
INV=["/inventory","/rvs-for-sale","/new-inventory","/used-inventory","/search/inventory"]
out=open('logs/site_probe_v2.jsonl','w')
done={json.loads(l)['domain'] for l in open('logs/site_probe.jsonl')} if False else set()
def get(u):
    try: r=requests.get(u,timeout=20,headers={"User-Agent":UA},allow_redirects=True); return r.status_code,r.text[:300000],r.url
    except Exception as e: return None,str(e)[:120],u
def probe(t):
    dom=t['item']; base=f"https://www.{dom}" if dom.count('.')==1 else f"https://{dom}"
    rec={"domain":dom,"mc_count":t['count']}
    sc,txt,fu=get(base+"/robots.txt"); time.sleep(1.5)
    rp=urllib.robotparser.RobotFileParser(); rp.parse(txt.splitlines() if sc==200 and not BOT.search(txt) else [])
    rec["robots_status"]=sc; rec["robots_bot_wall"]=bool(sc and BOT.search(txt or ""))
    rec["home_allowed"]=rp.can_fetch("*",base+"/")
    rec["inventory_allowed"]=any(rp.can_fetch("*",base+p) for p in INV)
    if not rec["home_allowed"]:
        rec["bucket"]="robots_disallowed"; return rec
    sc,txt,fu=get(base+"/"); rec["home_status"]=sc; rec["final_url"]=fu
    if sc is None: rec["bucket"]="unreachable"; rec["err"]=txt; return rec
    HARD=re.compile(r'<title>\s*(Just a moment|Attention Required|Access Denied|Request unsuccessful)|captcha-delivery\.com|_Incapsula_Resource|px-captcha|cf-chl-|cf_chl_opt',re.I)
    hm=HARD.search(txt)
    if sc in (403,429,503) or (hm and len(txt)<60000):
        rec["bucket"]="bot_wall_or_blocked"; rec["evidence"]=(hm.group(0) if hm else f"HTTP {sc}"); return rec
    rec["soft_markers"]=sorted(set(m.group(0).lower() for m in BOT.finditer(txt)))[:5]
    if sc>=400: rec["bucket"]="unreachable"; return rec
    rec["bucket"]="readable" if rec["inventory_allowed"] else "robots_disallowed_inventory"
    rec["has_inventory_link"]=bool(re.search(r'href="[^"]*(inventory|rvs-for-sale|for-sale|new-rvs|used-rvs)',txt,re.I))
    return rec
with cf.ThreadPoolExecutor(24) as ex:
    for r in ex.map(probe,T):
        r["at"]=datetime.datetime.now().astimezone().isoformat(); out.write(json.dumps(r)+"\n"); out.flush()
print("DONE")
