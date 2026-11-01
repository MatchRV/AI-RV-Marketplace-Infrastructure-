"""lot_from_page(domain,url,html) -> (city|None, ST|None, evidence) or None: the unit's lot as its own page states it,
for dealers with more than one lot (CSO QA trial4). Shared by loc_parse*.py and rows_from_pages.py."""
import re,html as H,os,sys
sys.path.insert(0,os.path.dirname(__file__))
from parse_generic import strip_blocks, txt
OVERFUEL={'bentsrv.com','fourwindsrv.com','unchartedrec.com','rvconnections.com','cenlarv.com'}
TITLE={'hamiltonrvsales.com','wehrrvs.com','airstreamlasvegas.com','airstreaminlandempire.com','airstreamorangecounty.com','airstreamlosangeles.com','rvtrucksalesmt.com','selkirkrv.com'}
def lot_from_page(d,url,h):
    if d=='optimumrv.com':
        m=re.search(r'<title>[^<]*\|\s*([A-Za-z .\'-]+),\s*([A-Z]{2})\s*\|',h)
        if m: return (m.group(1).strip(),m.group(2),'page title "%s, %s"'%(m.group(1).strip(),m.group(2)))
    elif d=='poulsborv.com':
        m=re.search(r'<title>[^<]*for sale in ([A-Za-z .\'-]+),\s*([A-Z]{2})\s*\|',h)
        if m: return (m.group(1).strip(),m.group(2),'page title "for sale in %s, %s"'%(m.group(1).strip(),m.group(2)))
    elif d=='motorsportsland.com':
        m=re.search(r'located at our ([A-Za-z .\'-]+), ([A-Z]{2}) location',h)
        if m: return (m.group(1).strip(),m.group(2),'page "located at our %s, %s location"'%(m.group(1).strip(),m.group(2)))
    elif d in OVERFUEL:
        i=h.find('"vehicle":{"meta"')
        if i>=0:
            s=h[i:i+60000]; j=s.find('"dealer":{"id":')
            if j>=0:
                m=re.search(r'"city":"([^"]+)","state":"([A-Z]{2})"',s[j:j+3000]); nm=re.search(r'"name":"([^"]+)"',s[j:])
                if m: return (m.group(1),m.group(2),f'unit dealer record on page ({nm.group(1) if nm else ""})')
        v=txt(strip_blocks(h)); m=re.search(r'\bLocation ([A-Z][A-Za-z .]+?)(?:, ([A-Z]{2}))?(?: \([^)]{2,30}\))? (?:Year|Condition|Specifications|Stock|Make)\b',v)
        if m: return (m.group(1),m.group(2),f'page "Location {m.group(1)}"')
    elif d in TITLE:
        m=re.search(r'<title>[^<]*\|\s*([A-Za-z .\'-]+),\s*([A-Z]{2})\s*\|\s*#',h)
        if m: return (m.group(1).strip(),m.group(2),f'page title lot "{m.group(1).strip()}, {m.group(2)}"')
    elif 'airstream' in d:
        m=re.search(r'Location:?\s*(?:<[^>]+>\s*)*([A-Za-z .\'-]+?)\s+([A-Z]{2})\s*<',h)
        if m: return (H.unescape(m.group(1)).strip(),m.group(2),'page "Location %s %s"'%(m.group(1).strip(),m.group(2)))
    elif d=='lamesarv.com':
        m=re.search(r'data-testid="rvunit-location">([^<,]+),\s*([A-Z]{2})<',h)
        if m:
            c=H.unescape(m.group(1)).strip(); p_=re.match(r'^.+\(([A-Za-z .]+)\)$',c)
            return (p_.group(1).strip() if p_ else c,m.group(2),f'unit location "{c}, {m.group(2)}"')
    elif d=='nirvc.com':
        v=txt(strip_blocks(h)); m=re.search(r'Stock # \S+ Location ([A-Z][A-Za-z ]+?) Condition',v)
        if m:
            nm=m.group(1)
            a=re.search(r'href="/Locations/'+re.escape(nm.replace(' ',''))+r'"[\s\S]{0,4000}?<li>([^<]+), ([A-Z]{2})</li>',h) or re.search(re.escape(nm)+r'[\s\S]{0,1500}?<li>([^<]+), ([A-Z]{2})</li>',h)
            return (a.group(1),a.group(2),f'page "Location {nm}" (the {nm} store address on the page: {a.group(1)}, {a.group(2)})') if a else (nm,None,f'page "Location {nm}"')
    elif d in ('darrenbideauxrv.com','millicanrvs.com'):
        v=txt(strip_blocks(h)); m=re.search(r'\bLocation ([A-Z][A-Za-z .]+?) (?:Stock|Condition|Year|Vin)',v)
        if m: return (m.group(1),None,f'page "Location {m.group(1)}"')
    elif d=='robbinsautoandrv.com':
        v=txt(strip_blocks(h)); m=re.search(r'\bLocation [^,]{0,80}? ([A-Z][a-z]+(?: [A-Z][a-z]+)?), ([A-Z]{2}) \d{5}',v)
        if m: return (m.group(1),m.group(2),f'page "Location ... {m.group(1)}, {m.group(2)}"')
    elif d=='mhsrv.com':
        m=re.search(r'-([a-z]{2})-i\d+$',url.split('?')[0])
        if m: return (None,m.group(1).upper(),f'listing URL state {m.group(1).upper()}')
    return None
def page_msrps(h):
    return sorted({int(x.replace(',','')) for x in re.findall(r'(?i)\b(?:MSRP|List Price|Retail Price)\W{0,40}?\$\s?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})',re.sub(r'(?s)<[^>]+>',' ',h))})
