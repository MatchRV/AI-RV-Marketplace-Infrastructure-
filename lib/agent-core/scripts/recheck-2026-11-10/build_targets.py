"""build_targets.py: priority-ordered page targets for the 2026-11-05 dealer re-check.
Inputs: base snapshot (main cf146e0), fresh sitemaps (sm/*.ndjson, fetched 2026-11-05), Oct 30 CW sitemap fallback.
Output: fetch/targets.ndjson (kinds: ia = Interact unit page, gen = other dealer unit page with a stored/derived unit URL,
cw = Camping World by stock). Order within a host = priority: (0) pages likely to be units aging out soonest, (1) other
stored-URL units oldest first, (2) pages not matched to any stored unit (candidate new units). No inference of facts here."""
import json,gzip,re,sys,os,collections as C,datetime as D,hashlib
from urllib.parse import urlparse
W='/workspace/harvest-recheck-2026-11-10'
snap=json.load(gzip.open(f'{W}/out/base_main_e2e411b.snapshot.json.gz')); U=snap['units']
NOW=D.datetime(2026,11,10,4,10,0,tzinfo=D.timezone.utc)  # recheck builtAt BEFORE
def age(u): return (NOW-D.datetime.fromisoformat(u['provenance']['lastSeenAt'].replace('Z','+00:00'))).total_seconds()/86400
byd=C.defaultdict(list)
for u in U: byd[u['provenance']['dealerDomain']].append(u)
sm={}
for f in ('interact','other','rest','cw'):
    p=f'{W}/sm/{f}_sm.ndjson'
    if os.path.exists(p):
        for l in open(p):
            t=json.loads(l); sm[t['domain']]=t
IAPAT=re.compile(r'^https?://[^/]+/product/[a-z0-9-]+-\d+-\d+/?$')
DET=re.compile(r'(?i)(/vdp/\d+|/(?:19[89]\d|20[0-2]\d)[-_/][a-z]|[-_/](?:19[89]\d|20[0-2]\d)[-_][a-z][a-z0-9-]{3,}|/product/[a-z0-9-]*\d{5,}|/listing/|/unit/|/details?/|/inventory/[^/?]+/[^/?]+|/vehicle-details/|/rvs?-for-sale/[^/]+/[^/]+|[-_]i\d{5,}|/stock/|/unit-details)')
BAD=re.compile(r'(?i)\.(jpg|jpeg|png|gif|webp|pdf|css|js|xml)(\?|$)|/blog|/news|/wp-content|/tag/|/category/|/author/|/service|/parts|/financ|/contact|/about|/privacy|/careers|/specials?\b|/product-category/|/rv-lifestyle|/shop/')
def norm(u): return u.split('#')[0].rstrip('/').lower().replace('://www.','://')
def toks(s): return [t for t in re.sub(r'[^a-z0-9]+',' ',(s or '').lower()).split() if t]
VIN=re.compile(r'[A-HJ-NPR-Z0-9]{17}',re.I)
out=[]; summ={}
stats=C.Counter()
ia_domains=set(d for d,t in sm.items() if sum(1 for x in t['urls'] if IAPAT.match(x))>=10)
# Prioritize dealers with units aging out soonest (Nov 7 cliff first, then Nov 14).
nov7=D.datetime(2026,11,10,7,59,tzinfo=D.timezone.utc)
nov14=D.datetime(2026,11,16,7,59,tzinfo=D.timezone.utc)
def ages_out_by(u, deadline):
    return D.datetime.fromisoformat(u['provenance']['lastSeenAt'].replace('Z','+00:00')) + D.timedelta(days=30) <= deadline
dom_prio={}
for dom,us in byd.items():
    n7=sum(1 for u in us if ages_out_by(u, nov7))
    n14=sum(1 for u in us if (not ages_out_by(u, nov7)) and ages_out_by(u, nov14))
    # sort key: more nov7 first, then more nov8-14, then total units
    dom_prio[dom]=(-n7, -n14, -len(us), dom)
for dom in sorted(byd.keys(), key=lambda d: dom_prio[d]):
    us=byd[dom]
    if dom=='rv.campingworld.com': continue
    t=sm.get(dom)
    if not t or not t['urls']: stats['no_sitemap_urls_domains']+=1; stats['no_sitemap_urls_units']+=len(us); continue
    isia=dom in ia_domains
    cand=[x for x in dict.fromkeys(t['urls']) if (IAPAT.match(x) if isia else (DET.search(urlparse(x).path) and not BAD.search(x)))]
    if not cand: stats['no_unit_like_urls_domains']+=1; stats['no_unit_like_urls_units']+=len(us); summ[dom]={'units':len(us),'cand':0}; continue
    known={norm(u['provenance']['listingUrl']):u for u in us if u['provenance'].get('listingUrl')}
    nourl=[u for u in us if not u['provenance'].get('listingUrl')]
    vinidx={u['vin'].upper():u for u in us if u.get('vin') and len(u['vin'])==17}
    nu_vin={u['vin'].upper():u for u in nourl if u.get('vin') and len(u['vin'])==17}
    stk={str(u['stockNumber']).lower():u for u in nourl if u.get('stockNumber') and len(str(u['stockNumber']))>=4}
    # title token sets of nourl units for slug scoring (Interact slugs carry year/make/model/floorplan, not stock)
    nut=[(set(toks(u['title'])),u) for u in nourl]
    byyear=C.defaultdict(list)
    for s_,u in nut:
        y=next((t for t in s_ if re.fullmatch(r'(19|20)\d\d',t)),None); byyear[y].append((s_-{y},u))
    rows=[]
    for x in cand:
        path=urlparse(x).path; pr=2; unit=None; why='new'
        if norm(x) in known:
            unit=known[norm(x)]; pr=1; why='known_url'; a=age(unit)
            rows.append((pr,-a,x,unit['id'],why)); continue
        m=VIN.search(path.upper())
        if m and m.group(0) in vinidx:
            unit=vinidx[m.group(0)]; pr=0 if m.group(0) in nu_vin else 1; why='vin_in_url'; rows.append((pr,-age(unit),x,unit['id'],why)); continue
        sl=set(toks(path.rsplit('/',1)[-1])); best=0
        if isia and nourl:
            y=next((t for t in sl if re.fullmatch(r'(19|20)\d\d',t)),None)
            for tt,uu in byyear.get(y,[]):
                if tt and tt<=sl: best=max(best,len(tt))
        if best: rows.append((0,-best,x,None,'slug_match_nourl_unit'))
        else:
            sk=[s_ for s_ in stk if s_ in path.lower()]
            if sk: rows.append((0,-100,x,stk[sk[0]]['id'],'stock_in_url'))
            else: rows.append((2,0,x,None,'new'))
    rows.sort(key=lambda r:(r[0],r[1]))
    summ[dom]={'units':len(us),'nourl':len(nourl),'cand':len(rows),'interact':isia,'by_why':dict(C.Counter(r[4] for r in rows))}
    for pr,_,x,uid,why in rows:
        out.append({'key':'u:'+hashlib.sha1(x.encode()).hexdigest()[:16],'kind':'ia' if isia else 'gen','url':x,'domain':dom,'unit':uid,'why':why,'prio':pr})
# CW: stock-based, units oldest first (same URL derivation as the Oct 30 page pass); fresh sitemap if present, else the Oct 30 one
cwurls=None
if 'rv.campingworld.com' in sm and sm['rv.campingworld.com']['urls']: cwurls=sm['rv.campingworld.com']['urls']; src='fresh'
else: cwurls=[l.strip() for l in open('/workspace/harvest-2026-10-30/pagepass/sitemaps/cw_urls_20261030.txt')]; src='oct30'
cw={}
for u in cwurls:
    slug=u.rsplit('/',1)[-1]
    for tk in slug.split('-'):
        if re.search(r'\d',tk) and len(tk)>=4 and not re.fullmatch(r'(19|20)\d\d',tk): cw.setdefault(tk.lower(),set()).add(u)
CW_IMG=re.compile(r'images\.rvs\.com/[^/]+/([^/]+)/')
cwu=sorted(byd['rv.campingworld.com'],key=lambda u:(-age(u),u['id']))
ncw=0; cwt=[]
for u in cwu:
    cands=[u['stockNumber']] if u['stockNumber'] else []
    if not cands:
        ds=(re.search(r'Stock #(\S+?)\.(?:\s|$)',u.get('description') or '') or [None,None])[1]
        im=next((m.group(1) for im in u['images'] for m in [CW_IMG.search(im)] if m and not m.group(1).lower().startswith('rv')),None)
        cands=[c for c in dict.fromkeys([ds,im]) if c]
    for c in cands:
        s=cw.get(c.lower()); url=sorted(s)[0] if s and len(s)==1 else f'https://rv.campingworld.com/rv/{c}'
        cwt.append({'key':f"cw|{u['id']}|{c}",'kind':'cw','unit':u['id'],'stock':c,'url':url,'domain':'rv.campingworld.com','why':'in_sitemap' if s and len(s)==1 else 'not_in_sitemap','prio':0}); ncw+=1
stats['cw_targets']=ncw; stats['cw_sitemap_source']=src
os.makedirs(f'{W}/fetch',exist_ok=True)
with open(f'{W}/fetch/targets.ndjson','w') as f:
    for t in out+cwt: f.write(json.dumps(t)+'\n')
json.dump({'stats':dict(stats),'ia_domains':len(ia_domains),'per_domain':summ},open(f'{W}/out/targets_summary.json','w'),indent=1)
c=C.Counter((t['kind'],t['prio']) for t in out+cwt); print(dict(stats),len(out),len(cwt),sorted(c.items()))
