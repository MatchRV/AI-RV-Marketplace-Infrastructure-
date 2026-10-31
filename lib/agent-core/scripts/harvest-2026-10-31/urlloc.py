"""Location stated in a listing URL (facts only: the dealer's own URL path names the lot). Returns (city|None, ST) or None."""
import re
STN={'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new-hampshire':'NH','new-jersey':'NJ','new-mexico':'NM','new-york':'NY','north-carolina':'NC','north-dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode-island':'RI','south-carolina':'SC','south-dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA','west-virginia':'WV','wisconsin':'WI','wyoming':'WY'}
AB=set(STN.values())
def urlloc(url):
    if not url: return None
    p=url.split('?')[0]
    # DealerSpike / ARI: ...-City-Name-ST-12345678  (title-case words, 2-letter state, numeric id)
    m=re.search(r'-((?:[A-Z][A-Za-z\.]+-){1,3})([A-Z]{2})-\d{6,9}$',p)
    if m and m.group(2) in AB: return (m.group(1).strip('-').replace('-',' '),m.group(2))
    # ...-city-st-12345-i123 (zip) e.g. -souderton-pa-18964-i5240700
    m=re.search(r'-((?:[a-z\.]+-){1,3})([a-z]{2})-(\d{5})(?:-i?\d+)?/?$',p)
    if m and m.group(2).upper() in AB: return (m.group(1).strip('-').replace('-',' ').title(),m.group(2).upper())
    # ...-for-sale-in-city-st / -in-city-st-
    m=re.search(r'-in-((?:[a-z\.]+-){1,3})([a-z]{2})(?:[-/]|$)',p)
    if m and m.group(2).upper() in AB: return (m.group(1).strip('-').replace('-',' ').title(),m.group(2).upper())
    # ...-city-statename-12345 (motorsportsland: -millcreek-utah-38845)
    for nm,ab in STN.items():
        m=re.search(r'-((?:[a-z]+-){1,2})'+nm+r'-\d{3,7}/?$',p)
        if m: return (m.group(1).strip('-').replace('-',' ').title(),ab)
    # /statename/ directory (optimumrv /florida/new/...) -> state only
    for nm,ab in STN.items():
        if re.search(r'/'+nm+r'/',p): return (None,ab)
    return None
