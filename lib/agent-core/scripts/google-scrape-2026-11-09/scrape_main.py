"""MatchRV Google scrape pilot v2 — capped run.
Fetch public dealer inventory pages politely, extract units with Gemini (Vertex AI, first-party model),
write to private GCS bucket only. Hard spend cap enforced via a GCS ledger (compare-and-swap)."""
import json, os, re, sys, time
sys.set_int_max_str_digits(0)
import datetime, random, urllib.parse, urllib.robotparser
import requests
from bs4 import BeautifulSoup

PROJECT = os.environ.get("PROJECT", "main-business-514122")
LOCATION = os.environ.get("VERTEX_LOCATION", "global")
MODEL = os.environ.get("MODEL", "gemini-3.1-flash-lite")
THINKING = os.environ.get("THINKING_LEVEL", "MINIMAL")
BUCKET = os.environ.get("BUCKET", "")
RUN_ID = os.environ.get("RUN_ID", "scaled-1")
MODE = os.environ.get("MODE", "scrape")
MAX_PAGES = int(os.environ.get("MAX_PAGES", "40"))
MAX_ROOTS = int(os.environ.get("MAX_ROOTS", "3"))
MAX_CHARS = int(os.environ.get("MAX_CHARS", "150000"))
DELAY = float(os.environ.get("DELAY_S", "2.5"))
STOP_AT = float(os.environ.get("STOP_AT_USD", "48"))
HARD_CAP = float(os.environ.get("HARD_CAP_USD", "50"))
MAX_TASK_S = float(os.environ.get("MAX_TASK_SECONDS", "21000"))
PRICE_IN, PRICE_OUT = 0.25e-6, 1.50e-6           # $/token, gemini-3.1-flash-lite (Vertex list price)
# Conservative Cloud Run job compute: 1 vCPU @ $0.000024/s + 0.5 GiB @ $0.0000025/GiB-s (tier-2 rates, free tier ignored)
COMPUTE_PER_S = 0.000024 + 0.5 * 0.0000025
GCS_OP = 0.00001                                  # conservative per object op
TASK_INDEX = int(os.environ.get("CLOUD_RUN_TASK_INDEX", "0"))
TASK_COUNT = int(os.environ.get("CLOUD_RUN_TASK_COUNT", "1"))
UA = "Mozilla/5.0 (compatible; MatchRV-InventoryPilot/0.2; +https://matchrv.com; jonathan@matchrv.com)"
HEADERS = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
           "Accept-Language": "en-US,en;q=0.9", "Accept-Encoding": "gzip, deflate", "Upgrade-Insecure-Requests": "1"}
T0 = time.time()

SCHEMA = {"type": "OBJECT", "properties": {
    "units": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
        "year": {"type": "INTEGER", "nullable": True}, "make": {"type": "STRING", "nullable": True},
        "model": {"type": "STRING", "nullable": True}, "trim": {"type": "STRING", "nullable": True},
        "rv_type": {"type": "STRING", "nullable": True, "description": "Travel Trailer, Fifth Wheel, Class A, Class B, Class C, Toy Hauler, Truck Camper, Pop-Up, etc. Only if shown"},
        "price_usd": {"type": "NUMBER", "nullable": True, "description": "Selling/sale price only. Null for MSRP-only, MAP, payment-only, call/unlock for price, $0"},
        "price_label": {"type": "STRING", "nullable": True, "description": "Exact label next to the price, e.g. 'Sale Price', 'MSRP', 'MAP', 'Call for Price'"},
        "msrp_usd": {"type": "NUMBER", "nullable": True}, "stock_number": {"type": "STRING", "nullable": True},
        "vin": {"type": "STRING", "nullable": True},
        "condition": {"type": "STRING", "nullable": True, "enum": ["new", "used", "unknown"]},
        "status": {"type": "STRING", "nullable": True, "enum": ["available", "sale_pending", "on_order", "sold", "unknown"]},
        "location": {"type": "STRING", "nullable": True}, "url": {"type": "STRING", "nullable": True}},
        "required": ["year", "make", "model", "trim", "rv_type", "price_usd", "price_label", "msrp_usd", "stock_number", "vin",
                     "condition", "status", "location", "url"],
        "propertyOrdering": ["url", "year", "make", "model", "trim", "rv_type", "condition", "status", "stock_number", "vin",
                             "price_usd", "price_label", "msrp_usd", "location"]}},
    "page_notes": {"type": "STRING"}, "total_count_shown": {"type": "INTEGER", "nullable": True},
    "next_page_url": {"type": "STRING", "nullable": True, "description": "Absolute URL of the NEXT results page, if a pagination/next link is present"}},
    "required": ["units", "page_notes"]}

PROMPT = """You extract RV inventory from a dealer's public listing page.
Dealer: {dealer} ({city}, {state}). Page URL: {url}
Return ONLY RV units actually listed on this page (no nav links, categories, ads, cars/trucks/boats). Copy values as shown; never guess.
price_usd = the selling/sale price only; leave null for MSRP-only, MAP, payment-only, 'call'/'unlock' pricing, or $0, and put the label in price_label.
Make unit URLs absolute. Set total_count_shown if a total result count is shown, and next_page_url if a next-page link exists.
Page content (links as [text](href); JSON-LD kept):
---
{content}
---"""

# ---------------- auth / GCS ----------------
_tok = {"v": None, "exp": 0}
def token():
    if os.environ.get("ACCESS_TOKEN"): return os.environ["ACCESS_TOKEN"]
    if time.time() < _tok["exp"] - 120: return _tok["v"]
    r = requests.get("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
                     headers={"Metadata-Flavor": "Google"}, timeout=10); r.raise_for_status(); j = r.json()
    _tok.update(v=j["access_token"], exp=time.time() + j["expires_in"]); return _tok["v"]

def gcs_get(name):
    """returns (data or None, generation)"""
    r = requests.get(f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/{urllib.parse.quote(name, safe='')}",
                     params={"alt": "media"}, headers={"Authorization": f"Bearer {token()}"}, timeout=30)
    if r.status_code == 404: return None, 0
    r.raise_for_status(); return r.content, int(r.headers.get("x-goog-generation", 0))

def gcs_put(name, data, ctype="application/json", if_gen=None, _retry=0):
    params = {"uploadType": "media", "name": name}
    if if_gen is not None: params["ifGenerationMatch"] = str(if_gen)
    if isinstance(data, str): data = data.encode()
    r = requests.post(f"https://storage.googleapis.com/upload/storage/v1/b/{BUCKET}/o", params=params, data=data,
                      headers={"Authorization": f"Bearer {token()}", "Content-Type": ctype}, timeout=60)
    if r.status_code == 412: return False
    if r.status_code in (429, 500, 502, 503) and _retry < 5:
        time.sleep(2 ** _retry + random.random()); return gcs_put(name, data, ctype, if_gen, _retry + 1)
    r.raise_for_status(); return True

def gcs_exists(name):
    r = requests.get(f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/{urllib.parse.quote(name, safe='')}",
                     headers={"Authorization": f"Bearer {token()}"}, timeout=30)
    return r.status_code == 200

# ---------------- spend ledger ----------------
# Base (seed + earlier executions) lives in state/ledger.json and is only written by an operator.
# Each task keeps a CUMULATIVE total in its own object state/spend/<execution>-<task>.json (single writer,
# so no write contention; a failed write is superseded by the next one, so no cost is ever lost).
# Preflight sums base + every spend object before each Gemini call.
LEDGER = "state/ledger.json"
EXEC = os.environ.get("CLOUD_RUN_EXECUTION", "local-" + str(int(T0)))
MY_SPEND = f"state/spend/{EXEC}-{TASK_INDEX}.json"
_mine = {"spent_usd": 0.0, "vertex_usd": 0.0, "compute_s": 0.0, "prompt_tokens": 0, "output_tokens": 0, "llm_calls": 0, "gcs_ops": 0}
_compute_billed = {"s": 0.0}
_last_write = {"t": 0.0}
_others = {"t": 0.0, "sum": 0.0}
class CapReached(Exception): pass

def gcs_list(prefix):
    names, tok = [], None
    while True:
        p = {"prefix": prefix, "fields": "items(name),nextPageToken"}
        if tok: p["pageToken"] = tok
        r = requests.get(f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o", params=p,
                         headers={"Authorization": f"Bearer {token()}"}, timeout=30); r.raise_for_status(); j = r.json()
        names += [i["name"] for i in j.get("items", [])]; tok = j.get("nextPageToken")
        if not tok: return names

def write_mine(force=False):
    if not force and time.time() - _last_write["t"] < 1.5: return
    for attempt in range(6):
        try:
            gcs_put(MY_SPEND, json.dumps(dict(_mine, exec=EXEC, task=TASK_INDEX,
                    updated_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()))); _last_write["t"] = time.time(); return
        except Exception:
            time.sleep(2 ** attempt + random.random())

def ledger_add(cost_usd, tin=0, tout=0, calls=0, note=""):
    comp_s = (time.time() - T0) - _compute_billed["s"]; _compute_billed["s"] += comp_s
    _mine["gcs_ops"] += 2
    _mine["spent_usd"] = round(_mine["spent_usd"] + cost_usd + comp_s * COMPUTE_PER_S + 2 * GCS_OP, 6)
    _mine["vertex_usd"] = round(_mine["vertex_usd"] + cost_usd, 6); _mine["compute_s"] = round(_mine["compute_s"] + comp_s, 1)
    _mine["prompt_tokens"] += tin; _mine["output_tokens"] += tout; _mine["llm_calls"] += calls
    write_mine(force=(calls == 0))
    return _mine["spent_usd"]

def total_spent(max_age=15):
    b, _ = gcs_get(LEDGER)
    if not b: raise CapReached("ledger missing")
    base = json.loads(b)
    if base.get("stop"): raise CapReached("stop flag set in ledger")
    if time.time() - _others["t"] > max_age:
        tot = 0.0
        for n in gcs_list("state/spend/"):
            if n == MY_SPEND: continue
            d, _ = gcs_get(n)
            if d: tot += json.loads(d).get("spent_usd", 0)
        _others.update(t=time.time(), sum=tot)
    return base["spent_usd"] + _others["sum"] + _mine["spent_usd"]

def preflight(est_cost):
    if gcs_exists("state/STOP"): raise CapReached("manual STOP file present")
    if gcs_exists("state/STOP_CAP"): raise CapReached("cap stop file present")
    unbilled = ((time.time() - T0) - _compute_billed["s"]) * COMPUTE_PER_S
    tot = total_spent()
    if tot + unbilled + est_cost > STOP_AT:
        ledger_set_stop(f"cap reached: total {tot:.2f} + next est {est_cost:.3f} > {STOP_AT}")
        raise CapReached("spend cap")
    if time.time() - T0 > MAX_TASK_S: raise CapReached("task time cap")

def ledger_set_stop(reason):
    try: gcs_put("state/STOP_CAP", json.dumps({"reason": reason, "task": TASK_INDEX, "exec": EXEC,
                 "utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}), if_gen=0)
    except Exception: pass

# ---------------- fetching ----------------
SESS = requests.Session(); SESS.headers.update(HEADERS)
_robots, _last_hit = {}, {}
def polite_get(url, **kw):
    host = urllib.parse.urlparse(url).netloc
    wait = DELAY - (time.time() - _last_hit.get(host, 0))
    if wait > 0: time.sleep(wait)
    try: return SESS.get(url, timeout=30, **kw)
    finally: _last_hit[host] = time.time()

def robots_ok(url):
    p = urllib.parse.urlparse(url); base = f"{p.scheme}://{p.netloc}"
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            r = polite_get(base + "/robots.txt")
            if r.status_code in (401, 403): rp = "deny"
            elif r.status_code >= 400: rp = "allow"
            else: rp.parse(r.text.splitlines())
        except Exception: rp = "error"
        _robots[base] = rp
    rp = _robots[base]
    if rp == "allow": return True
    if rp in ("deny", "error"): return False
    return rp.can_fetch("MatchRV-InventoryPilot", url)

def page_to_text(html, base):
    soup = BeautifulSoup(html, "html.parser")
    ld = [s.get_text() for s in soup.find_all("script", type="application/ld+json")]
    for t in soup(["script", "style", "noscript", "svg", "iframe", "header", "footer", "form", "head"]): t.decompose()
    for a in soup.find_all("a", href=True):
        txt = " ".join(a.get_text(" ", strip=True).split()); href = urllib.parse.urljoin(base, a["href"])
        a.replace_with(f" [{txt}]({href}) " if txt else f" ({href}) ")
    text = re.sub(r"\n{2,}", "\n", soup.get_text("\n", strip=True))
    if ld: text += "\n\nJSON-LD:\n" + "\n".join(x.strip() for x in ld)[:40000]
    return text[:MAX_CHARS]

PAGE_KEYS = ("page", "pg", "p", "pagenum", "pagenumber", "currentpage", "pn", "paged")
def page_of(url):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    for k in q:
        if k.lower() in PAGE_KEYS and q[k][0].isdigit(): return k, int(q[k][0])
    m = re.search(r"/page/(\d+)/?$", urllib.parse.urlparse(url).path)
    if m: return "/page/", int(m.group(1))
    return None, 1

def deterministic_next(html, cur_url):
    """Find a same-path link to page cur+1 (query-param or /page/N paging), or rel=next."""
    soup = BeautifulSoup(html, "html.parser"); cu = urllib.parse.urlparse(cur_url)
    _, cur = page_of(cur_url)
    for a in soup.find_all(["a", "link"], href=True):
        if "next" in (a.get("rel") or []):
            return urllib.parse.urljoin(cur_url, a["href"])
    for a in soup.find_all("a", href=True):
        u = urllib.parse.urljoin(cur_url, a["href"]); pu = urllib.parse.urlparse(u)
        if pu.netloc != cu.netloc: continue
        k, n = page_of(u)
        if k and n == cur + 1 and (pu.path.rstrip("/") == cu.path.rstrip("/") or k == "/page/"):
            return u
    return None

INV_PAT = re.compile(r"(rv-search|--inventory|/inventory|all-inventory|view-inventory|rvs-for-sale|rv-inventory|/search/?$|new-inventory|used-inventory|/shop/?$|/rvs/?$|for-sale)", re.I)
BAD_PAT = re.compile(r"(parts|service|financ|blog|contact|about|career|rental|sell|trade|consign|special-order|\.pdf|#|mailto:|tel:|javascript:)", re.I)
def discover_roots(domain):
    home = f"https://www.{domain}/" if not domain.startswith("www.") else f"https://{domain}/"
    if not robots_ok(home): return [], "robots_disallow_home", None
    try: r = polite_get(home)
    except Exception:
        home = f"https://{domain}/"
        if not robots_ok(home): return [], "robots_disallow_home", None
        r = polite_get(home)
    if r.status_code != 200: return [], f"home_http_{r.status_code}", r.status_code
    base = r.url; host = urllib.parse.urlparse(base).netloc
    soup = BeautifulSoup(r.text, "html.parser"); scored = {}
    for a in soup.find_all("a", href=True):
        u = urllib.parse.urljoin(base, a["href"]).split("#")[0]; pu = urllib.parse.urlparse(u)
        if pu.netloc != host or BAD_PAT.search(u) or not INV_PAT.search(pu.path + ("?" + pu.query if pu.query else "")): continue
        if re.search(r"\d{4}-[a-z]", pu.path): continue  # looks like a unit page
        txt = a.get_text(" ", strip=True).lower(); s = 0
        if re.search(r"rv-search|all-inventory|--inventory|view-inventory|/inventory/?$", pu.path, re.I): s += 5
        if re.search(r"all|view|search|inventory|shop", txt): s += 2
        if re.search(r"\bnew\b|\bused\b|pre-owned", txt + pu.path, re.I): s += 1
        s -= len(pu.query) / 50
        scored[u] = max(scored.get(u, -9), s)
    links = []
    for a in soup.find_all("a", href=True):
        u = urllib.parse.urljoin(base, a["href"]).split("#")[0]
        if urllib.parse.urlparse(u).netloc != host or re.search(r"mailto:|tel:|javascript:|\.(pdf|jpg|png)$", u, re.I): continue
        t = " ".join(a.get_text(" ", strip=True).split())[:60]
        if (u, t) not in links: links.append((u, t))
    hint = [u for u, _ in sorted(scored.items(), key=lambda x: -x[1])][:8]
    listing = "\n".join(f"{t} | {u}" for u, t in links[:400])
    preflight(0.002)
    data, usage, _ = gemini(DISCOVER_PROMPT.format(domain=domain, home=base, hint="\n".join(hint), links=listing), schema=DISCOVER_SCHEMA)
    tin, tout = usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0) + usage.get("thoughtsTokenCount", 0)
    ledger_add(tin * PRICE_IN + tout * PRICE_OUT, tin, tout, 1)
    roots = []
    for u in (data.get("listing_urls") or [])[:MAX_ROOTS]:
        u = urllib.parse.urljoin(base, u)
        if urllib.parse.urlparse(u).netloc == host and u not in roots: roots.append(u)
    if not roots and data.get("home_lists_units"): roots = [base]
    return roots, ("ok" if roots else "no_rv_listing_page:" + (data.get("reason") or "")[:100]), 200

DISCOVER_SCHEMA = {"type": "OBJECT", "properties": {
    "listing_urls": {"type": "ARRAY", "items": {"type": "STRING"}, "description": "1-3 URLs of pages that LIST multiple RV units for sale (prefer one 'all RV inventory' page; else separate new/used or per-type RV pages). Never car/boat/parts/service pages or single-unit pages."},
    "home_lists_units": {"type": "BOOLEAN", "description": "true if the homepage itself is the RV listing"},
    "reason": {"type": "STRING"}}, "required": ["listing_urls", "home_lists_units", "reason"]}
DISCOVER_PROMPT = """Pick the RV inventory listing page(s) for dealer site {domain} (homepage {home}).
Heuristic candidates:
{hint}
All internal links on the homepage (text | url):
{links}"""

def gemini(prompt, schema=None):
    host = "aiplatform.googleapis.com" if LOCATION == "global" else f"{LOCATION}-aiplatform.googleapis.com"
    url = f"https://{host}/v1/projects/{PROJECT}/locations/{LOCATION}/publishers/google/models/{MODEL}:generateContent"
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": schema or SCHEMA, "maxOutputTokens": 24000}}
    if THINKING: body["generationConfig"]["thinkingConfig"] = {"thinkingLevel": THINKING}
    for attempt in range(4):
        r = requests.post(url, json=body, headers={"Authorization": f"Bearer {token()}"}, timeout=300)
        if r.status_code in (429, 500, 503) and attempt < 3: time.sleep(15 * (attempt + 1)); continue
        r.raise_for_status(); break
    j = r.json(); cand = j["candidates"][0]
    text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []))
    usage = j.get("usageMetadata", {})
    try:
        return json.loads(text), usage, cand.get("finishReason")
    except Exception as e:
        # bill the tokens anyway, then surface as an error
        tin, tout = usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0) + usage.get("thoughtsTokenCount", 0)
        ledger_add(tin * PRICE_IN + tout * PRICE_OUT, tin, tout, 1)
        raise ValueError(f"bad_json finish={cand.get('finishReason')} out_tokens={tout}: {str(e)[:80]}")

def sanitize(u):
    p = u.get("price_usd"); lab = (u.get("price_label") or "").lower()
    if p is not None:
        bad = None
        if p < 1000: bad = "price_below_1000"
        elif re.search(r"\bmap\b|msrp|call|unlock|payment|/mo", lab): bad = f"placeholder_label:{u.get('price_label')}"
        if bad: u["price_flag"] = bad; u["price_raw"] = p; u["price_usd"] = None
    if u.get("vin"):
        v = re.sub(r"\s", "", u["vin"]).upper(); u["vin"] = v if re.fullmatch(r"[A-HJ-NPR-Z0-9]{17}", v) else None
    return u

# ---------------- per dealer ----------------
def scrape_dealer(d):
    roots = [d["inventory_url"]] if d.get("inventory_url") else []
    res = {"key": d["key"], "dealer": d.get("dealer"), "domain": d["domain"], "state": d.get("state"), "pages": [], "units": 0,
           "status": None, "started_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    if not roots:
        roots, why, code = discover_roots(d["domain"]); res["discovery"] = why
        if not roots:
            res["status"] = "blocked" if code in (401, 403, 429) else why; return res, []
    res["roots"] = roots
    units, seen_keys, seen_urls = [], set(), set()
    for root in roots:
        url, host = root, urllib.parse.urlparse(root).netloc; empty_streak = 0
        for page in range(1, MAX_PAGES + 1):
            if not url or url in seen_urls or urllib.parse.urlparse(url).netloc != host: break
            seen_urls.add(url); pl = {"url": url, "page": page}; res["pages"].append(pl)
            if not robots_ok(url): pl["status"] = "robots_disallow"; break
            try: r = polite_get(url)
            except Exception as e: pl["status"] = f"fetch_error:{e.__class__.__name__}"; break
            pl["http"] = r.status_code
            if r.status_code != 200: pl["status"] = "fetch_failed"; break
            content = page_to_text(r.text, r.url); pl["chars"] = len(content)
            est = (len(content) / 3) * PRICE_IN + 6000 * PRICE_OUT
            preflight(est)
            try:
                data, usage, finish = gemini(PROMPT.format(content=content, url=r.url, dealer=d.get("dealer") or d["domain"],
                                                           city=d.get("city") or "", state=d.get("state") or ""))
            except Exception as e:
                pl["status"] = f"llm_error:{str(e)[:160]}"
                if "bad_json" not in str(e): ledger_add(est * 0.5, note="llm_error")
                break
            tin, tout = usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0) + usage.get("thoughtsTokenCount", 0)
            cost = tin * PRICE_IN + tout * PRICE_OUT
            total = ledger_add(cost, tin, tout, 1)
            pl.update(prompt_tokens=tin, output_tokens=tout, cost_usd=round(cost, 6), finish=finish, ledger_total=total,
                      total_count_shown=data.get("total_count_shown"), notes=(data.get("page_notes") or "")[:200])
            new = 0
            for u in data.get("units", []):
                if not u.get("url"): continue
                u["url"] = urllib.parse.urljoin(r.url, u["url"])
                k = [u["url"].rstrip("/").lower()] + [x for x in [(u.get("vin") or "").upper(), "S:" + (u.get("stock_number") or "")] if len(x) > 2]
                if any(x in seen_keys for x in k): continue
                seen_keys.update(k); new += 1
                u = sanitize(u)
                u.update(dealer=d.get("dealer"), domain=d["domain"], dealer_city=d.get("city"), dealer_state=d.get("state"),
                         source_page=r.url, run_id=RUN_ID, llm_model=MODEL,
                         seen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"))
                units.append(u)
            pl["new_units"] = new; pl["status"] = "ok"
            empty_streak = empty_streak + 1 if new == 0 else 0
            if empty_streak >= 2: break
            nxt = deterministic_next(r.text, r.url) or data.get("next_page_url")
            if nxt: nxt = urllib.parse.urljoin(r.url, nxt)
            url = nxt
    res["units"] = len(units)
    codes = [p.get("http") for p in res["pages"]]
    res["status"] = "ok" if units else ("blocked" if any(c in (401, 403, 429) for c in codes) else
                                        "robots_disallow" if any(p.get("status") == "robots_disallow" for p in res["pages"]) else "no_units")
    return res, units

def main_scrape():
    b, _ = gcs_get(os.environ.get("DEALERS_OBJ", "state/dealers.json")); dealers = json.loads(b)
    mine = [d for i, d in enumerate(dealers) if i % TASK_COUNT == TASK_INDEX]
    print(json.dumps({"task": TASK_INDEX, "of": TASK_COUNT, "dealers": len(mine)}), flush=True)
    done = 0
    for d in mine:
        prev, _ = gcs_get(f"runs/{RUN_ID}/dealers/{d['key']}.json")
        if prev and json.loads(prev).get("status") != "error": continue
        try:
            res, units = scrape_dealer(d)
        except CapReached as e:
            print(json.dumps({"task": TASK_INDEX, "stopped": str(e)}), flush=True); break
        except Exception as e:
            res, units = {"key": d["key"], "domain": d["domain"], "state": d.get("state"), "status": "error",
                          "error": f"{e.__class__.__name__}: {str(e)[:300]}"}, []
        if units:
            gcs_put(f"runs/{RUN_ID}/units/{d['key']}.jsonl", "".join(json.dumps(u, ensure_ascii=False) + "\n" for u in units), "application/x-ndjson")
        gcs_put(f"runs/{RUN_ID}/dealers/{d['key']}.json", json.dumps(res, ensure_ascii=False))
        done += 1
        print(json.dumps({"task": TASK_INDEX, "dealer": d["key"], "status": res["status"], "units": res.get("units", 0)}), flush=True)
    ledger_add(0.0); write_mine(force=True)  # bill remaining compute
    print(json.dumps({"task": TASK_INDEX, "finished": done, "elapsed_s": round(time.time() - T0)}), flush=True)

def main_probe():
    """Try free, honest variants against domains that blocked Cloud Run egress."""
    targets = json.loads(os.environ["PROBE_URLS"])
    variants = {"bot_ua_minimal": {"User-Agent": "MatchRV-InventoryPilot/0.1 (+https://matchrv.com; jonathan@matchrv.com)"},
                "mozilla_compatible_full_headers": HEADERS}
    out = []
    for u in targets:
        p = urllib.parse.urlparse(u); row = {"url": u}
        for name, h in variants.items():
            try: r = requests.get(u, headers=h, timeout=20); row[name] = r.status_code
            except Exception as e: row[name] = e.__class__.__name__
            time.sleep(2)
        for extra in ("/robots.txt", "/sitemap.xml"):
            try: r = requests.get(f"{p.scheme}://{p.netloc}{extra}", headers=HEADERS, timeout=20); row[extra] = r.status_code
            except Exception as e: row[extra] = e.__class__.__name__
            time.sleep(2)
        out.append(row); print(json.dumps(row), flush=True)
    print("PROBE_DONE", os.environ.get("K_SERVICE", ""), flush=True)

if __name__ == "__main__":
    main_probe() if MODE == "probe" else main_scrape()
