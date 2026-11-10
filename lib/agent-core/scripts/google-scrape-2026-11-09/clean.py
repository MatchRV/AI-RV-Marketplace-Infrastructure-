"""Clean + dedupe the 2026-11-09 Google scrape (run scaled-1) into an import candidate. Read-only vs live.
Rules mirror lib/agent-core/scripts/build-harvest-snapshot.ts + normalize.ts admission and prep_new.py dedupe."""
import json, glob, gzip, re, collections, csv, subprocess, os, sys
R = '/workspace/google-scraper-pilot'; OUT = f'{R}/import-candidate'; W = f'{OUT}/work'
SNAP = '/workspace/ro-main-latest/lib/agent-core/data/inventory.snapshot.json.gz'
bare = lambda d: re.sub(r'/.*$', '', re.sub(r'^www\.', '', re.sub(r'^https?://', '', (d or '').lower().strip())))
def nurl(u):
    u = (u or '').strip().lower(); u = re.sub(r'^https?://', '', u); u = re.sub(r'^www\.', '', u); u = u.split('#')[0]
    return u.rstrip('/')
def vin_ok(v): return bool(v) and len(v) == 17 and re.match(r'^[A-HJ-NPR-Z0-9]{17}$', v) and re.search(r'\d', v) and v[-4:].isdigit()

# ---------- live snapshot (== deployed: units count equals /api/listings total) ----------
snap = json.load(gzip.open(SNAP))
live = snap['units']
LV = {u['vin'].upper() for u in live if u.get('vin')}
LS = {(bare(u['provenance'].get('dealerDomain') or u['dealer'].get('website')), str(u['stockNumber']).strip().lower()) for u in live if u.get('stockNumber')}
LU = set()
for u in live:
    lu = u['provenance'].get('listingUrl') or (u['id'][6:] if u['id'].startswith('key:u:') else None)
    if lu: LU.add(nurl(lu))
live_domains = collections.Counter(bare(u['provenance'].get('dealerDomain') or u['dealer'].get('website')) for u in live)
live_make_case = collections.defaultdict(collections.Counter)
live_model_case = collections.defaultdict(collections.Counter)
for u in live:
    if u.get('make'): live_make_case[u['make'].lower().strip()][u['make']] += 1
    if u.get('model'): live_model_case[(u['make'] or '').lower(), u['model'].lower().strip()][u['model']] += 1
STATES = set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split())
live_city = collections.defaultdict(set)
for u in live:
    if u['dealer'].get('city'): live_city[bare(u['provenance'].get('dealerDomain') or u['dealer'].get('website'))].add((u['dealer']['city'], u['dealer']['state']))
live_city = {d: {c for c, s in v} for d, v in live_city.items()}
HOLDBACK = {'valleyrvsupercenter.com', 'atozrvs.com', 'wilderrvs.com'}  # build-harvest-snapshot HOLDBACK_DOMAINS default
HELD = set(json.load(open('/workspace/ro-main-latest/lib/agent-core/data/held-dealer-domains.json'))['domains'])

# ---------- dealer-level source exclusions (verified on each site's own homepage 2026-11-09 ~11:45 PM PT) ----------
SOURCE_EXCLUDE = {
    'dreamfindersrv.com': 'by_owner_site: title "Motorhomes For Sale By Owner"; "RVs for sale by Private Sellers"',
    'theregistryllc.com': 'private_seller_marketplace: "exceptional vehicles, RVs, classics, boats, aircraft ... from private sellers nationwide"',
}
SOURCE_REVIEW = {  # rental fleets / consignment-only lots: held for owner review, not imported in this batch
    'journeyusarv.com': 'rental_fleet: "RV Rentals Tampa"; "most of our fleet is owner-consigned"',
    'stressfreervs.com': 'rental_fleet: "RV & Travel Trailer Rentals San Diego"; P2P/consignment',
    'rentforfun.com': 'rental_fleet: "Boise RV Rentals, Repair, Parts & Sales"; consignment sales',
    '84rv.com': 'rental_fleet: "84 RV Rentals & Service"',
    'free2uyuma.com': 'consignment_car_lot: "FREE 2 U Consignments | Cars For Sale"',
    'milacaunclaimedfreight.com': 'surplus/furniture store (Ice Castle fish-house dealer)',
}

# ---------- type rules (normalize.ts normalizeRvType port + build NON_RV) ----------
CANON = {'toy_hauler', 'fifth_wheel', 'travel_trailer', 'class_a', 'class_b', 'class_c', 'popup_camper', 'truck_camper'}
def norm_type(t, title):
    for raw in [t or '', title or '']:
        x = raw.lower().strip()
        if not x or x in ('unknown', 'other', 'rv', 'park model'): continue
        if x in CANON: return x
        if 'toy hauler' in x: return 'toy_hauler'
        if 'fifth wheel' in x or '5th wheel' in x: return 'fifth_wheel'
        if 'travel trailer' in x or 'destination trailer' in x or x == 'destination': return 'travel_trailer'
        if 'class a' in x or 'diesel pusher' in x: return 'class_a'
        if 'class b' in x: return 'class_b'
        if 'class c' in x or 'super c' in x: return 'class_c'
        if any(k in x for k in ('popup', 'pop-up', 'pop up', 'folding', 'tent trailer')): return 'popup_camper'
        if 'truck camper' in x: return 'truck_camper'
        if 'motorhome' in x or 'motor home' in x: return 'class_a'
    return None
URL_TYPE = [(r'fifth[-_ ]?wheel|5th[-_ ]?wheel', 'fifth_wheel'), (r'toy[-_ ]?hauler', 'toy_hauler'), (r'travel[-_ ]?trailer', 'travel_trailer'),
            (r'class[-_ ]?a(?![a-z])', 'class_a'), (r'class[-_ ]?b(?![a-z])', 'class_b'), (r'class[-_ ]?c(?![a-z])', 'class_c'),
            (r'truck[-_ ]?camper', 'truck_camper'), (r'pop[-_ ]?up|folding[-_ ]?camper|tent[-_ ]?trailer', 'popup_camper')]
def url_type(u):
    for rx, t in URL_TYPE:
        if u and re.search(rx, u, re.I): return t
    return None
NON_RV = re.compile(r"\b(cargo|utility|enclosed trailer|enclosed|car hauler|dump trailer|dump|flatbed|flat deck|deckover|equipment trailer|landscape|horse trailer|horse|livestock|stock trailer|stock combo|showcattle|boat|pontoon|fishing boat|jet ?ski|atv|utv|side[- ]by[- ]side|motorcycle|golf ca(r|rt)|snowmobile|tractor|mower|gooseneck flatbed|tilt deck|tilt trailer|concession|vending|food truck|dump body|truck bed|suv|sedan|pickup|hatchback|park model|park trailer|tiny home|tiny house|fish house|ice house|ice fishing|cottage|cabin)\b", re.I)
RV_WORDS = re.compile(r"\b(travel trailer|fifth wheel|5th wheel|toy hauler|motorhome|motor home|class [abc]|camper|bunkhouse)\b", re.I)
CAR_MAKES = {'cadillac','chevrolet','chevy','toyota','honda','nissan','hyundai','kia','bmw','audi','lexus','dodge','jeep','gmc','buick','chrysler','subaru','mazda','volkswagen','tesla','lincoln','acura','infiniti','yamaha','polaris','can-am','lund','princecraft','denago ev','harley-davidson','kawasaki','suzuki'}
CHASSIS_MAKES = {'ford','mercedes','mercedes-benz','ram','freightliner','chevrolet','chevy','gmc','dodge','international','spartan'}  # motorized RVs listed under chassis make

# ---------- load scrape ----------
U = []
for f in sorted(glob.glob(f'{R}/results/scaled-1/units/*.jsonl')):
    for l in open(f): U.append(json.loads(l))
dmeta = {d['domain']: d for d in json.load(open(f'{R}/dealers_scaled.json'))}
print('scraped units', len(U), file=sys.stderr)

# ---------- make canonicalization (brands.ts canonicalBrand/brandFromTitle via node) ----------
def raw_title(u): return ' '.join(str(x) for x in [u.get('year'), u.get('make'), u.get('model'), u.get('trim')] if x)
pairs = list({(u.get('make') or '', raw_title(u)) for u in U})
bm = json.loads(subprocess.run(['node', f'{W}/brandmap.mjs'], input=json.dumps(pairs), capture_output=True, text=True, check=True).stdout)
def tidy_case(s):
    s = re.sub(r'\s+', ' ', s).strip()
    if s.isupper() and re.search(r'[A-Z]{4,}', s):
        s = ' '.join(w if (re.search(r'\d', w) or len(w) <= 3) else w.capitalize() for w in s.split(' '))
    return s
STRIP_SUFFIX = re.compile(r'\s+(rv|rvs|rv inc|trailers|trailer|campers|mfg|manufacturing|inc\.?|llc)$', re.I)
make_changes = collections.Counter()
def canon_make(u):
    raw = (u.get('make') or '').strip()
    cb, tb = bm[raw + '\u0001' + raw_title(u)]
    if cb: return cb, 'brands_table'
    if not raw or re.fullmatch(r'(?i)unknown|n/?a|other|none|-', raw): return None, 'unknown'
    k = re.sub(r'\s+', ' ', raw.lower())
    for cand in (k, STRIP_SUFFIX.sub('', k)):
        if cand in live_make_case:
            vs = [v for v, _ in live_make_case[cand].most_common() if not v.isupper() or len(v) <= 4]
            return (vs[0] if vs else tidy_case(live_make_case[cand].most_common(1)[0][0])), 'live_spelling'
    return tidy_case(raw), 'case_tidy'

def canon_model(make, model):
    m = re.sub(r'\s+', ' ', (model or '')).strip()
    if make and m.lower().startswith(make.lower() + ' '): m = m[len(make) + 1:]
    c = live_model_case.get(((make or '').lower(), m.lower()))
    if c: return c.most_common(1)[0][0]
    return tidy_case(m)

def city_of(u):
    if u.get('dealer_city'): return u['dealer_city'].strip(), 'dealer_city'
    loc = (u.get('location') or '').strip()
    m = re.match(r"^([A-Za-z .'\-]+),\s*([A-Za-z]{2}|[A-Za-z ]+)\b", loc)
    if m and len(m.group(1)) <= 40 and not re.search(r'\d', m.group(1)): return m.group(1).strip().title() if m.group(1).isupper() else m.group(1).strip(), 'location'
    loc2 = re.sub(r'\s*\(.*?\)', '', loc).strip()
    if re.fullmatch(r"[A-Za-z .'\-]{3,30}", loc2) and not re.search(r'(?i)\b(rv|rvs|center|sales|camper|campers|motors?|trailers?|inc|llc|marine|superstore|lot|dealer)\b', loc2) and loc2.upper() not in STATES:
        return (loc2.title() if loc2.isupper() else loc2), 'location_city_only'
    lc = live_city.get(bare(u['domain']))
    if lc and len(lc) == 1: return next(iter(lc)), 'live_dealer_city'
    dm = dmeta.get(u['domain']) or {}
    if dm.get('city'): return dm['city'], 'dealer_list'
    return None, None

reasons = collections.Counter(); sub = collections.Counter()
excl_rows = []; kept = []
def X(u, cat, why):
    reasons[cat] += 1; sub[f'{cat}:{why}'] += 1
    excl_rows.append([cat, why, u['domain'], u.get('dealer_state'), u.get('year'), u.get('make'), u.get('model'), u.get('rv_type'), u.get('vin'), u.get('stock_number'), u.get('price_usd'), u.get('url')])

for u in U:
    dom = bare(u['domain'])
    if dom in SOURCE_EXCLUDE: X(u, 'non_dealer_source', SOURCE_EXCLUDE[dom].split(':')[0]); continue
    if dom in SOURCE_REVIEW: X(u, 'held_source_review', SOURCE_REVIEW[dom].split(':')[0]); continue
    t_raw = u.get('rv_type') or ''
    txt = f"{t_raw} {u.get('model') or ''} {u.get('trim') or ''}"
    if NON_RV.search(txt) and not RV_WORDS.search(t_raw): X(u, 'non_rv', 'type/model names non-RV: ' + NON_RV.search(txt).group(0).lower()); continue
    if (u.get('make') or '').strip().lower() in CAR_MAKES and not RV_WORDS.search(t_raw): X(u, 'non_rv', 'car/powersports/boat make'); continue
    make, mvia = canon_make(u)
    if not make: X(u, 'unknown_make', 'make missing/Unknown'); continue
    if make.lower() in CHASSIS_MAKES and not RV_WORDS.search(t_raw) and not re.search(r'(?i)class|van|camper', t_raw): X(u, 'non_rv', 'chassis/vehicle make without RV type'); continue
    if mvia != 'brands_table' and make != (u.get('make') or '').strip(): make_changes[f"{u.get('make')} -> {make}"] += 1
    elif mvia == 'brands_table' and make != (u.get('make') or '').strip(): make_changes[f"{u.get('make')} -> {make}"] += 1
    model = canon_model(make, u.get('model'))
    if not model or re.fullmatch(r'(?i)unknown|other|n/?a', model): X(u, 'invalid', 'no_model'); continue
    y = u.get('year')
    if not isinstance(y, int) or not (1990 <= y <= 2028): X(u, 'invalid', 'missing_or_invalid_year'); continue
    title = f"{y} {make} {model}" + (f" {u['trim']}" if u.get('trim') else '')
    rvt = norm_type(t_raw, '') or url_type(u.get('url'))
    if not rvt: X(u, 'invalid', 'no_dealer_stated_rv_type'); continue
    cond = (u.get('condition') or '').lower()
    if cond not in ('new', 'used'): X(u, 'invalid', 'no_dealer_condition'); continue
    st = (u.get('status') or 'unknown')
    if st in ('sold', 'sale_pending', 'on_order'): X(u, 'invalid', f'status_{st}'); continue
    if re.match(r'(?i)^ord(er)?\b|^ord\d', str(u.get('stock_number') or '')): X(u, 'invalid', 'factory_order_stock'); continue
    url = (u.get('url') or '').strip()
    if not re.match(r'^https?://', url): X(u, 'invalid', 'no_listing_url'); continue
    if bare(url) != dom and not bare(url).endswith('.' + dom): X(u, 'invalid', 'url_off_dealer_domain'); continue
    if nurl(url) in {nurl(u.get('source_page')), nurl('https://' + dom)}: X(u, 'invalid', 'url_is_results_page_not_unit'); continue
    vin = (u.get('vin') or '').strip().upper() or None
    vin_blanked = False
    if vin and not vin_ok(vin): vin = None; vin_blanked = True
    stock = (str(u.get('stock_number')).strip() if u.get('stock_number') else None) or None
    if not vin and not stock: X(u, 'invalid', 'no_vin_or_stock'); continue
    city, cvia = city_of(u)
    state = (u.get('dealer_state') or '').upper()
    if not city or len(state) != 2: X(u, 'invalid', 'no_dealer_location'); continue
    price = u.get('price_usd')
    price_ok = isinstance(price, (int, float)) and 1000 <= price <= 2_000_000 and not u.get('price_flag')
    kept.append(dict(src=u, dom=dom, make=make, model=model, year=y, title=title, rvt=rvt, cond=cond, vin=vin, vin_blanked=vin_blanked,
                     stock=stock, url=url, city=city, cvia=cvia, state=state, price=price if price_ok else None,
                     msrp=u.get('msrp_usd') if isinstance(u.get('msrp_usd'), (int, float)) and u['msrp_usd'] >= 1000 else None))

# ---------- internal dedupe: VIN, then domain+stock, then URL; keep priced / most complete ----------
def score(k): return (k['price'] is not None, k['vin'] is not None, bool(k['src'].get('trim')), k['src']['seen_at'])
kept.sort(key=score, reverse=True)
seenV, seenS, seenU, uniq = set(), set(), set(), []
for k in kept:
    keys = [('v', k['vin'])] if k['vin'] else []
    if k['stock']: keys.append(('s', (k['dom'], k['stock'].lower())))
    keys.append(('u', nurl(k['url'])))
    hit = next((kk for kk in keys if kk in (seenV if kk[0]=='v' else seenS if kk[0]=='s' else seenU)), None)
    if hit: X(k['src'], 'internal_dupe', {'v': 'same_vin', 's': 'same_dealer_stock', 'u': 'same_url'}[hit[0]]); continue
    for kk in keys: (seenV if kk[0]=='v' else seenS if kk[0]=='s' else seenU).add(kk)
    uniq.append(k)

# ---------- dedupe vs live (VIN -> domain+stock -> URL) ----------
net = []
for k in uniq:
    if k['vin'] and k['vin'] in LV: X(k['src'], 'dupe_vs_live', 'vin'); continue
    if k['stock'] and (k['dom'], k['stock'].lower()) in LS: X(k['src'], 'dupe_vs_live', 'dealer_domain+stock'); continue
    if nurl(k['url']) in LU: X(k['src'], 'dupe_vs_live', 'listing_url'); continue
    if k['dom'] in HOLDBACK: X(k['src'], 'held_repo_rule', 'HOLDBACK_DOMAINS (parser unreliable)'); continue
    if k['dom'] in HELD: X(k['src'], 'held_repo_rule', 'held-dealer-domains.json (CSO 2026-11-02: no sale price on own unit pages)'); continue
    net.append(k)

# ---------- write outputs ----------
def raw_row(k):
    u = k['src']
    return {"dealer_name": (u.get('dealer') or (dmeta.get(u['domain']) or {}).get('dealer') or k['dom']).strip(),
            "dealer_domain": k['dom'], "dealer_location": f"{k['city']}, {k['state']}",
            "scraped_at": u['seen_at'], "last_seen_at": u['seen_at'], "inventory_status": "available" if u.get('status') == 'available' else 'unknown',
            "condition": k['cond'], "year": k['year'], "make": k['make'], "model": k['model'], "trim": u.get('trim'), "title": k['title'],
            "stock_number": k['stock'], "vin": k['vin'], "rv_type": k['rvt'], "price": k['price'], "msrp": k['msrp'],
            "image_urls": [], "url": k['url'],
            "_meta": {"origin": "google_cloud_scrape_2026-11-09_scaled-1", "harvest_method": "dealer_website_listpage_gemini_3.1_flash_lite",
                      "listing_url": k['url'], "harvested_at": u['seen_at'], "page_title": k['title'],
                      "price_basis": "listpage_sale_price_2026_11_09" if k['price'] is not None else None, "last_seen_basis": "harvested_at",
                      "source_page": u.get('source_page'), "raw_make": u.get('make'), "raw_rv_type": u.get('rv_type'), "price_label": u.get('price_label'),
                      "vin_blanked_invalid": k['vin_blanked'], "city_source": k['cvia'],
                      "dealer": {"name": (u.get('dealer') or (dmeta.get(u['domain']) or {}).get('dealer') or k['dom']).strip(), "city": k['city'], "state": k['state'], "lat": None, "lng": None, "domain": k['dom']}}}
with open(f'{OUT}/import_candidate_rows.ndjson', 'w') as f:
    for k in net: f.write(json.dumps(raw_row(k)) + '\n')
with open(f'{OUT}/excluded_units.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['category', 'reason', 'domain', 'state', 'year', 'make', 'model', 'rv_type', 'vin', 'stock', 'price_usd', 'url']); w.writerows(excl_rows)
with open(f'{OUT}/make_normalization.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['raw_make -> canonical', 'units']); w.writerows(sorted(make_changes.items(), key=lambda x: -x[1]))
# dealers
byd = collections.defaultdict(list)
for k in net: byd[k['dom']].append(k)
with open(f'{OUT}/net_new_by_dealer.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['domain', 'dealer', 'city', 'state', 'net_new_units', 'with_price', 'already_live_dealer_units', 'new_dealer'])
    for d, ks in sorted(byd.items(), key=lambda x: -len(x[1])):
        w.writerow([d, raw_row(ks[0])['dealer_name'], ks[0]['city'], ks[0]['state'], len(ks), sum(1 for k in ks if k['price'] is not None), live_domains.get(d, 0), live_domains.get(d, 0) == 0])
excl_dealers = []
for d, why in {**SOURCE_EXCLUDE, **SOURCE_REVIEW}.items():
    n = sum(1 for u in U if bare(u['domain']) == d); excl_dealers.append((d, n, why))
nonrv_by_dom = collections.Counter(r[2] for r in excl_rows if r[0] == 'non_rv')
tot_by_dom = collections.Counter(bare(u['domain']) for u in U)
priced = [k for k in net if k['price'] is not None]
new_dealers = {d for d in byd if live_domains.get(d, 0) == 0}
summary = {
  "generated_pt": subprocess.run(['date', '+%Y-%m-%d %I:%M %p %Z'], capture_output=True, text=True).stdout.strip(),
  "live_snapshot": {"builtAt": snap['builtAt'], "units": len(live), "dealers": snap['stats']['dealers'], "source": "origin/main 25630ad lib/agent-core/data/inventory.snapshot.json.gz"},
  "scraped_units": len(U), "scraped_dealers_ok": len(tot_by_dom),
  "removed": dict(reasons), "removed_detail": dict(sorted(sub.items(), key=lambda x: -x[1])),
  "net_new_units": len(net), "net_new_with_dealer_sale_price": len(priced), "net_new_no_price": len(net) - len(priced),
  "net_new_with_valid_vin": sum(1 for k in net if k['vin']),
  "net_new_dealers_total": len(byd), "net_new_dealers_not_in_live": len(new_dealers),
  "net_new_units_from_dealers_not_in_live": sum(len(byd[d]) for d in new_dealers),
  "net_new_by_state": dict(collections.Counter(k['state'] for k in net).most_common()),
  "net_new_priced_by_state": dict(collections.Counter(k['state'] for k in priced).most_common()),
  "new_dealers_by_state": dict(collections.Counter(byd[d][0]['state'] for d in new_dealers).most_common()),
  "net_new_by_type": dict(collections.Counter(k['rvt'] for k in net).most_common()),
  "net_new_condition": dict(collections.Counter(k['cond'] for k in net)),
  "excluded_sources": [{"domain": d, "units": n, "why": w} for d, n, w in excl_dealers],
  "mostly_non_rv_dealers": [{"domain": d, "non_rv_units": n, "of": tot_by_dom[d]} for d, n in nonrv_by_dom.most_common(25)],
  "top_make_changes": make_changes.most_common(30),
}
json.dump(summary, open(f'{OUT}/summary.json', 'w'), indent=1)
print(json.dumps({k: v for k, v in summary.items() if k not in ('removed_detail', 'top_make_changes', 'mostly_non_rv_dealers')}, indent=1))
