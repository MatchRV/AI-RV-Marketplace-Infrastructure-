"""Build page-pass targets from the v3.3 snapshot.
- Camping World (rv.campingworld.com): one target per unit, the unit's own stock number (or, when the stock
  was blanked by the stitch fix, the stock in its photo path and description). URL = the canonical listing URL in
  CW's current sitemap for that stock, else https://rv.campingworld.com/rv/<stock> (CW resolves it to the
  listing, or redirects to the search page when the unit is gone). Order: condition unknown first.
- La Mesa RV: the unit's own listingUrl.
- Meyers / McClain's / Apache (Interact sites): every unit page in the dealer's current sitemap (matched to our
  units by VIN / stock after the fetch)."""
import gzip,json,re,sys,collections
B="/workspace/harvest-2026-10-30/pagepass"
snap=json.load(gzip.open(sys.argv[1]))
units=snap["units"]
cw={}
for u in open(f"{B}/sitemaps/cw_urls_20261030.txt"):
    u=u.strip(); slug=u.rsplit('/',1)[-1]
    for tok in slug.split('-'):
        if re.search(r'\d',tok) and len(tok)>=4 and not re.fullmatch(r'(19|20)\d\d',tok): cw.setdefault(tok.lower(),set()).add(u)
CW_IMG=re.compile(r'images\.rvs\.com/[^/]+/([^/]+)/')
out=[];n=collections.Counter()
cwu=[u for u in units if u["provenance"]["dealerDomain"]=="rv.campingworld.com"]
cwu.sort(key=lambda u:(u["condition"]!="unknown",u["id"]))
for u in cwu:
    cands=[u["stockNumber"]] if u["stockNumber"] else []
    if not cands:
        ds=(re.search(r'Stock #(\S+?)\.(?:\s|$)',u.get("description") or "") or [None,None])[1]
        im=next((m.group(1) for im in u["images"] for m in [CW_IMG.search(im)] if m and not m.group(1).lower().startswith('rv')),None)
        cands=[c for c in dict.fromkeys([ds,im]) if c]; n["cw_no_stock_candidates"]+=len(cands)
    for j,c in enumerate(cands):
        s=cw.get(c.lower())
        url=sorted(s)[0] if s and len(s)==1 else f"https://rv.campingworld.com/rv/{c}"
        n["cw_in_sitemap" if s and len(s)==1 else "cw_not_in_sitemap"]+=1
        out.append({"key":f"cw|{u['id']}|{c}","kind":"cw","unit":u["id"],"stock":c,"url":url})
    if not cands: n["cw_no_candidate"]+=1
for u in units:
    if u["provenance"]["dealerDomain"]=="lamesarv.com":
        url=u["provenance"].get("listingUrl")
        if url: out.append({"key":f"lm|{u['id']}","kind":"lamesa","unit":u["id"],"url":url}); n["lamesa"]+=1
        else: n["lamesa_no_url"]+=1
for h,f in [("www.meyersrvsuperstores.com","sm_www.meyersrvsuperstores.com.xml"),("www.mcclainsrv.com","sm_www.mcclainsrv.com.xml"),("www.apachecamping.com","sm_www.apachecamping.com.xml")]:
    locs=re.findall(r'<loc>([^<]+)',open(f"{B}/sitemaps/{f}").read())
    for l in dict.fromkeys(l.strip() for l in locs):
        if re.search(r'/product/[a-z0-9-]+-\d+-\d+$',l):
            out.append({"key":f"ia|{l}","kind":"interact","url":l}); n["interact_"+h]+=1
# interleave so the small hosts are not starved (each host has its own worker anyway)
json.dump(n,sys.stderr,indent=1)
with open(f"{B}/targets.ndjson","w") as f:
    for t in out: f.write(json.dumps(t)+"\n")
