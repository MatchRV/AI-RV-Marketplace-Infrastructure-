"""Photo/own-page pass, step 3: choose each unit's own photos, apply page outcomes, review live collisions, write build input."""
import json, gzip, re, collections, csv, urllib.parse, os
D = '/workspace/google-scraper-pilot/import-candidate'; P = f'{D}/photopass'
SNAP = '/workspace/ro-main-latest/lib/agent-core/data/inventory.snapshot.json.gz'
bare = lambda d: re.sub(r'/.*$', '', re.sub(r'^www\.', '', re.sub(r'^https?://', '', (d or '').lower())))
an = lambda s: re.sub(r'[^a-z0-9]', '', str(s or '').lower())
nurl = lambda u: re.sub(r'^www\.', '', re.sub(r'^https?://', '', (u or '').strip().lower())).split('#')[0].rstrip('/')
BUILD_OK = re.compile(r'^https://.*\.(jpe?g|png|webp)(\?|$)', re.I)
FLOOR = re.compile(r'(?i)(floor[-_ ]?plan|floorplan|/fp_|tech[-_]?drawing|unit_tech_drawing|_fp[._]|-fp[._])')
THUMB = re.compile(r'(?i)(/thumbnail/|/thumbs?/|_thumb|-thumb|/small/|-\d{2,3}x\d{2,3}\.)')
rows = [json.loads(l) for l in open(f'{D}/import_candidate_rows.ndjson')]
fname = lambda i: urllib.parse.urlsplit(i).netloc + urllib.parse.urlsplit(i).path.lower()
parsed = {}
for l in open(f'{P}/parsed.ndjson'):
    x = json.loads(l); parsed[x['url']] = x
# site-wide images: same URL on >=3 different units of one domain
freq = collections.defaultdict(collections.Counter)
for x in parsed.values():
    for i in set(x.get('images_all', [])): freq[x['domain']][i] += 1
def banner(u):
    m = re.search(r'(?i)(\d{2,4})x(\d{2,4})', u.rsplit('/', 1)[-1])
    return bool(m) and (int(m.group(1)) > 2.5 * int(m.group(2)) or int(m.group(2)) > 2.5 * int(m.group(1)))
def ddir(u): p = urllib.parse.urlsplit(u); return p.netloc + re.sub(r'/(thumbnail|thumbs?|small|medium|large)/', '/', p.path.rsplit('/', 1)[0] + '/')
def pick(r, x):
    common = {i for i, n in freq[r['dealer_domain']].items() if n >= 3}
    c = [(i, s) for i, s in zip(x.get('images_all', []), x.get('img_src', [])) if i not in common and BUILD_OK.search(i) and '/common/' not in i and not banner(i)]
    if not c: return [], 'none'
    anchor = next((i for i, s in c if s in ('jsonld', 'og', 'twitter') and not FLOOR.search(i)), None)
    toks = {an(t) for t in [r.get('stock_number'), r.get('vin')] if t and len(an(t)) >= 3}
    toks |= {t for t in re.findall(r'\d{4,}', urllib.parse.urlsplit(r['url']).path) if not re.fullmatch(r'(19|20)\d\d', t)}
    how = None
    if anchor:
        ad = ddir(anchor); sel = [i for i, _ in c if ddir(i) == ad]; how = 'anchor_dir'
        if len(sel) <= 1:
            sel = list(dict.fromkeys([anchor] + [i for i, _ in c if any(t in an(i) for t in toks)])); how = 'anchor+id'
    else:
        sel = [i for i, _ in c if any(t in an(i) for t in toks)]; how = 'id_in_url'
        if not sel:
            dirs = collections.Counter(ddir(i) for i, _ in c if not FLOOR.search(i))
            if dirs and dirs.most_common(1)[0][1] >= 2:
                top = dirs.most_common(1)[0][0]; sel = [i for i, _ in c if ddir(i) == top]; how = 'dominant_dir'
    # de-thumb, photos before floor plans
    full = [i for i in sel if not THUMB.search(i)]
    sel = full or sel
    seen = set(); out = []
    for i in sorted(sel, key=lambda i: bool(FLOOR.search(i))):
        k = re.sub(r'(\?.*$)', '', i.rsplit('/', 1)[-1]).lower()
        if k in seen: continue
        seen.add(k); out.append(i)
    return out[:5], how

# ---------- live index for collision review ----------
live = json.load(gzip.open(SNAP))['units']
LV = {u['vin'].upper(): u for u in live if u.get('vin')}
LYM = collections.defaultdict(list); LURL = {}
for u in live:
    d = bare(u['provenance'].get('dealerDomain') or u['dealer'].get('website'))
    LYM[(d, u['year'], an(u['model']), an(u.get('trim') or u.get('floorplanCode')))].append(u)
    lu = u['provenance'].get('listingUrl')
    if lu: LURL[nurl(lu)] = u

PICK = {}
selfreq = collections.defaultdict(collections.Counter)
for r in rows:
    x = parsed.get(r['url'])
    if x and x['outcome'] == 'ok':
        PICK[r['url']] = pick(r, x)
        for i in set(PICK[r['url']][0]): selfreq[r['dealer_domain']][fname(i)] += 1
C = collections.Counter(); hows = collections.Counter(); out_rows = []; drops = []; coll = []
for r in rows:
    x = parsed.get(r['url'], {'outcome': 'not_parsed'})
    o = x['outcome']
    def drop(why, ev=''): C[why] += 1; drops.append([why, r['dealer_domain'], r['_meta']['dealer']['state'], r['title'], r.get('stock_number'), r.get('vin'), r.get('price'), r['url'], ev])
    if o != 'ok':
        drop({'sold_or_pending': 'sold_or_pending', 'dead_page_gone': 'dead_page', 'dead_redirected': 'dead_page', 'unit_not_on_page': 'dead_page',
              'blocked_robots': 'blocked', 'blocked_http': 'blocked', 'blocked_bot_wall': 'blocked', 'fetch_error': 'fetch_error', 'empty_page': 'dead_page', 'not_fetched': 'fetch_error', 'not_parsed': 'fetch_error'}.get(o, o), f"{o} {x.get('sold') or x.get('http') or x.get('detail') or ''}")
        continue
    r = json.loads(json.dumps(r))
    # VIN from the unit's own page (exactly one valid VIN on the page)
    pv = x.get('page_vins') or []
    if not r.get('vin') and len(pv) == 1: r['vin'] = pv[0]; r['_meta']['vin_from_own_page'] = True; C['vin_filled_from_own_page'] += 1
    if r.get('vin') and r['vin'].upper() in LV: drop('dupe_vs_live', 'vin (confirmed on own page)'); continue
    fin = x.get('final') or r['url']
    if nurl(fin) in LURL: drop('dupe_vs_live', 'final listing url'); continue
    # collision review: same dealer + year + model + trim as a live unit
    k = (r['dealer_domain'], r['year'], an(r['model']), an(r['trim']))
    imgs, how = PICK[r['url']]
    shared = [i for i in imgs if selfreq[r['dealer_domain']][fname(i)] > 1]
    if shared: C['images_removed_shared_across_units'] += len(shared); imgs = [i for i in imgs if i not in shared]
    if LYM.get(k):
        lus = LYM[k]; lv = {(u.get('vin') or '').upper() for u in lus} - {''}
        limg = {fname(i) for u in lus for i in u.get('images') or []}
        same = None
        if set(pv) & lv: same = 'page VIN equals live unit VIN'
        elif imgs and len({fname(i) for i in imgs} & limg) >= 1: same = 'shares photo file with live unit'
        coll.append([r['dealer_domain'], r['title'], r.get('stock_number'), r.get('vin'), r.get('price'), r['url'], '; '.join(f"{u['id']} stk={u.get('stockNumber')} ${u['priceUsd']['value']}" for u in lus[:3]), same or 'different unit (no shared VIN/photo)'])
        if same: drop('dupe_vs_live', 'collision: ' + same); continue
    if not imgs: drop('no_photo', 'no own-unit photo in a build-compatible URL'); continue
    hows[how] += 1
    # price re-confirm on the unit's own page
    if r.get('price') is not None and not x.get('price_on_page'):
        r['_meta']['price_unconfirmed_on_own_page'] = r['price']; r['price'] = None; C['price_unconfirmed_nulled'] += 1
    elif r.get('price') is not None:
        r['_meta']['price_basis'] = 'own_page_price_2026_11_10'
    r['image_urls'] = imgs
    r['_meta']['photos_basis'] = f'own_page_{how}'
    r['_meta']['own_page_read_at'] = x.get('t') or '2026-11-10'
    r['_meta']['stock_confirmed_on_page'] = x.get('stock_on_page'); r['_meta']['vin_confirmed_on_page'] = x.get('vin_on_page')
    out_rows.append(r)
with open(f'{D}/import_rows_with_photos.ndjson', 'w') as f:
    for r in out_rows: f.write(json.dumps(r) + '\n')
with open(f'{P}/photopass_drops.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['reason', 'domain', 'state', 'title', 'stock', 'vin', 'price', 'url', 'evidence']); w.writerows(drops)
with open(f'{P}/collision_review.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['domain', 'title', 'stock', 'vin', 'price', 'url', 'live_units_same_dealer_year_model_trim', 'verdict']); w.writerows(coll)
s = {'input_rows': len(rows), 'kept_with_photos': len(out_rows), 'kept_with_price': sum(1 for r in out_rows if r.get('price') is not None),
     'counts': dict(C), 'photo_selection': dict(hows), 'collisions_reviewed': len(coll),
     'collisions_true_dupes': sum(1 for c in coll if c[-1] != 'different unit (no shared VIN/photo)'),
     'drop_detail': dict(collections.Counter(d[0] + ' | ' + d[8].split(' ')[0] for d in drops).most_common())}
json.dump(s, open(f'{P}/photopass_summary.json', 'w'), indent=1); print(json.dumps(s, indent=1))
