# wa_universe.py <final_snapshot.gz> <outdir>: classify each curated WA dealer (wa/master_seed.py) as covered_before / added_now / uncovered(reason)
import json,gzip,sys,csv,collections,re
sys.path.insert(0,'wa'); from master_seed import D
snap=json.load(gzip.open(sys.argv[1])); out=sys.argv[2]
base=json.load(gzip.open('out_t1/base_69.snapshot.json.gz'))
def wa(s):
    c=collections.Counter()
    for u in s['units']:
        d=u.get('dealer') or {}
        if d.get('state')=='WA': c[(u.get('provenance') or {}).get('dealerDomain') or '']+=1
    return c
B=wa(base); A=wa(snap); del snap,base
R={ # reason, detail
 'nx':('no_website','domain does not resolve (NXDOMAIN via public DNS)'),
 'robots403':('robots_disallow','robots.txt returns 403 (treated as disallow)'),
 'home403':('bot_wall','homepage returns 403 to automated requests; not bypassed'),
 'wall':('bot_wall','bot wall / 403 during unit fetch; stopped, not bypassed'),
 'tls':('tls_invalid','site serves an invalid/mismatched TLS certificate; not bypassed'),
 'conn':('site_unreachable','DNS resolves but connection fails/times out'),
 'nostruct':('no_structured_listing_data','unit pages lack dealer-stated structured make/type/price fields we can use facts-only'),
 'noinv':('no_online_inventory','no individual unit listing pages found on site'),
 'cso':('cso_holdback','harvested but held pending CSO QA (prior parse errors)'),
 'notrv':('not_rv_dealer','cargo/utility trailers, not RVs'),
 'nosite':('no_website','no website found in public sources'),
 'oos':('wa_lots_none','site inventory is out-of-state lots only'),
 'zero':('harvested_no_eligible_wa_units','fetched, but no WA unit passed facts-only rules (untyped/unpriced/out-of-state)'),
 'redir':('merged_into_covered','domain redirects to an already-covered dealer'),
 'notype':('no_dealer_stated_rv_type','listing pages state no RV type/class anywhere; facts-only rule forbids inferring it'),
 'lot':('lot_not_stated','dealer has 2 lots (Aberdeen/Olympia) and unit pages do not say which lot holds the unit'),
 'cfwall':('bot_wall','homepage, /inventory and sitemap return a Cloudflare JS challenge (cf-mitigated: challenge); not bypassed'),
 'cl':('no_website','no dealer website (domain NXDOMAIN); inventory only on Craigslist, which we do not scrape'),
 'oob':('out_of_business','business closed (BBB/out of business or domain now points to an unrelated business)'),
 'merged':('merged_into_covered','location/business now operated by an already-covered dealer'),
 'notwa':('not_wa_dealer','domain belongs to an out-of-state business, not the WA dealer'),
 'fb':('no_website','no website; sells via Facebook Marketplace only'),
 'parked':('no_website','domain is parked or lapsed (parking page / unrelated site)'),
 'broker':('no_structured_listing_data','consignment broker for private-party RVs (kept at owners\' homes); listings have no VIN, stock # or stated type'),
 'tlsdrop':('site_unreachable','site edge drops our TLS connection (all requests); not routed through third-party crawlers'),
 'tlsfail':('site_unreachable','TLS handshake fails / server errors from every fetcher tried'),
 'under':('under_covered','covered but snapshot holds far fewer WA units than the dealer lists (MC count shown)'),
}
X={'discountrvwa.com':'nx','automatchsales.com':'nx','countrywestrv.com':'nx','mikiysrv.com':'nx','standalrv.com':'nx','nwtruckandrv.com':'nx',
 'gablesrv.com':'nx','interstatervofspokane.com':'nx','globalrvinc.com':'nx','lynnwoodrv.com':'nx','jetsetrv.com':'nx','seattledreamrv.com':'nx',
 'randrrv.com':'nx','phoenixautosalesandrvs.com':'nx','thescoutrv.com':'nx','olympiaautomall.net':'nx','cleangreencars.com':'conn','a1rvrecyclingandsales.com':'noinv',
 'airwayrv.com':'conn','asrvparts.com':'conn','airwayheightsrv.com':'conn','rvtown.com':'conn','freedomrvusa.com':'conn',
 'allseasonsrvsales.com':'robots403','emeraldtownwa.com':'robots403','drivegrand.com':'robots403','i5rvs.com':'robots403','kentrv.com':'robots403','boykomotors.com':'robots403',
 'suncityrv.com':'home403','travelandrvmarine.com':'home403','ryansellsrvs.com':'home403','lithiarvspokane.com':'wall','johnsonrv.com':'wall','hudsonautocenter.com':'wall',
 'awesomerv.com':'tls','5startruckandrv.com':'nostruct','mikesrvsales.com':'nostruct','uzedrvs4u.com':'nostruct','anniesrvs.com':'nostruct','sundance-rv-center.com':'nostruct',
 'qualityrvsales.com':'nostruct','pacifictravelcenter.com':'nostruct','northwestvan.com':'nostruct','rivertrailrv.com':'nostruct','treelinevans.com':'nostruct',
 'valleyrvsupercenter.com':'cso','wilderrvs.com':'cso','trailerboss.com':'notrv','aubreysrv.com':'noinv','westgatehomes.com':'noinv','pnwautosales.net':'noinv',
 'goodguysrv.com':'noinv','wheatlandrv.com':'noinv','bigbearrvs.com':'noinv','warnerautorv.rocks':'noinv','fivecornersrv.com':'noinv','wilderaffordablehomes.com':'noinv',
 'rrvsales.com':'noinv','rvstacoma.com':'noinv','lowpricerv.com':'noinv','vanberry.us':'noinv','scallywagon.com':'noinv','bluedogrvpasco.com':'redir',
 'selkirkrv.com':'oos','truckcityrv.com':'cfwall','discountrvwa.com':'cl','freedomrvusa.com':'merged','olympiaautomall.net':'merged',
 'globalrvinc.com':'notwa','automatchsales.com':'fb','uneekrv.com':'parked','dlsrv.com':'parked','cleangreencars.com':'parked','sellmyrvwa.com':'broker',
 'airwayrv.com':'tlsdrop','airwayheightsrv.com':'tlsdrop','asrvparts.com':'tlsdrop','rvtown.com':'tlsfail','rebornrv.com':'tlsfail','campstarsrv.com':'conn',
 'haltermansrv.com':'oob','royrobinsonrv.com':'merged','thecarstars.com':'lot','camperschoicerv.com':'zero','scottsrvvancouver.com':'zero','qualityrvllc.com':'notype','basinrvmoseslake.com':'notype',
 'fifervcenter.com':'zero','rnrrv.com':'zero','bretzrv.com':'zero'}
XN={'High Country RV & Auto Sales':'oob'}
MC=json.load(open('mc/wa_facets.json')) if True else {}
mcc={}
def grab(o):
    if isinstance(o,dict):
        for k,v in o.items():
            if k=='source' and isinstance(v,list):
                for e in v:
                    if isinstance(e,dict) and 'item' in e: mcc[e['item'].replace('www.','')]=e.get('count')
            else: grab(v)
    elif isinstance(o,list):
        for e in o: grab(e)
grab(MC)
rows=[];st=collections.Counter()
for name,city,dom,src in D:
    b=B.get(dom,0); a=A.get(dom,0)
    if b>0 and not (dom=='awesomerv.com'): status='covered_before'
    elif a>b: status='added_now'
    elif dom=='awesomerv.com': status='uncovered'
    else: status='uncovered'
    reason,detail='',''
    if status=='uncovered':
        k=X.get(dom) or XN.get(name) or ('nosite' if not dom else 'noinv'); reason,detail=R[k]
    rows.append(dict(name=name,city=city,domain=dom,sources=src,status=status,wa_units_before=b,wa_units_after=a,mc_wa_listings=mcc.get(dom,''),reason=reason,detail=detail))
    st[status]+=1
# under-covered covered dealers (big MC gap)
for r in rows:
    if r['status']=='covered_before' and r['mc_wa_listings'] and int(r['mc_wa_listings'])>=3*max(1,r['wa_units_after'])+50:
        r['reason'],r['detail']=R['under']
F=list(rows[0].keys())
with open(out+'/wa_dealers_all.csv','w',newline='') as f:
    w=csv.DictWriter(f,F); w.writeheader(); w.writerows(rows)
with open(out+'/wa_dealers_uncovered.csv','w',newline='') as f:
    w=csv.DictWriter(f,F); w.writeheader(); w.writerows([r for r in rows if r['status']=='uncovered' or r['reason']=='under_covered'])
rc=collections.Counter(r['reason'] for r in rows if r['status']=='uncovered')
print(json.dumps(dict(known=len(rows),status=st,uncovered_reasons=rc,under_covered=[(r['domain'],r['wa_units_after'],r['mc_wa_listings']) for r in rows if r['reason']=='under_covered'],
  added=[(r['domain'],r['wa_units_after']) for r in rows if r['status']=='added_now']),indent=1))
