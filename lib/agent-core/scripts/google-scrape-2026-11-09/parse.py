"""Photo/own-page pass, step 2: parse saved pages -> photos, status, id/price re-confirmation; collision review vs live."""
import json, gzip, hashlib, os, re, sys, html as H, collections, urllib.parse, csv
from bs4 import BeautifulSoup
D = '/workspace/google-scraper-pilot/import-candidate'; P = f'{D}/photopass'
SNAP = '/workspace/ro-main-latest/lib/agent-core/data/inventory.snapshot.json.gz'
key = lambda u: hashlib.sha1(u.encode()).hexdigest()[:20]
an = lambda s: re.sub(r'[^a-z0-9]', '', str(s or '').lower())
bare = lambda d: re.sub(r'/.*$', '', re.sub(r'^www\.', '', re.sub(r'^https?://', '', (d or '').lower())))
IMG_RX = re.compile(r'\.(jpe?g|png|webp)(\?|$)', re.I)
JUNK = re.compile(r'(?i)(logo|icon|favicon|sprite|placeholder|no[-_]?image|noimage|no[-_]?photo|coming[-_]?soon|photo[-_]?coming|default[-_]?(img|image|unit)|blank\.|spacer|loading|loader|banner|badge|button|btn[-_]|avatar|staff|team[-_]|employee|header|footer|social|facebook|twitter|instagram|youtube|google|apple-touch|award|review|testimonial|financ|credit|careers|map[-_]|/common/|/brand(s)?/|manufacturer[-_]?logo|dealer[-_]?logo|flag|star[-_]?rating|payment|trade[-_]?in|hero|slider/|promo|special[-_]?offer|wp-content/themes|/themes/|/assets/img/|cdn-cgi|gravatar|pixel|1x1|tracking|qr[-_]?code)')
TINY = re.compile(r'(?i)[-_/](\d{2,3})x(\d{2,3})[-_./]')
def ok_img(u):
    if not u or not u.startswith('https://') or not IMG_RX.search(u) or JUNK.search(u): return False
    m = TINY.search(u)
    if m and int(m.group(1)) < 200 and int(m.group(2)) < 200: return False
    return True
def absu(base, u):
    u = H.unescape((u or '').strip()).split(' ')[0]
    if not u or u.startswith('data:'): return None
    u = urllib.parse.urljoin(base, u)
    if u.startswith('http://'): u = 'https://' + u[7:]
    return u.replace(' ', '%20')
def jsonld(soup):
    out = []
    for s in soup.find_all('script', type=re.compile('ld\\+json', re.I)):
        try: d = json.loads(s.string or s.get_text() or '')
        except Exception: continue
        st = [d]
        while st:
            x = st.pop()
            if isinstance(x, list): st.extend(x)
            elif isinstance(x, dict):
                out.append(x); st.extend(v for v in x.values() if isinstance(v, (dict, list)))
    return out
SOLD_HEAD = re.compile(r'(?i)\b(sold|sale[ -]pending|pending sale|deal pending|on hold|unavailable)\b')
SOLD_TEXT = re.compile(r'(?i)(this (unit|rv|vehicle|camper|item|listing|coach|trailer) (has been|is|was) (sold|no longer available)|has been sold|is no longer available|no longer in (stock|inventory)|vehicle (is )?not found|unit (is )?not found|listing (is )?(not found|unavailable|expired)|page not found|sale pending)')
VINRX = re.compile(r'\b([A-HJ-NPR-Z0-9]{17})\b')
_TR = {**{str(i): i for i in range(10)}, **dict(zip('ABCDEFGH', range(1, 9))), **dict(zip('JKLMN', range(1, 6))), 'P': 7, 'R': 9, **dict(zip('STUVWXYZ', range(2, 10)))}
_WT = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]
def vin_check(v):
    try: c = sum(_TR[ch] * w for ch, w in zip(v, _WT)) % 11
    except KeyError: return False
    return v[8] == ('X' if c == 10 else str(c))
def vin_ok(v): return bool(re.match(r'^[A-HJ-NPR-Z0-9]{17}$', v)) and re.search(r'\d', v) and v[-4:].isdigit() and re.search(r'[A-Z]', v) and vin_check(v)

def parse(r, flog):
    u = r['url']; out = {'url': u, 'domain': r['dealer_domain']}
    res = flog.get(u)
    if not res: out['outcome'] = 'not_fetched'; return out
    if res['result'] == 'robots_disallow': out['outcome'] = 'blocked_robots'; return out
    if res['result'].startswith('error'): out['outcome'] = 'fetch_error'; out['detail'] = res['result']; return out
    st = res.get('status'); out['http'] = st; out['final'] = res.get('final')
    if st in (404, 410): out['outcome'] = 'dead_page_gone'; return out
    if st in (401, 403, 429) or (st and st >= 500): out['outcome'] = 'blocked_http'; return out
    f = f'{P}/pages/{key(u)}.html.gz'
    if not os.path.exists(f): out['outcome'] = 'empty_page'; return out
    raw = gzip.open(f).read().decode('utf-8', 'replace')
    if re.search(r'(?i)(just a moment\.\.\.|cf-chl|captcha|access denied|attention required|incapsula|perimeterx|are you a robot)', raw[:20000]) and len(raw) < 60000:
        out['outcome'] = 'blocked_bot_wall'; return out
    soup = BeautifulSoup(raw, 'lxml')
    for t in soup(['script', 'style', 'noscript']):
        if t.get('type', '').lower().find('ld+json') < 0: t.extract()
    lds = jsonld(BeautifulSoup(raw, 'lxml'))
    title = ' '.join(filter(None, [soup.title.get_text(' ', strip=True) if soup.title else '', *(m.get('content', '') for m in soup.find_all('meta', property=re.compile('og:title', re.I))), *(h.get_text(' ', strip=True) for h in soup.find_all('h1')[:2])]))
    text = re.sub(r'\s+', ' ', soup.get_text(' ', strip=True))
    T = an(text) + an(raw[:3_000_000] if False else '')
    # --- identity re-confirm (visible text, title, URL, JSON-LD) ---
    ldtxt = an(json.dumps(lds)[:200000])
    hay = an(text) + ' ' + an(title) + ' ' + ldtxt + ' ' + an(res.get('final') or '')
    stock, vin = r.get('stock_number'), r.get('vin')
    out['stock_on_page'] = bool(stock) and an(stock) in hay
    out['vin_on_page'] = bool(vin) and an(vin) in hay
    page_vins = sorted({v for v in VINRX.findall(text.upper() + ' ' + json.dumps(lds).upper()) if vin_ok(v)})
    out['page_vins'] = page_vins[:5]
    model_tok = [w for w in re.findall(r'[A-Za-z0-9]{3,}', r['model'])][:1]
    out['year_model_on_page'] = str(r['year']) in (text + title) and (not model_tok or an(model_tok[0]) in hay)
    # --- status ---
    sold = None
    if SOLD_HEAD.search(title): sold = 'title:' + SOLD_HEAD.search(title).group(0)
    for x in lds:
        av = json.dumps(x.get('offers', {})) if isinstance(x, dict) else ''
        if re.search(r'(?i)(SoldOut|OutOfStock|Discontinued)', av): sold = sold or 'jsonld:' + re.search(r'(?i)(SoldOut|OutOfStock|Discontinued)', av).group(0)
    if not sold:
        stok = an(stock) if stock else None
        for m in SOLD_TEXT.finditer(text[:40000]):
            ctx = text[max(0, m.start() - 60): m.end() + 60]
            if re.search(r'(?i)on order', ctx) and re.search(r'(?i)\bsold\b', ctx.replace(m.group(0), '')): continue  # status legend / filter list
            if re.search(r'(?i)similar|you may also like|related|recently viewed', text[max(0, m.start() - 200): m.start()]): continue
            win = an(text[max(0, m.start() - 300): m.end() + 300])
            if (stok and stok in win) or (model_tok and an(model_tok[0]) in win and str(r['year']) in text[max(0, m.start() - 300): m.end() + 300]):
                sold = 'text:' + m.group(0); break
    # redirect to a results page / home
    fin = res.get('final') or u
    redirected_away = urllib.parse.urlsplit(fin).path.rstrip('/') != urllib.parse.urlsplit(u).path.rstrip('/') and not (out['stock_on_page'] or out['vin_on_page'])
    # --- price ---
    p = r.get('price')
    if p:
        pi = int(round(p)); cands = {f'{pi:,}', str(pi), f'{p:,.2f}'}
        out['price_on_page'] = any(c in text or c in raw for c in cands)
        offer_prices = []
        for x in lds:
            of = x.get('offers') if isinstance(x, dict) else None
            for o in (of if isinstance(of, list) else [of] if isinstance(of, dict) else []):
                try: offer_prices.append(float(str(o.get('price')).replace(',', '')))
                except Exception: pass
        out['ld_prices'] = offer_prices[:3]
    # --- photos ---
    imgs = []
    def add(x, src):
        a = absu(fin, x)
        if a and ok_img(a) and a not in [i for i, _ in imgs]: imgs.append((a, src))
    for x in lds:
        if not isinstance(x, dict): continue
        if re.search(r'(?i)vehicle|product|car|motorhome|offer|individualproduct', str(x.get('@type', ''))):
            im = x.get('image')
            for v in (im if isinstance(im, list) else [im]):
                if isinstance(v, dict): v = v.get('url') or v.get('contentUrl')
                if isinstance(v, str): add(v, 'jsonld')
    full = BeautifulSoup(raw, 'lxml')
    for m in full.find_all('meta', attrs={'property': re.compile(r'og:image(:secure_url)?$', re.I)}): add(m.get('content'), 'og')
    for m in full.find_all('meta', attrs={'name': re.compile(r'twitter:image', re.I)}): add(m.get('content'), 'twitter')
    for t in full.find_all(['img', 'a', 'source', 'div', 'li']):
        for att in ('data-src', 'data-lazy', 'data-original', 'data-zoom-image', 'data-full', 'data-large', 'data-image', 'href', 'src', 'data-srcset', 'srcset'):
            v = t.get(att)
            if not v: continue
            if 'srcset' in att: v = v.split(',')[-1].strip().split(' ')[0]
            if IMG_RX.search(v): add(v, 'gallery')
        if len(imgs) > 120: break
    for m in re.finditer(r'https?:(?:\\?/){2}(?:[^"\'\s<>()\\]|\\/)+?\.(?:jpe?g|png|webp)(?:\?[^"\'\s<>\\]*)?', raw, re.I):
        add(m.group(0).replace(chr(92) + '/', '/'), 'raw')
        if len(imgs) > 150: break
    out['images_all'] = [i for i, _ in imgs]
    out['img_src'] = [s for _, s in imgs]
    out['sold'] = sold
    if sold: out['outcome'] = 'sold_or_pending'
    elif redirected_away: out['outcome'] = 'dead_redirected'
    elif not (out['stock_on_page'] or out['vin_on_page'] or out['year_model_on_page']): out['outcome'] = 'unit_not_on_page'
    else: out['outcome'] = 'ok'
    return out

if __name__ == '__main__':
    rows = [json.loads(l) for l in open(f'{D}/import_candidate_rows.ndjson')]
    flog = {}
    for l in open(f'{P}/fetch_log.ndjson'):
        x = json.loads(l); flog[x['url']] = x
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    rs = [r for r in rows if r['url'] in flog][:lim] if lim else rows
    with open(f'{P}/parsed.ndjson', 'w') as f:
        for r in rs: f.write(json.dumps(parse(r, flog)) + '\n')
    print(len(rs), collections.Counter(json.loads(l)['outcome'] for l in open(f'{P}/parsed.ndjson')))
