"""apply_gen.py <in snapshot.gz> <out snapshot.gz> <report dir>: 2026-11-02 re-check, dealers other than Camping World / Interact.
Facts only; a unit changes only from ITS OWN listing page (read 2026-11-02, after the unit's lastSeenAt):
 - identity: page VIN == stored VIN, or page stock/sku == stored stock, or (stored listing URL page, no VIN conflict, title year == unit year);
   a VIN conflict never matches. Several units claiming one page: the VIN-equal one wins, others untouched.
 - HTTP 404/410 -> removed (dead_page_gone). Redirects / pages without the unit's identity change nothing.
 - schema.org SoldOut/OutOfStock, visible sold / sale-pending wording -> removed (sold_or_sale_pending); on-order / available-to-order /
   arriving-soon tags or factory-order text -> held (on_order).
 - price = the unit's own price only (facts.py: unit element sale price, single schema.org offer, proven Sale Price + fees); MSRP/list is never
   the price. No own price and the page shows a MAP price / unlock-pricing form / only MSRP or List Price -> held price_unverified.
   Own price differing from ours by > 60% is not applied and the unit is held (price_conflict_large).
 - condition filled only when ours is unknown and the page states it; specs, VIN, stock, type, lot never touched.
 - lastSeenAt = page read time (basis dealer_page_verified), listingUrl = the page."""
import json,gzip,sys,os,re,csv,collections as C,datetime as D
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from facts import facts
import parse_generic as PG
W='/workspace/harvest-recheck-2026-11-02'; F=f'{W}/fetch'
src,dst,rep=sys.argv[1:4]; os.makedirs(rep,exist_ok=True); DRY=os.environ.get('DRY')=='1'
snap=json.load(gzip.open(src)); units=snap['units']; byid={u['id']:u for u in units}
def iso(ts): return D.datetime.strptime(ts,"%Y-%m-%dT%H:%M:%S%z").astimezone(D.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
VINOK=lambda v: bool(v) and re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}',v.upper()) is not None
tg={}
for l in open(f'{F}/targets.ndjson'):
    t=json.loads(l)
    if t['kind']=='gen': tg[t['key']]=t
ex={}
for l in open(f'{F}/extracted_gen.ndjson'):
    j=json.loads(l); ex[j['key']]=j
vin_i=C.defaultdict(dict); stk_i=C.defaultdict(lambda:C.defaultdict(list)); url_i={}
for u in units:
    d=u['provenance']['dealerDomain']
    if VINOK(u.get('vin') or ''): vin_i[d].setdefault(u['vin'].upper(),[]).append(u)
    if u.get('stockNumber'): stk_i[d][str(u['stockNumber']).strip().lower()].append(u)
def pvin(x):
    for o in x.get('ld') or []:
        if VINOK(o.get('vin') or ''): return o['vin'].upper()
    for lab,v in x.get('labels') or []:
        if lab.lower()=='vin' and VINOK(v): return v.upper()
    return None
def pstock(x):
    for o in x.get('ld') or []:
        if o.get('sku'): return str(o['sku']).strip().lower()
    for lab,v in x.get('labels') or []:
        if lab.lower().startswith('stock'): return v.strip().lower()
    return None
diff=[]; held=[]; st=C.Counter(); per=C.defaultdict(C.Counter); claims=C.defaultdict(list)
for key,j in ex.items():
    t=tg.get(key)
    if not t: continue
    dom=t['domain']
    if j.get('result')!='ok' or j.get('x') is None:
        if j.get('http') in (404,410) and t.get('unit') and t.get('why') in ('known_url','vin_in_url'): claims[t['unit']].append((key,'gone',j))
        else: st['fetch_'+str(j.get('result'))+'_'+str(j.get('http'))]+=1
        continue
    x=j['x']; v=pvin(x); s=pstock(x); how=None; u=None
    uid=t.get('unit')
    if v and v in vin_i[dom] and len(vin_i[dom][v])==1: u=vin_i[dom][v][0]; how='vin'
    elif uid and uid in byid: u=byid[uid]; how='target_'+t['why']
    elif s and len(stk_i[dom].get(s,[]))==1: u=stk_i[dom][s][0]; how='stock'
    if u is None: st['page_not_matched']+=1; continue
    claims[u['id']].append((key,how,j))
def rk(c):
    u=byid[c[0] if False else None] if False else None
for uid,cl in claims.items():
    u=byid.get(uid)
    if not u: continue
    def rank(c):
        x=(c[2].get('x') or {}); v=pvin(x) if x else None
        return (c[1]=='gone', not (v and u.get('vin') and v==u['vin'].upper()))
    cl.sort(key=rank); key,how,j=cl[0]
    if len(cl)>1: st['unit_claimed_by_several_pages']+=1
    dom=u['provenance']['dealerDomain']; ts=j['fetchedAt']; url=j.get('finalUrl') or j['url']; old_ls=u['provenance']['lastSeenAt']
    def hold(reason,note=''):
        held.append({'unit_id':uid,'dealer_domain':dom,'title':u['title'],'vin':u['vin'] or '','stock':u['stockNumber'] or '','rvType':u['rvType'],'price':u['priceUsd']['value'],'reason':reason,'source_url':url,'fetched_at':ts,'note':note})
        per[dom]['held_'+reason]+=1; byid.pop(uid,None)
    if how=='gone': hold('dead_page_gone',f"HTTP {j.get('http')}"); continue
    if iso(ts)<=old_ls: st['unit_fresher_than_page']+=1; continue
    x=j['x']; v=pvin(x); s=pstock(x)
    if v and VINOK(u.get('vin') or '') and v!=u['vin'].upper(): st['vin_conflict_no_change']+=1; continue
    ident=(v and u.get('vin') and v==u['vin'].upper()) or (s and u.get('stockNumber') and s==str(u['stockNumber']).strip().lower())
    if not ident and how.startswith('target_known_url'):
        names=' '.join(filter(None,[x.get('h1'),x.get('ogTitle'),x.get('title')])).lower()
        mk=(u.get('make') or '').lower().split()[0] if u.get('make') else ''
        ident=bool(u.get('year') and str(u['year']) in names and mk and mk in names)
    if not ident: st['identity_unconfirmed_no_change']+=1; continue
    ld=x.get('ld') or []
    page=gzip.open(f"{F}/pages/{j['page']}.html.gz","rt",errors="replace").read()
    vis=PG.txt(PG.strip_blocks(page[:600000])); vis=re.sub(r'(?i)view our\s+sold\s*-\s*sale pending\s+inventory|sold\s*-\s*sale pending\s+inventory','',vis)
    hh=(x.get('h1') or '')[:60]; hi=vis.find(hh) if hh else -1
    win=vis[max(0,hi-400):hi+4000] if hi>=0 else ''
    soldm=re.search(r'(?i)\b(?:this (?:vehicle|unit|rv|coach|trailer|camper) (?:has been|is|was) sold\b(?!\s*[\"\u201c\u201d]?\s*as[\s-]*is)|has been sold\b|sold!|sale pending|pending sale)',win) if win else None
    if any(o.get('avail') in ('SoldOut','OutOfStock','Discontinued') for o in ld) or soldm: hold('sold_or_sale_pending',f"avail {[o.get('avail') for o in ld][:2]} text {soldm.group(0) if soldm else None}"); continue
    badges=' '.join((x.get('unitTags') or [])+(x.get('photoBadges') or [])+[str(x.get('lotStatus') or '')])
    if x.get('factoryOrderText') or re.search(r'(?i)on\s*order|available\s+to\s+order|arriving\s+soon|in\s*transit|coming\s+soon|pre-?order',badges): hold('on_order',(x.get('factoryOrderText') or badges)[:100]); continue
    f,q=facts(x); old=u['priceUsd']['value']; fields=[]
    p=f.get('price')
    if not p:
        SL={'sale price','our price','your price','internet price','special price','now','cash price','clearance price','price'}
        vals={pv_ for l,pv_ in (x.get('priceLabels') or []) if l.lower() in SL and pv_ and pv_>=500}
        if len(vals)==1: p=list(vals)[0]; q['price']='single labelled sale/our/internet price on the page'
        elif len(vals)>1: st['several_sale_labelled_prices_price_left']+=1; f['_ambig']=True
    if p and p>=500:
        if old and abs(p-old)/old>0.6: hold('price_conflict_large',f"page own price {p} vs stored {old}"); continue
        if f.get('pageMsrps') and any(abs(m-p)<0.5 for m in f['pageMsrps']): hold('price_unverified',f"page price {p} equals the only MSRP/list shown"); continue
        pp=int(p) if float(p).is_integer() else round(p,2)
        if old!=pp:
            diff.append({'unit_id':uid,'dealer_domain':dom,'field':'priceUsd','old':old,'new':pp,'source_url':url,'fetched_at':ts,'rule':q.get('price','own price')}); per[dom]['price_changed']+=1; fields.append('priceUsd')
        else: per[dom]['price_confirmed']+=1
        u['priceUsd']={'value':pp,'source':'dealer_listing','confidence':'high','note':"Dealer's current price on the unit's own listing page (read 2026-11-02); not MSRP.",'sourceUrl':url,'observedAt':iso(ts)}
    elif not f.get('_ambig'):
        mapish=re.search(r'(?i)\bMAP\b(?:\s*price)?\s*:?\s*\$|unlock\s+(?:your\s+|the\s+)?(?:pricing|price)|see\s+(?:the\s+)?price\s+in\s+cart|get\s+(?:your\s+)?(?:e-?price|internet\s+price)|call\s+for\s+(?:price|pricing)|request\s+(?:a\s+)?(?:price|quote)',vis)
        listonly=[1 for l,pv_ in (x.get('priceLabels') or []) if l.lower() in ('msrp','list price','retail price') and pv_]
        if mapish or listonly: hold('price_unverified',('MAP/unlock/call text: '+mapish.group(0)[:60]) if mapish else 'page shows only MSRP/List Price'); continue
        st['no_price_on_page_price_left']+=1
    if f.get('cond') and u['condition']=='unknown':
        diff.append({'unit_id':uid,'dealer_domain':dom,'field':'condition','old':'unknown','new':f['cond'],'source_url':url,'fetched_at':ts,'rule':q.get('cond','')}); u['condition']=f['cond']; fields.append('condition')
    diff.append({'unit_id':uid,'dealer_domain':dom,'field':'provenance.lastSeenAt','old':old_ls,'new':iso(ts),'source_url':url,'fetched_at':ts,'rule':"unit's own listing page read and live"})
    p_=u['provenance']; p_['lastSeenAt']=iso(ts); p_['listingUrl']=url; p_['lastSeenBasis']='dealer_page_verified'; p_['recheck']={'date':'2026-11-02','listingUrl':url,'fetchedAt':iso(ts),'fields':sorted(fields)}
    per[dom]['refreshed']+=1; st['refreshed']+=1
out=[u for u in units if u['id'] in byid]; hid={h['unit_id'] for h in held}
builtAt=os.environ.get('BUILT_AT') or snap['builtAt']
summary={'in':len(units),'out':len(out),'steps':dict(st),'heldByReason':dict(C.Counter(h['reason'] for h in held)),'perDomain':{k:dict(v) for k,v in per.items()}}
json.dump(summary,open(f'{rep}/gen_summary.json','w'),indent=1)
def wcsv(p,rows,fn):
    with open(p,'w',newline='') as f: w=csv.DictWriter(f,fieldnames=fn); w.writeheader(); w.writerows(rows)
wcsv(f'{rep}/gen_field_changes.csv',[d for d in diff if d['unit_id'] not in hid],['unit_id','dealer_domain','field','old','new','source_url','fetched_at','rule'])
wcsv(f'{rep}/gen_removed_or_held.csv',held,['unit_id','dealer_domain','title','vin','stock','rvType','price','reason','source_url','fetched_at','note'])
print(json.dumps({k:v for k,v in summary.items() if k!='perDomain'},indent=1))
if DRY: sys.exit(0)
s=dict(snap['stats'])
hdr={'schemaVersion':snap['schemaVersion'],'builtAt':snap['builtAt'],'datasetNote':snap['datasetNote'],'stats':s,'units':[]}
h=json.dumps(hdr,ensure_ascii=True,separators=(',',':'))
with gzip.open(dst+'.tmp','wb',compresslevel=9) as f:
    f.write(h[:-2].encode('ascii'))
    for i,u in enumerate(out): f.write((b',' if i else b'')+json.dumps(u,ensure_ascii=True,separators=(',',':')).encode('ascii'))
    f.write(b']}')
os.replace(dst+'.tmp',dst)
