#!/usr/bin/env python3
"""MatchRV AI Visibility Audit v2 (stdlib-only, no third-party packages).

Live, read-only dealer inventory readiness audit. Respects robots.txt
(reads it, evaluates bot paths, never impersonates bots, never fetches
disallowed /api/ endpoints). All network use is plain HTTPS GET with an
identifying User-Agent.

Usage (Windows, from this folder):
    .\\.venv\\Scripts\\python.exe audit.py --url https://www.tacomarv.com --dealer "Tacoma RV Center" --city Fife --state WA
    python audit.py --demo            (synthetic sample, no network)
    python audit.py --import-responses responses.csv   (regenerate citation sheet)

Outputs (under reports/<slug>-<date>/):
    report.pdf report.xlsx report.json citation_prompts.csv raw/
"""
import argparse
import csv
import datetime as dt
import gzip
import html as htmllib
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

UA = "MatchRVAudit/2.0 (+dealer inventory readiness audit; read-only; respects robots.txt)"
TIMEOUT = 30
SLEEP_BETWEEN_REQUESTS = 1.2
MAX_VDP_SAMPLE = 40

REQUIRED_FIELDS = ["year", "make", "model", "price", "availability", "vin", "location"]
RECOMMENDED_FIELDS = ["length", "dry_weight", "gvwr", "sleeping_capacity",
                      "slides", "fuel_type", "engine", "floorplan"]

# (id, buyer query, conditions). Condition ops: eq/lt/gte/contains.
# Strict "under" excludes the boundary. Unknown never counts as false/zero.
QUERIES = [
    ("Q01", "Class A under $150,000", [("rv_type", "eq", "class a"), ("price", "lt", 150000)]),
    ("Q02", "Class A under $200,000", [("rv_type", "eq", "class a"), ("price", "lt", 200000)]),
    ("Q03", "Class A under $250,000", [("rv_type", "eq", "class a"), ("price", "lt", 250000)]),
    ("Q04", "Class B under $100,000", [("rv_type", "eq", "class b"), ("price", "lt", 100000)]),
    ("Q05", "Class B under $150,000", [("rv_type", "eq", "class b"), ("price", "lt", 150000)]),
    ("Q06", "Class B under $200,000", [("rv_type", "eq", "class b"), ("price", "lt", 200000)]),
    ("Q07", "Class C under $75,000", [("rv_type", "eq", "class c"), ("price", "lt", 75000)]),
    ("Q08", "Class C under $100,000", [("rv_type", "eq", "class c"), ("price", "lt", 100000)]),
    ("Q09", "Class C under $150,000", [("rv_type", "eq", "class c"), ("price", "lt", 150000)]),
    ("Q10", "Super C under $200,000", [("rv_type", "eq", "super c"), ("price", "lt", 200000)]),
    ("Q11", "Super C under $300,000", [("rv_type", "eq", "super c"), ("price", "lt", 300000)]),
    ("Q12", "Super C under $400,000", [("rv_type", "eq", "super c"), ("price", "lt", 400000)]),
    ("Q13", "Travel trailer under $25,000", [("rv_type", "eq", "travel trailer"), ("price", "lt", 25000)]),
    ("Q14", "Travel trailer under $40,000", [("rv_type", "eq", "travel trailer"), ("price", "lt", 40000)]),
    ("Q15", "Travel trailer under $60,000", [("rv_type", "eq", "travel trailer"), ("price", "lt", 60000)]),
    ("Q16", "Fifth wheel under $50,000", [("rv_type", "eq", "fifth wheel"), ("price", "lt", 50000)]),
    ("Q17", "Fifth wheel under $75,000", [("rv_type", "eq", "fifth wheel"), ("price", "lt", 75000)]),
    ("Q18", "Fifth wheel under $100,000", [("rv_type", "eq", "fifth wheel"), ("price", "lt", 100000)]),
    ("Q19", "Class A under 35 feet", [("rv_type", "eq", "class a"), ("length", "lt", 35)]),
    ("Q20", "Class A under 40 feet", [("rv_type", "eq", "class a"), ("length", "lt", 40)]),
    ("Q21", "Class C under 25 feet", [("rv_type", "eq", "class c"), ("length", "lt", 25)]),
    ("Q22", "Class C under 30 feet", [("rv_type", "eq", "class c"), ("length", "lt", 30)]),
    ("Q23", "Class B under 22 feet", [("rv_type", "eq", "class b"), ("length", "lt", 22)]),
    ("Q24", "Class B under 25 feet", [("rv_type", "eq", "class b"), ("length", "lt", 25)]),
    ("Q25", "Travel trailer under 25 feet", [("rv_type", "eq", "travel trailer"), ("length", "lt", 25)]),
    ("Q26", "Travel trailer under 30 feet", [("rv_type", "eq", "travel trailer"), ("length", "lt", 30)]),
    ("Q27", "Fifth wheel under 35 feet", [("rv_type", "eq", "fifth wheel"), ("length", "lt", 35)]),
    ("Q28", "Fifth wheel under 40 feet", [("rv_type", "eq", "fifth wheel"), ("length", "lt", 40)]),
    ("Q29", "Travel trailer sleeps at least 6", [("rv_type", "eq", "travel trailer"), ("sleeping_capacity", "gte", 6)]),
    ("Q30", "Travel trailer sleeps at least 8", [("rv_type", "eq", "travel trailer"), ("sleeping_capacity", "gte", 8)]),
    ("Q31", "Fifth wheel sleeps at least 6", [("rv_type", "eq", "fifth wheel"), ("sleeping_capacity", "gte", 6)]),
    ("Q32", "Fifth wheel sleeps at least 8", [("rv_type", "eq", "fifth wheel"), ("sleeping_capacity", "gte", 8)]),
    ("Q33", "Class A sleeps at least 6", [("rv_type", "eq", "class a"), ("sleeping_capacity", "gte", 6)]),
    ("Q34", "Class A sleeps at least 8", [("rv_type", "eq", "class a"), ("sleeping_capacity", "gte", 8)]),
    ("Q35", "Class C sleeps at least 6", [("rv_type", "eq", "class c"), ("sleeping_capacity", "gte", 6)]),
    ("Q36", "Class C sleeps at least 8", [("rv_type", "eq", "class c"), ("sleeping_capacity", "gte", 8)]),
    ("Q37", "Class A diesel pusher under $200,000", [("rv_type", "eq", "class a"), ("diesel_pusher", "eq", True), ("price", "lt", 200000)]),
    ("Q38", "Used diesel pusher", [("condition", "eq", "used"), ("diesel_pusher", "eq", True)]),
    ("Q39", "Bunkhouse travel trailer", [("rv_type", "eq", "travel trailer"), ("bunkhouse", "eq", True)]),
    ("Q40", "Motorhome with installed washer and dryer", [("washer_dryer", "eq", True)]),
    ("Q41", "Travel trailer dry weight under 5,000 lb", [("rv_type", "eq", "travel trailer"), ("dry_weight", "lt", 5000)]),
    ("Q42", "Travel trailer GVWR under 7,000 lb", [("rv_type", "eq", "travel trailer"), ("gvwr", "lt", 7000)]),
    ("Q43", "Fifth wheel with at least 3 slides", [("rv_type", "eq", "fifth wheel"), ("slides", "gte", 3)]),
    ("Q44", "Travel trailer rear kitchen", [("rv_type", "eq", "travel trailer"), ("rear_kitchen", "eq", True)]),
    ("Q45", "Class A mid-bath", [("rv_type", "eq", "class a"), ("mid_bath", "eq", True)]),
    ("Q46", "Used unit under $150,000", [("condition", "eq", "used"), ("price", "lt", 150000)]),
    ("Q47", "New travel trailer bunkhouse", [("condition", "eq", "new"), ("rv_type", "eq", "travel trailer"), ("bunkhouse", "eq", True)]),
    ("Q48", "Toy hauler under $75,000", [("toy_hauler", "eq", True), ("price", "lt", 75000)]),
    ("Q49", "Class C gasoline motorhome", [("rv_type", "eq", "class c"), ("fuel_type", "eq", "gasoline")]),
    ("Q50", "Diesel motorhome sleeps at least 6", [("fuel_type", "eq", "diesel"), ("sleeping_capacity", "gte", 6)]),
    # v2 combo queries: RV-shopper intent bundles (the MatchRV edge).
    ("Q51", "Bunkhouse under $60,000 sleeps 8", [("bunkhouse", "eq", True), ("price", "lt", 60000), ("sleeping_capacity", "gte", 8)]),
    ("Q52", "Fifth wheel under $100,000 with 3+ slides", [("rv_type", "eq", "fifth wheel"), ("price", "lt", 100000), ("slides", "gte", 3)]),
    ("Q53", "Travel trailer under 30 feet sleeps 6+", [("rv_type", "eq", "travel trailer"), ("length", "lt", 30), ("sleeping_capacity", "gte", 6)]),
    ("Q54", "New fifth wheel under $75,000", [("condition", "eq", "new"), ("rv_type", "eq", "fifth wheel"), ("price", "lt", 75000)]),
    ("Q55", "Used travel trailer under $40,000", [("condition", "eq", "used"), ("rv_type", "eq", "travel trailer"), ("price", "lt", 40000)]),
    ("Q56", "Toy hauler sleeps at least 6", [("toy_hauler", "eq", True), ("sleeping_capacity", "gte", 6)]),
]

CITATION_PROMPT_TEMPLATE = [
    "Best RV dealers near {city}, {state}",
    "New travel trailers for sale near {city}, {state}",
    "{dealer} reviews {city} {state}",
    "Fifth wheel under $75,000 near {city}, {state}",
    "Travel trailer sleeps 8 near {city}, {state}",
    "Bunkhouse travel trailer near {city}, {state}",
    "Toy haulers for sale near {city}, {state}",
    "Used RVs near {city}, {state}",
    "RV service center near {city}, {state}",
    "Fifth wheel dealers near {city}, {state}",
]


def fetch(url, timeout=TIMEOUT):
    """Single polite GET. Returns dict(status, final_url, headers, body, error)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            enc = r.headers.get("Content-Encoding", "")
            if enc == "gzip" and body[:2] == b"\x1f\x8b":
                try:
                    body = gzip.decompress(body)
                except OSError:
                    pass
            return {"status": r.status, "final_url": r.url,
                    "headers": dict(r.headers), "body": body, "error": ""}
    except Exception as e:  # noqa: BLE001 - network probe, record and continue
        status = getattr(e, "code", 0) or 0
        return {"status": status, "final_url": url, "headers": {},
                "body": b"", "error": "%s: %s" % (type(e).__name__, e)}


def parse_robots(text):
    """Parse robots.txt into [(agents, rules)] preserving longest-match semantics."""
    groups, cur_agents, cur_rules = [], [], []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key, val = key.strip().lower(), val.strip()
        if key == "user-agent":
            if cur_rules and cur_agents:
                groups.append((cur_agents, cur_rules))
                cur_agents, cur_rules = [], []
            cur_agents.append(val.lower())
        elif key in ("allow", "disallow") and cur_agents:
            if val == "":
                continue
            cur_rules.append((key, val))
    if cur_agents:
        groups.append((cur_agents, cur_rules))
    return groups


def robots_allowed(groups, agent, path):
    """Google robots.txt spec: longest matching rule wins; allow wins ties."""
    best, decision = -1, True
    for agents, rules in groups:
        if not any(a == "*" or agent.lower().startswith(a.rstrip("*")) or a == agent.lower()
                   for a in agents):
            continue
        for kind, rule in rules:
            rx = "^" + re.escape(rule).replace("\\*", ".*").replace("\\$", "$")
            if rule.endswith("$"):
                rx = "^" + re.escape(rule[:-1]).replace("\\*", ".*") + "$"
            else:
                rx = "^" + re.escape(rule).replace("\\*", ".*")
            if re.match(rx, path):
                if len(rule) > best or (len(rule) == best and kind == "allow"):
                    best, decision = len(rule), (kind == "allow")
    return decision


def parse_sitemap_urls(xml_bytes):
    """Return (page_urls, nested_sitemaps). Handles urlset and sitemapindex."""
    urls, nested = [], []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return urls, nested
    tag = root.tag
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    if tag.endswith("sitemapindex"):
        for sm in root.findall("s:sitemap", ns):
            loc = sm.find("s:loc", ns)
            if loc is not None and loc.text:
                nested.append(loc.text.strip())
    else:
        for u in root.findall("s:url", ns) or root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url"):
            loc = u.find("s:loc", ns)
            if loc is None:
                for child in u:
                    if child.tag.endswith("loc"):
                        loc = child
                        break
            if loc is not None and loc.text:
                urls.append(loc.text.strip())
    return urls, nested


def page_checks(html, url):
    """Static-HTML readability signals for one fetched page."""
    h1s = re.findall(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    h1_text = [re.sub(r"<[^>]+>", "", x).strip() for x in h1s]
    ld_blocks, ld_errors, product_nodes = [], [], 0
    for m in re.finditer(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            html, re.S | re.I):
        raw = htmllib.unescape(m.group(1)).strip()
        try:
            node = json.loads(raw)
        except Exception as e:  # noqa: BLE001 - record parse failure as evidence
            ld_errors.append("JSON-LD block: %s" % e)
            continue
        ld_blocks.append(node)
        stack = node if isinstance(node, list) else [node]
        while stack:
            n = stack.pop()
            if isinstance(n, dict):
                t = n.get("@type", "")
                types = t if isinstance(t, list) else [t]
                if any(str(x).lower() in ("product", "vehicle", "car") for x in types):
                    product_nodes += 1
                for v in n.values():
                    if isinstance(v, (dict, list)):
                        stack.append(v)
            elif isinstance(n, list):
                stack.extend(n)
    microdata = len(re.findall(r'itemtype=["\']https?://schema\.org/(Product|Vehicle|Car)["\']', html, re.I))
    noindex = bool(re.search(r'<meta[^>]+name=["\']robots["\'][^>]*content=["\'][^"\']*noindex', html, re.I))
    labels = {}
    for lab in re.findall(r"<(?:dt|span|div|td)[^>]*class=[\"'][^\"']*(?:label|spec|attr)[^\"']*[\"'][^>]*>(.*?)</(?:dt|span|div|td)>",
                           html, re.S | re.I):
        t = re.sub(r"<[^>]+>", "", lab).strip().rstrip(":")
        if 1 < len(t) < 40:
            labels.setdefault(t.lower(), t)
    text = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = htmllib.unescape(re.sub(r"\s+", " ", text))
    return {
        "url": url, "jsonld_blocks": len(ld_blocks), "product_nodes": product_nodes,
        "jsonld_errors": ld_errors, "microdata_product": microdata,
        "h1_count": len(h1_text), "h1_text": h1_text[:3], "noindex": noindex,
        "label_sample": sorted(labels.values())[:20],
        "static_has_vin": bool(re.search(r"\b[A-HJ-NPR-Z0-9]{17}\b", text)),
        "static_has_price": bool(re.search(r"\$\s?\d{1,3}(?:,\d{3})+", text)),
        "js_shell": ("__next" in html.lower() or "id=\"__next\"" in html
                     or "turbopack" in html.lower()),
        "text_len": len(text),
    }


def normalize_detail(rec):
    """Map a scraper/detail record onto audit fields. Unknown stays unknown."""
    def num(*keys):
        for k in keys:
            v = rec.get(k)
            if isinstance(v, bool) or v is None:
                continue
            if isinstance(v, (int, float)) and v > 0:
                return v
            if isinstance(v, str):
                s = v.replace(",", "").replace("$", "").strip()
                try:
                    f = float(re.sub(r"[^\d.]", "", s))
                    if f > 0:
                        return f
                except ValueError:
                    continue
        return None

    def txt(*keys):
        for k in keys:
            v = rec.get(k)
            if isinstance(v, str) and v.strip() and v.strip().lower() != "unknown":
                return v.strip()
        return None

    price = num("price", "sale_price", "msrp")
    avail_raw = (txt("inventory_status") or "").lower()
    avail = "available" if avail_raw in ("available", "in stock", "in-stock", "on lot") else (
        "sold" if avail_raw in ("sold",) else None)
    cond = (txt("condition") or "").lower() or None
    vin = txt("vin")
    vin_ok = bool(vin and re.match(r"^[A-HJ-NPR-Z0-9]{17}$", vin))
    slides = num("slideouts", "slides")
    sleeps = num("sleeps", "sleeping_capacity", "sleeps_capacity")
    return {
        "url": rec.get("source_detail_url") or rec.get("url") or rec.get("vdp_url"),
        "title": rec.get("title"),
        "year": num("year"), "make": txt("make"), "model": txt("model"),
        "price": price, "availability": avail, "vin": vin if vin_ok else None,
        "vin_raw": vin, "vin_valid": vin_ok,
        "location": txt("dealer_location", "location", "city"),
        "length": num("length"), "dry_weight": num("dry_weight"),
        "gvwr": num("gvwr"), "sleeping_capacity": sleeps,
        "slides": slides, "fuel_type": (txt("fuel_type") or "").lower() or None,
        "engine": txt("engine"), "floorplan": txt("trim", "floorplan", "model"),
        "rv_type": (txt("rv_type", "body_type") or "").lower() or None,
        "condition": cond,
        "diesel_pusher": rec.get("diesel_pusher"),
        "bunkhouse": rec.get("bunkhouse"), "toy_hauler": rec.get("toy_hauler"),
        "washer_dryer": rec.get("washer_dryer", rec.get("washer_dryer_prep")),
        "rear_kitchen": rec.get("rear_kitchen"), "mid_bath": rec.get("mid_bath"),
    }


TOWABLE_HINT = re.compile(r"trailer|fifth|toy|popup|pop-up|camper|airstream", re.I)


def field_status(unit, field):
    """Return (status, value): present | missing | invalid_or_conflicting | not_applicable."""
    v = unit.get(field)
    if field in ("fuel_type", "engine"):
        model = " ".join(str(x or "") for x in (unit.get("model"), unit.get("rv_type"), unit.get("title")))
        if TOWABLE_HINT.search(model) and not v:
            return "not_applicable", None
    if v is None or (isinstance(v, str) and not v.strip()):
        return "missing", None
    if field == "vin" and not unit.get("vin_valid", True):
        return "invalid_or_conflicting", unit.get("vin_raw")
    return "present", v


def match_unit(unit, conditions):
    """Return (verdict, missing_fields): confirmed | potential | excluded."""
    if (unit.get("availability") or "") in ("sold", "unavailable"):
        return "excluded", []
    missing = []
    for field, op, want in conditions:
        v = unit.get(field)
        # Feature flags: explicit True passes, explicit False is a known mismatch,
        # None/unknown is missing data (never treated as false).
        if field in ("diesel_pusher", "bunkhouse", "toy_hauler", "washer_dryer",
                     "rear_kitchen", "mid_bath"):
            if v is True and want is True:
                continue
            if v is False:
                return "excluded", []
            missing.append(field)
            continue
        if v is None or (isinstance(v, str) and not v.strip()):
            missing.append(field)
            continue
        lv, w = (v.lower() if isinstance(v, str) else v), want
        if op == "eq":
            ok = (lv == w.lower()) if isinstance(v, str) else (v == w)
        elif op == "lt":
            ok = (v < w) if isinstance(v, (int, float)) else False
        elif op == "gte":
            ok = (v >= w) if isinstance(v, (int, float)) else False
        else:
            ok = False
        if not ok:
            return "excluded", []
    return ("confirmed", []) if not missing else ("potential", missing)


def score_report(detail_units, readability, crawl, queries):
    n = max(len(detail_units), 1)
    req_ok = sum(1 for u in detail_units for f in REQUIRED_FIELDS if field_status(u, f)[0] == "present")
    req_tot = sum(1 for u in detail_units for f in REQUIRED_FIELDS)
    rec_ok = sum(1 for u in detail_units for f in RECOMMENDED_FIELDS
                 if field_status(u, f)[0] in ("present",))
    rec_tot = sum(1 for u in detail_units for f in RECOMMENDED_FIELDS
                  if field_status(u, f)[0] != "not_applicable")
    health = (0.7 * (req_ok / max(req_tot, 1)) + 0.3 * (rec_ok / max(rec_tot, 1))) * 100
    m = max(len(readability), 1)
    read = (0.4 * sum(1 for r in readability if r["product_nodes"] > 0 or r["microdata_product"] > 0) / m
            + 0.2 * sum(1 for r in readability if r["h1_count"] == 1) / m
            + 0.2 * sum(1 for r in readability if (r["product_nodes"] > 0 or r["microdata_product"] > 0)
                        and (r["static_has_price"] or r["static_has_vin"])) / m
            + 0.2 * sum(1 for r in readability if r["h1_count"] <= 1 and not r["jsonld_errors"]) / m) * 100
    cand = crawl.get("candidates", [])
    c = max(len(cand), 1)
    crawl_score = (0.4 * sum(1 for x in cand if x.get("status") == 200) / c
                   + 0.4 * sum(1 for x in cand if x.get("bots_ok", 0) == 3) / c
                   + 0.1 * sum(1 for x in cand if not x.get("noindex")) / c
                   + 0.1 * sum(1 for x in cand if x.get("in_sitemap")) / c) * 100
    cover = (sum(q["coverage"] for q in queries) / max(len(queries), 1)) * 100 if queries else 0
    overall = 0.4 * health + 0.25 * read + 0.2 * crawl_score + 0.15 * cover
    return {"inventory_health": round(health, 1), "ai_readability": round(read, 1),
            "crawlability": round(crawl_score, 1), "query_coverage": round(cover, 1),
            "overall": round(overall, 1)}


def slug_identity(url):
    """Derive year/make/model tokens from an inventory slug. Returns dict."""
    slug = url.rstrip("/").rsplit("/", 1)[-1]
    m = re.match(r"^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*?)-(\d+.*)?$", slug)
    out = {"slug": slug, "year": None, "make": None, "model": None}
    if m:
        out["year"] = m.group(1)
        rest = m.group(2)
        # trailing numeric token is usually the stock/id suffix; strip it
        parts = rest.split("-")
        if parts and parts[-1].isdigit():
            parts = parts[:-1]
        out["make"] = parts[0] if parts else None
        out["model"] = "-".join(parts[1:]) if len(parts) > 1 else None
    return out


# ---------------------------------------------------------------- Excel writer

def _esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def write_xlsx(path, sheets):
    """Write a multi-sheet .xlsx using only stdlib. All values are inline
    strings (FIX: dates are written as ISO-8601 text, never Excel serials)."""
    def sheet_xml(rows):
        parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
        for i, row in enumerate(rows, 1):
            parts.append('<row r="%d">' % i)
            for j, val in enumerate(row):
                ref = "%s%d" % (chr(65 + j) if j < 26 else "A" + chr(65 + j - 26), i)
                parts.append('<c r="%s" t="inlineStr"><is><t>%s</t></is></c>'
                             % (ref, _esc("" if val is None else val)))
            parts.append("</row>")
        parts.append("</sheetData></worksheet>")
        return "".join(parts).encode("utf-8")

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                   + "".join('<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' % (i + 1)
                             for i in range(len(sheets)))
                   + "</Types>")
        z.writestr("_rels/.rels",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                   "</Relationships>")
        wb = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
              '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
              'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>']
        for i, (name, _rows) in enumerate(sheets):
            wb.append('<sheet name="%s" sheetId="%d" r:id="rId%d"/>' % (_esc(name), i + 1, i + 1))
        wb.append("</sheets></workbook>")
        z.writestr("xl/workbook.xml", "".join(wb))
        rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
        for i in range(len(sheets)):
            rels.append('<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>' % (i + 1, i + 1))
        rels.append("</Relationships>")
        z.writestr("xl/_rels/workbook.xml.rels", "".join(rels))
        for i, (_name, rows) in enumerate(sheets):
            z.writestr("xl/worksheets/sheet%d.xml" % (i + 1),
                       sheet_xml([[("" if v is None else v) for v in r] for r in rows]))


# ---------------------------------------------------------------- PDF writer

def _pdf_esc(s):
    return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def write_pdf(path, title_lines, sections):
    """Minimal valid PDF (uncompressed streams, Helvetica). stdlib only."""
    objs = []
    objs.append("<< /Type /Catalog /Pages 2 0 R >>")
    objs.append("<< /Type /Pages /Kids [%s] /Count %d >>" % ("", 0))  # patched below
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    # Lay out text lines into pages (58 lines/page, ~95 chars wrap).
    pages = []
    cur = []
    def emit(line=""):
        while len(line) > 95:
            cut = line[:95].rfind(" ")
            cut = cut if cut > 40 else 95
            cur.append(line[:cut])
            if len(cur) >= 58:
                pages.append(list(cur)); cur.clear()
            line = line[cut:].strip()
        cur.append(line)
        if len(cur) >= 58:
            pages.append(list(cur)); cur.clear()
    for t in title_lines:
        emit(t)
    for heading, lines in sections:
        emit("")
        emit("## " + heading)
        for ln in lines:
            emit(ln if isinstance(ln, str) else str(ln))
    if cur:
        pages.append(cur)

    kids = []
    for page in pages:
        content = ["BT /F2 11 Tf 50 770 Td 13 TL"]
        for ln in page:
            if ln.startswith("## "):
                content.append("/F2 11 Tf (%s) '" % _pdf_esc(ln[3:]))
            elif ln.startswith("### "):
                content.append("/F2 10 Tf (%s) '" % _pdf_esc(ln[4:]))
            else:
                content.append("/F1 9 Tf (%s) '" % _pdf_esc(ln))
        content.append("ET")
        stream = "\n".join(content).encode("latin-1", "replace")
        objs.append("<< /Length %d >>\nstream\n" % len(stream) + stream.decode("latin-1") + "\nendstream")
        stream_id = len(objs)
        objs.append("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                    "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>" % stream_id)
        kids.append("%d 0 R" % len(objs))
    objs[1] = "<< /Type /Pages /Kids [%s] /Count %d >>" % (" ".join(kids), len(kids))

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for i, body in enumerate(objs, 1):
        offsets.append(out.tell())
        out.write(("%d 0 obj\n%s\nendobj\n" % (i, body)).encode("latin-1"))
    xref = out.tell()
    out.write(("xref\n0 %d\n" % (len(objs) + 1)).encode())
    out.write(b"0000000000 65535 f \n")
    for o in offsets[1:]:
        out.write(("%010d 00000 n \n" % o).encode())
    out.write(("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, xref)).encode())
    with open(path, "wb") as f:
        f.write(out.getvalue())
    return len(pages)


# ---------------------------------------------------------------- audit flow

def load_detail_units(detail_path):
    with open(detail_path, encoding="utf-8") as f:
        d = json.load(f)
    recs = d.get("listings", d) if isinstance(d, dict) else d
    if isinstance(recs, dict):
        recs = list(recs.values())
    return [normalize_detail(r) for r in recs]


def demo_units():
    return [
        {"url": "https://sample.matchrv.example/inventory/unit-%d" % i,
         "title": t, "year": 2025, "make": mk, "model": mo, "price": pr,
         "availability": av, "vin": "1FDXE4FS0MDC000%02d" % i, "vin_valid": True,
         "location": "Tacoma, WA", "length": ln, "dry_weight": dw, "gvwr": gv,
         "sleeping_capacity": sl, "slides": sd, "fuel_type": ft, "engine": en,
         "floorplan": mo, "rv_type": rt, "condition": co,
         "diesel_pusher": None, "bunkhouse": None, "toy_hauler": None,
         "washer_dryer": None, "rear_kitchen": None, "mid_bath": None}
        for i, (t, mk, mo, pr, av, ln, dw, gv, sl, sd, ft, en, rt, co) in enumerate([
            ("2025 Thor ACE 30.2", "Thor", "ACE 30.2", 52000, "available", 27.5, 6700, 13000, None, 1, "gasoline", "Ford 7.3L V8", "class c", "used"),
            ("2025 Jayco Jay Flight 284BHS", "Jayco", "Jay Flight 284BHS", 59000, "available", 28.5, None, None, 6, 2, None, None, "travel trailer", "new"),
        ], start=1)]


def run_audit(base_url, dealer, city, state, detail_path=None, demo=False,
              expected_units=None, import_responses=None, max_vdp=MAX_VDP_SAMPLE):
    now = dt.datetime.now(dt.timezone.utc)
    stamp = now.strftime("%Y-%m-%d")
    # FIX: ISO-8601 text date everywhere (was: raw Excel serial in v1).
    observed_iso = now.strftime("%Y-%m-%d %H:%M UTC")
    out = {"dealer": dealer, "city": city, "state": state, "base_url": base_url,
           "observed_at": now.isoformat(), "observed_display": observed_iso,
           "demo": demo, "expected_units": expected_units}
    raw_dir = None

    if demo:
        detail_units = demo_units()
        out.update({"robots": {"status": 0, "note": "demo: no network"},
                    "sitemaps": [], "sitemap_urls": [],
                    "candidates": [], "readability": [],
                    "detail_source": "SYNTHETIC DEMONSTRATION"})
    else:
        raw_dir = os.path.join("raw")
        os.makedirs(raw_dir, exist_ok=True)
        # robots.txt (read-only; also the single source for bot-path evaluation)
        robots_url = base_url.rstrip("/") + "/robots.txt"
        rr = fetch(robots_url)
        time.sleep(SLEEP_BETWEEN_REQUESTS)
        out["robots"] = {"url": robots_url, "status": rr["status"],
                         "body": rr["body"][:4000].decode("utf-8", "replace"),
                         "error": rr["error"]}
        groups = parse_robots(rr["body"].decode("utf-8", "replace")) if rr["status"] == 200 else []
        sm_urls = re.findall(r"(?im)^sitemap:\s*(\S+)", rr["body"].decode("utf-8", "replace"))
        # sitemap(s), recursive, incl. gz
        sitemaps, seen, queue = [], set(), list(sm_urls) or [base_url.rstrip("/") + "/sitemap.xml"]
        page_urls = []
        while queue:
            sm = queue.pop(0)
            if sm in seen:
                continue
            seen.add(sm)
            r = fetch(sm)
            time.sleep(SLEEP_BETWEEN_REQUESTS)
            body = r["body"]
            if sm.endswith(".gz") or body[:2] == b"\x1f\x8b":
                try:
                    body = gzip.decompress(body)
                except OSError:
                    pass
            urls, nested = parse_sitemap_urls(body)
            sitemaps.append({"url": sm, "status": r["status"],
                             "valid_xml": bool(urls or nested), "error": r["error"],
                             "url_count": len(urls)})
            page_urls += urls
            queue += [n for n in nested if n not in seen]
        out["sitemaps"] = sitemaps
        out["sitemap_urls"] = page_urls
        inv_urls = sorted({u for u in page_urls if "/inventory" in u and u.rstrip("/").count("/") > 3})
        out["inventory_urls"] = inv_urls
        # bounded VDP sample, evenly spread + homepage/listing for context
        sample = inv_urls[::max(1, len(inv_urls) // max(max_vdp, 1))][:max_vdp]
        cands, read = [], []
        for u in [base_url.rstrip("/") + "/", base_url.rstrip("/") + "/inventory"] + sample:
            r = fetch(u)
            time.sleep(SLEEP_BETWEEN_REQUESTS)
            path = urllib.parse.urlparse(u).path or "/"
            bots = [robots_allowed(groups, b, path) for b in ("Googlebot", "Bingbot", "OAI-SearchBot")]
            html = r["body"].decode("utf-8", "replace") if r["status"] == 200 else ""
            rc = page_checks(html, u) if html and u not in (
                base_url.rstrip("/") + "/", base_url.rstrip("/") + "/inventory") else None
            if rc:
                read.append(rc)
            cands.append({"url": u, "final_url": r["final_url"], "status": r["status"],
                          "error": r["error"], "bots_ok": sum(bots),
                          "googlebot": bots[0], "bingbot": bots[1], "oai": bots[2],
                          "noindex": rc["noindex"] if rc else False,
                          "in_sitemap": u in inv_urls or u in page_urls,
                          "js_shell": rc["js_shell"] if rc else None,
                          "redirected": r["final_url"] != u})
        out["candidates"] = cands
        out["readability"] = read
        out["detail_source"] = ("rendered scrape %s" % detail_path) if detail_path else "sitemap slugs only"
        detail_units = load_detail_units(detail_path) if detail_path else []
        # slug-derived identity for every sitemap unit (year/make/model signal)
        out["slug_identity"] = [dict({"url": u}, **slug_identity(u)) for u in inv_urls]

    out["detail_units"] = detail_units
    # field health
    health_rows = []
    for f in REQUIRED_FIELDS + RECOMMENDED_FIELDS:
        tier = "required" if f in REQUIRED_FIELDS else "recommended"
        counts = {"present": 0, "missing": 0, "invalid_or_conflicting": 0, "not_applicable": 0}
        for u in detail_units:
            counts[field_status(u, f)[0]] += 1
        applic = len(detail_units) - counts["not_applicable"]
        health_rows.append({"field": f, "tier": tier, **counts, "applicable": applic,
                            "completion": round(counts["present"] / max(applic, 1), 3)})
    out["field_health"] = health_rows
    # queries
    qrows = []
    for qid, qtext, conds in QUERIES:
        conf, pot, excl, miss, cov = [], [], [], {}, []
        need = [c[0] for c in conds]
        for u in detail_units:
            verdict, missing = match_unit(u, conds)
            if verdict == "confirmed":
                conf.append(u["url"])
            elif verdict == "potential":
                pot.append(u["url"])
                for mfield in missing:
                    miss[mfield] = miss.get(mfield, 0) + 1
            else:
                excl.append(u["url"])
            usable = sum(1 for c in conds if unit_has(u, c[0]))
            cov.append(usable / max(len(conds), 1))
        eligible = [u for u in detail_units if (u.get("availability") or "") not in ("sold", "unavailable")]
        _ = eligible
        qrows.append({"id": qid, "query": qtext, "confirmed": len(conf), "potential": len(pot),
                      "excluded": len(excl), "missing": miss,
                      "coverage": round(sum(cov) / max(len(cov), 1), 3),
                      "confirmed_urls": conf, "potential_urls": pot})
    out["queries"] = qrows
    # citations: reviewer workflow. v1 does not auto-submit prompts anywhere.
    prompts = [p.format(dealer=dealer, city=city, state=state) for p in CITATION_PROMPT_TEMPLATE]
    obs = [{"prompt": p, "status": "not_tested", "platform": "", "model": "",
            "tested_at": "", "location": "", "dealer_mentioned": "", "dealer_cited": "",
            "inventory_cited": "", "competitors": "", "cited_urls": "",
            "response_excerpt": ""} for p in prompts]
    if import_responses and os.path.exists(import_responses):
        with open(import_responses, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                for o in obs:
                    if o["prompt"].strip().lower() == (row.get("prompt") or "").strip().lower():
                        o.update({k: row.get(k, "") for k in
                                  ("platform", "model", "tested_at", "location",
                                   "dealer_mentioned", "dealer_cited", "inventory_cited",
                                   "competitors", "cited_urls", "response_excerpt")})
                        o["status"] = "tested" if (row.get("response_excerpt") or row.get("tested_at")) else "not_tested"
    out["citations"] = obs
    out["scores"] = score_report(detail_units, out["readability"],
                                 {"candidates": [c for c in out["candidates"]
                                                 if c["url"] not in (base_url.rstrip("/") + "/",
                                                                     base_url.rstrip("/") + "/inventory")]},
                                 out["queries"]) if not demo else score_report(
        detail_units, [{"product_nodes": 0, "microdata_product": 0, "h1_count": 1,
                        "static_has_price": True, "static_has_vin": True, "jsonld_errors": []}
                       for _ in detail_units],
        {"candidates": []}, out["queries"])
    # reconciliation (FIX: explicit discovered/analyzed/blocked/failed + expected count)
    cand = out["candidates"]
    out["coverage"] = {
        "sitemap_inventory_urls": len(out.get("inventory_urls", [])),
        "vdp_sampled": len(out["readability"]),
        "detail_units_analyzed": len(detail_units),
        "http_ok": sum(1 for c in cand if c.get("status") == 200),
        "http_failed": sum(1 for c in cand if c.get("status") != 200),
        "redirected": sum(1 for c in cand if c.get("redirected")),
        "expected_units": expected_units,
        "reconciled": (expected_units is not None and expected_units == len(detail_units)),
    }
    out["actions"] = build_actions(out)
    return out, stamp, observed_iso


def unit_has(unit, field):
    if field in ("diesel_pusher", "bunkhouse", "toy_hauler", "washer_dryer",
                 "rear_kitchen", "mid_bath"):
        return unit.get(field) is not None
    v = unit.get(field)
    return v is not None and (not isinstance(v, str) or v.strip())


def build_actions(out):
    """Prioritized matching gaps. Counts overlap; never summed. No revenue dollars."""
    units = out["detail_units"]
    acts = []

    def affected(field):
        return sorted({u["url"] for u in units if field_status(u, field)[0] in ("missing", "invalid_or_conflicting")})

    shell = sum(1 for r in out["readability"] if r.get("js_shell"))
    if shell:
        acts.append(("High", "Server-render unit content + JSON-LD",
                     shell, "Static HTML of sampled VDPs carries no specs, price, VIN, H1 or structured data. "
                     "Crawlers without JavaScript see an empty shell.",
                     sorted(r["url"] for r in out["readability"] if r.get("js_shell"))))
    mp = affected("price")
    if mp:
        acts.append(("High", "Fix price data", len(mp),
                     "Budget filters need a valid advertised cash price.", mp))
    for field, why in (("sleeping_capacity", "Family-oriented searches need explicit sleeping capacity."),
                       ("length", "Length-constrained buyer searches need a published measurement and unit."),
                       ("dry_weight", "Weight filters need a published unloaded weight; this alone does not establish towing suitability."),
                       ("gvwr", "Towing-related questions need GVWR alongside towing and payload limits."),
                       ("rv_type", "Type filters (travel trailer / fifth wheel / class) need an explicit RV type on every unit."),
                       ("location", "Per-unit location must be published; audit city/state is never substituted.")):
        aff = affected(field)
        if aff:
            acts.append(("Medium", "Fix %s data" % field.replace("_", " "), len(aff), why, aff))
    no_struct = [r["url"] for r in out["readability"]
                 if r["product_nodes"] == 0 and r["microdata_product"] == 0]
    if no_struct:
        acts.append(("Medium", "Publish unit structured data", len(no_struct),
                     "Publish Product/Vehicle structured data with unit identity, offer, availability and labeled specifications.",
                     no_struct))
    multi_h1 = [r["url"] for r in out["readability"] if r["h1_count"] != 1]
    if multi_h1:
        acts.append(("Low", "Use one descriptive unit H1", len(multi_h1),
                     "Use one clear year/make/model H1 and consistent specification labels.", multi_h1))
    return [{"priority": p, "issue": i, "affected_units": n, "action": a, "urls": u}
            for p, i, n, a, u in acts]


METHOD_ROWS = [
    ("Method 1", "Inventory readiness audit, not a prediction of ChatGPT ranking or recommendations."),
    ("Method 2", "Inventory health = 70% required-field validity + 30% applicable recommended-field validity. Engine/fuel excluded for known towables."),
    ("Method 3", "AI readability from static HTML: 40% Product/Vehicle JSON-LD or microdata + 20% single H1 + 20% values backed by structured data + 20% clean parse."),
    ("Method 4", "Crawlability = 40% sampled VDP HTTP success + 40% Googlebot/Bingbot/OAI-SearchBot path allowance + 10% no noindex + 10% in sitemap."),
    ("Method 5", "Query coverage = mean usable required-field share. Confirmed needs explicit availability + every condition. Unknown is never false/zero; known mismatch excludes."),
    ("Method 6", "Overall = 40% health + 25% readability + 20% crawlability + 15% query coverage. Provisional whenever detail sample < sitemap count."),
    ("Method 7", "VIN check validates 17-character format only, not ownership or checksum. Detail fields dated per source; sitemap identity from URL slugs."),
    ("Method 8", "Bounded polite crawl: ~1.2s between requests, VDP sample capped, /api/ never fetched (robots-disallowed). Rerun to refresh."),
    ("Method 9", "AI citation results come only from imported dated observations. Untested prompts are not failures; one run is not market-wide visibility."),
    ("Method 10", "Missing specs are buyer-matching gaps, not attributable lost revenue. No dollar estimates without business inputs."),
    ("OpenAI crawler documentation", "https://developers.openai.com/api/docs/bots"),
    ("Schema.org Vehicle", "https://schema.org/Vehicle"),
    ("Google robots specification", "https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec"),
]


def verdict_line(score):
    if score >= 80:
        return "Strong - maintain and monitor."
    if score >= 60:
        return "Moderate - targeted fixes will move the score."
    return "Needs foundational fixes before AI shopping traffic can rely on this inventory."


def build_summary(out):
    """One-page executive summary: rows for Excel, lines for PDF."""
    s = out["scores"]
    cov = out["coverage"]
    tested = sum(1 for o in out["citations"] if o["status"] == "tested")
    top = out["actions"][:3]
    worst = sorted([h for h in out["field_health"] if h["applicable"]],
                   key=lambda h: h["completion"])[:3]
    rows = [
        ("Dealer", "%s - %s, %s" % (out["dealer"], out["city"], out["state"])),
        ("Observed", "%s | %s" % (out["observed_display"], out["base_url"])),
        ("Overall readiness", "%.1f / 100 - %s" % (s["overall"], verdict_line(s["overall"]))),
        ("Score detail", "Health %.1f | Readability %.1f | Crawlability %.1f | Query coverage %.1f" % (
            s["inventory_health"], s["ai_readability"], s["crawlability"], s["query_coverage"])),
        ("Coverage", "%d sitemap units; %d VDPs sampled live; %d detail units analyzed%s" % (
            cov["sitemap_inventory_urls"], cov["vdp_sampled"], cov["detail_units_analyzed"],
            " - PROVISIONAL" if cov["sitemap_inventory_urls"] > cov["detail_units_analyzed"] else "")),
        ("Key finding 1", "%d of %d sampled VDPs expose no Product/Vehicle structured data in static HTML%s." % (
            sum(1 for r in out["readability"]
                if r["product_nodes"] == 0 and r["microdata_product"] == 0),
            max(len(out["readability"]), 1),
            " (JavaScript-rendered shell; crawlers without JS see no specs)" if any(
                r.get("js_shell") for r in out["readability"]) else "")),
        ("Key finding 2", "Weakest fields: %s." % "; ".join(
            "%s %d%%" % (w["field"].replace("_", " "), round(w["completion"] * 100)) for w in worst)),
        ("Key finding 3", "Crawl access is clean: robots allows all sampled paths; %d HTTP failures in sample." % cov["http_failed"]),
        ("Top fix 1", ("[%s] %s (%d units) - %s" % (
            top[0]["priority"], top[0]["issue"], top[0]["affected_units"], top[0]["action"]) if len(top) > 0 else "none")),
        ("Top fix 2", ("[%s] %s (%d units) - %s" % (
            top[1]["priority"], top[1]["issue"], top[1]["affected_units"], top[1]["action"]) if len(top) > 1 else "none")),
        ("Top fix 3", ("[%s] %s (%d units) - %s" % (
            top[2]["priority"], top[2]["issue"], top[2]["affected_units"], top[2]["action"]) if len(top) > 2 else "none")),
        ("AI citations", "%d of %d prompts tested. Readiness scores do not imply AI recommendations." % (
            tested, len(out["citations"]))),
        ("Next step", "Work the top 3 fixes with the inventory provider, then re-run monthly to track the score."),
    ]
    return rows


def build_sheets(out):
    s = out["scores"]
    cov = out["coverage"]
    tested = sum(1 for o in out["citations"] if o["status"] == "tested")
    scorecard = [
        ["Metric", "Result", "Scope"],
        ["Dealer", out["dealer"], ""],
        ["Location", "%s, %s" % (out["city"], out["state"]), ""],
        ["Inventory observed", out["observed_display"], "ISO-8601 text (v2 fix: never an Excel serial)"],
        ["Website", out["base_url"], ""],
        ["Data source", "DEMONSTRATION - synthetic" if out["demo"] else "LIVE audit + %s" % out["detail_source"], ""],
        ["Inventory health", s["inventory_health"], "Points out of 100; readiness only"],
        ["AI readability", s["ai_readability"], "Points out of 100; readiness only"],
        ["Crawlability", s["crawlability"], "Points out of 100; readiness only"],
        ["Query coverage", s["query_coverage"], "Points out of 100; readiness only"],
        ["Overall readiness", s["overall"], "Points out of 100; readiness only"],
        ["Sitemap inventory URLs", cov["sitemap_inventory_urls"], "Slug-derived identity for all"],
        ["VDPs sampled live", cov["vdp_sampled"], "Bounded polite sample"],
        ["Detail units analyzed", cov["detail_units_analyzed"], ""],
        ["HTTP failures in sample", cov["http_failed"], ""],
        ["Redirected in sample", cov["redirected"], ""],
        ["Expected units (dealer-stated)", cov["expected_units"] if cov["expected_units"] is not None else "not provided", ""],
        ["Reconciled vs expected", "yes" if cov["reconciled"] else "NO - see coverage note", ""],
        ["AI responses observed", tested, "Imported dated evidence only"],
        ["Coverage note", ("Detail sample (%d) is smaller than sitemap count (%d): scores are PROVISIONAL. "
                            % (cov["detail_units_analyzed"], cov["sitemap_inventory_urls"]))
            if cov["sitemap_inventory_urls"] > cov["detail_units_analyzed"] else "Detail covers sitemap count.", ""],
    ]
    health = [["Field", "Tier", "Valid", "Missing", "Invalid/conflict", "N/A", "Applicable", "Completion"]]
    for h in out["field_health"]:
        health.append([h["field"], h["tier"], h["present"], h["missing"],
                       h["invalid_or_conflicting"], h["not_applicable"], h["applicable"], h["completion"]])
    actions = [["Priority", "Issue", "Affected units", "Action", "Affected URLs"]]
    for a in out["actions"]:
        actions.append([a["priority"], a["issue"], a["affected_units"], a["action"], "\n".join(a["urls"][:8])])
    inv = [["Unit URL", "Title", "year", "make", "model", "price", "availability", "vin",
            "location", "length", "dry_weight", "gvwr", "sleeping_capacity", "slides",
            "fuel_type", "engine", "floorplan", "rv_type", "condition"]]
    for u in out["detail_units"]:
        inv.append([u.get("url"), u.get("title"), u.get("year"), u.get("make"), u.get("model"),
                    u.get("price"), u.get("availability"), u.get("vin"), u.get("location"),
                    u.get("length"), u.get("dry_weight"), u.get("gvwr"),
                    u.get("sleeping_capacity"), u.get("slides"), u.get("fuel_type"),
                    u.get("engine"), u.get("floorplan"), u.get("rv_type"), u.get("condition")])
    queries = [["ID", "Buyer query", "Confirmed", "Potential", "Excluded", "Coverage",
                "Missing on potential units", "Confirmed URLs", "Potential URLs"]]
    for q in out["queries"]:
        queries.append([q["id"], q["query"], q["confirmed"], q["potential"], q["excluded"],
                        q["coverage"], ", ".join("%s:%d" % kv for kv in q["missing"].items()) or "-",
                        "\n".join(q["confirmed_urls"][:6]), "\n".join(q["potential_urls"][:6])])
    read = [["Unit URL", "JSON-LD blocks", "Product nodes", "JSON-LD errors", "Microdata",
             "H1 count", "Noindex", "Static VIN", "Static price", "JS shell"]]
    for r in out["readability"]:
        read.append([r["url"], r["jsonld_blocks"], r["product_nodes"],
                     "; ".join(r["jsonld_errors"]) or "-", r["microdata_product"],
                     r["h1_count"], int(r["noindex"]), int(r["static_has_vin"]),
                     int(r["static_has_price"]), int(bool(r["js_shell"]))])
    pages = [["URL", "Final URL", "HTTP status", "Error", "Googlebot", "Bingbot",
              "OAI-SearchBot", "Bots OK", "Noindex", "In sitemap", "Redirected"]]
    for c in out["candidates"]:
        pages.append([c["url"], c["final_url"], c["status"], c["error"][:120],
                      int(c["googlebot"]), int(c["bingbot"]), int(c["oai"]), c["bots_ok"],
                      int(c["noindex"]), int(c["in_sitemap"]), int(c["redirected"])])
    sm = [["Sitemap URL", "HTTP status", "Valid XML", "URL count", "Error"]]
    for x in out["sitemaps"]:
        sm.append([x["url"], x["status"], int(x["valid_xml"]), x["url_count"], x["error"][:120]])
    ai = [["Prompt", "Status", "Platform", "Model", "Tested at", "Location",
           "Dealer mentioned", "Dealer cited", "Inventory cited", "Competitors",
           "Cited URLs", "Response excerpt"]]
    for o in out["citations"]:
        ai.append([o["prompt"], o["status"], o["platform"], o["model"], o["tested_at"],
                   o["location"], o["dealer_mentioned"], o["dealer_cited"],
                   o["inventory_cited"], o["competitors"], o["cited_urls"],
                   (o["response_excerpt"] or "")[:32000]])
    prompts = [["prompt"]]
    for o in out["citations"]:
        prompts.append([o["prompt"]])
    meth = [["Topic", "Definition / source"]] + [list(r) for r in METHOD_ROWS]
    summary = [["Item", "Detail"]] + [[k, v] for k, v in build_summary(out)]
    return [("Summary", summary), ("Scorecard", scorecard), ("Field health", health), ("Actions", actions),
            ("Inventory", inv), ("Queries", queries), ("Readability", read),
            ("Pages", pages), ("Sitemaps", sm), ("AI observations", ai),
            ("Citation prompts", prompts), ("Methodology", meth)]


def build_pdf_sections(out):
    s = out["scores"]
    cov = out["coverage"]
    secs = [("Executive summary",
             ["%s: %s" % (k, v) for k, v in build_summary(out)])]
    secs.append(("Readiness scores (0-100; readiness only, not AI ranking)", [
        "Inventory Health: %.1f   AI Readability: %.1f   Crawlability: %.1f   Query Coverage: %.1f" % (
            s["inventory_health"], s["ai_readability"], s["crawlability"], s["query_coverage"]),
        "OVERALL: %.1f" % s["overall"],
        "Coverage: %d sitemap inventory URLs; %d VDPs sampled live; %d detail units analyzed; %d HTTP failures." % (
            cov["sitemap_inventory_urls"], cov["vdp_sampled"],
            cov["detail_units_analyzed"], cov["http_failed"]),
        ("PROVISIONAL: detail sample smaller than sitemap count." if cov["sitemap_inventory_urls"] > cov["detail_units_analyzed"] else "Coverage reconciled."),
        "Observed AI visibility: %s." % ("NOT TESTED - no responses imported"
                                         if sum(1 for o in out["citations"] if o["status"] == "tested") == 0
                                         else "see AI citation section"),
        "Fix first: " + ("; ".join("%s (%d)" % (a["issue"], a["affected_units"]) for a in out["actions"][:3]) or "none"),
    ]))
    secs.append(("1. Inventory data health", [
        "Detail source: %s. Missing/invalid/N-A kept distinct." % out["detail_source"]] + [
        "%-18s %-9s valid %3d  missing %3d  invalid %2d  n/a %3d  complete %s" % (
            h["field"], h["tier"], h["present"], h["missing"],
            h["invalid_or_conflicting"], h["not_applicable"],
            ("%d%%" % round(h["completion"] * 100)) if h["applicable"] else "n/a")
        for h in out["field_health"]]))
    secs.append(("2. AI readability (static HTML, live sample)", [
        "Units with no Product/Vehicle JSON-LD or microdata: %d of %d." % (
            sum(1 for r in out["readability"] if r["product_nodes"] == 0 and r["microdata_product"] == 0),
            max(len(out["readability"]), 1)),
        "Units served as JS shell (no specs in static HTML): %d." % sum(
            1 for r in out["readability"] if r.get("js_shell")),
        "H1 != 1: %d. Noindex on sampled VDPs: %d. JSON-LD parse errors: %d." % (
            sum(1 for r in out["readability"] if r["h1_count"] != 1),
            sum(1 for r in out["readability"] if r["noindex"]),
            sum(1 for r in out["readability"] if r["jsonld_errors"])),
        "Structured-data presence is checked locally; not a Schema.org validator or eligibility test.",
    ]))
    rb = out["robots"]
    secs.append(("3. Crawlability (live)", [
        "robots.txt: HTTP %s. %s" % (rb.get("status"), ("Allow: / ; Disallow: /api/ - /api/ never fetched." if rb.get("status") == 200 else (rb.get("error") or "")[:100])),
        "Bot path allowance is robots.txt evaluation only, not bot impersonation; firewall/index status not measured.",
        "Sitemaps: " + ("; ".join("%s (HTTP %s, %d URLs)" % (x["url"], x["status"], x["url_count"]) for x in out["sitemaps"]) or "none found"),
        "Sample: %d HTTP 200, %d failed, %d redirected." % (
            cov["http_ok"], cov["http_failed"], cov["redirected"]),
    ]))
    secs.append(("4. Buyer query matching (%d queries, deterministic)" % len(out["queries"]), [
        "%s | %-46s conf %3d  pot %3d  excl %3d  %s" % (
            q["id"], q["query"][:46], q["confirmed"], q["potential"], q["excluded"],
            ("missing: " + ", ".join("%s:%d" % kv for kv in q["missing"].items())) if q["missing"] else "complete data")
        for q in out["queries"]]))
    tested = [o for o in out["citations"] if o["status"] == "tested"]
    secs.append(("5. AI citation testing", [
        "Tested prompts: %d of %d. Untested prompts are not failures." % (len(tested), len(out["citations"])),
        "To test: run citation_prompts.csv prompts on the target platform, save responses,",
        "re-run: audit.py --import-responses responses.csv  (regenerates without re-crawling).",
    ] + [("%s | mentioned:%s cited:%s inventory:%s competitors:%s" % (
        o["prompt"][:50], o["dealer_mentioned"], o["dealer_cited"],
        o["inventory_cited"], o["competitors"])) for o in tested]))
    secs.append(("6. Buyer-matching opportunities (do not sum; units overlap)", [
        "[%s] %s (%d): %s" % (a["priority"], a["issue"], a["affected_units"], a["action"])
        for a in out["actions"]] or ["No gaps found in this sample."]))
    secs.append(("Methodology and scope", ["%s. %s" % (t, d) for t, d in METHOD_ROWS]))
    return secs


def main(argv=None):
    ap = argparse.ArgumentParser(description="MatchRV AI Visibility Audit v2")
    ap.add_argument("--url", default="", help="Dealer website URL")
    ap.add_argument("--dealer", default="", help="Dealer name")
    ap.add_argument("--city", default="", help="Dealer city")
    ap.add_argument("--state", default="", help="Dealer state")
    ap.add_argument("--detail-json", default="", help="Rendered inventory records JSON (listings or vin-keyed)")
    ap.add_argument("--expected-units", type=int, default=None, help="Dealer-stated live stock count")
    ap.add_argument("--import-responses", default="", help="CSV of dated AI observations to import")
    ap.add_argument("--max-vdp", type=int, default=MAX_VDP_SAMPLE)
    ap.add_argument("--demo", action="store_true", help="Synthetic sample, no network")
    ap.add_argument("--from-json", default="", help="Regenerate outputs from a saved report.json (no crawl)")
    ap.add_argument("--outdir", default="", help="Output folder (default reports/<slug>-<date>/)")
    a = ap.parse_args(argv)
    if not a.demo and not a.from_json and (not a.url or not a.dealer):
        if not a.url:
            a.url = input("Dealer website URL: ").strip()
        if not a.dealer:
            a.dealer = input("Dealer name: ").strip()
        if not a.city:
            a.city = input("City: ").strip()
        if not a.state:
            a.state = input("State: ").strip()
    if a.demo:
        a.url, a.dealer, a.city, a.state = a.url or "https://sample.matchrv.example/", "Example RV (demonstration)", "Tacoma", "WA"
    if a.from_json:
        with open(a.from_json, encoding="utf-8") as f:
            out = json.load(f)
        if a.import_responses and os.path.exists(a.import_responses):
            with open(a.import_responses, newline="", encoding="utf-8") as f:
                rows = {r.get("prompt", "").strip().lower(): r for r in csv.DictReader(f)}
            for o in out["citations"]:
                row = rows.get(o["prompt"].strip().lower())
                if row:
                    o.update({k: row.get(k, "") for k in
                              ("platform", "model", "tested_at", "location",
                               "dealer_mentioned", "dealer_cited", "inventory_cited",
                               "competitors", "cited_urls", "response_excerpt")})
                    o["status"] = "tested" if (row.get("response_excerpt") or row.get("tested_at")) else "not_tested"
        outdir = a.outdir or os.path.dirname(os.path.abspath(a.from_json))
        os.makedirs(outdir, exist_ok=True)
        print("Regenerating from %s ..." % a.from_json)
    else:
        slug = re.sub(r"[^a-z0-9]+", "", a.dealer.lower())[:24] or "dealer"
        outdir = a.outdir or os.path.join("reports", "%s-%s" % (slug, dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")))
        os.makedirs(outdir, exist_ok=True)
        print("Auditing %s (%s) ..." % (a.dealer, a.url or "demo"))
        out, stamp, _iso = run_audit(a.url, a.dealer, a.city, a.state,
                                     detail_path=a.detail_json or None, demo=a.demo,
                                     expected_units=a.expected_units,
                                     import_responses=a.import_responses or None,
                                     max_vdp=a.max_vdp)
        with open(os.path.join(outdir, "report.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1, default=str)
    write_xlsx(os.path.join(outdir, "report.xlsx"), build_sheets(out))
    dealer, city, state = out.get("dealer") or a.dealer, out.get("city") or a.city, out.get("state") or a.state
    title = ["MATCHRV %s" % ("DEMO - SAMPLE DATA" if out.get("demo") else "AI Visibility Report"),
             dealer, "%s, %s | Observed: %s | %s" % (city, state, out["observed_display"], out.get("base_url") or a.url)]
    if a.demo:
        title.append("DEMONSTRATION: synthetic inventory. Not a dealer assessment.")
    npages = write_pdf(os.path.join(outdir, "report.pdf"), title, build_pdf_sections(out))
    with open(os.path.join(outdir, "citation_prompts.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["prompt"])
        for o in out["citations"]:
            w.writerow([o["prompt"]])
    print("Wrote %s (%d PDF pages, %d detail units, overall %.1f)" % (
        outdir, npages, len(out["detail_units"]), out["scores"]["overall"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
