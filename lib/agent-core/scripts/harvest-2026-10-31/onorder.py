"""onorder.py: the unit's own text or badge says it is not on the lot yet (on order, available to order, coming soon,
in transit, pre-order, build to order, reserve yours...). Matching ignores case and punctuation ('!! Available To Order !!')."""
import re
MON=r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*'
ORDER=re.compile(r"\b(on order|available (?:to|for) (?:factory )?order|order (?:yours|one|it|this one)?\s*(?:today|now)|order yours|build to order|built to order|custom order(?! options)|special order(?! financing)|factory order(?! options)|pre ?order(?:ed)?|reserve yours|coming soon|in transit|arriving soon|arriving (?:in|on|by|mid|late|early) (?:"+MON+r"|spring|summer|fall|winter|\d)|expected to arrive|expected arrival|incoming unit|not yet (?:arrived|on (?:the|our) lot)|has not arrived)\b")
NEG=re.compile(r"(photos?|pictures?|pics|images?|videos?|walk ?through|tour|more info(?:rmation)?|info|details|specs?|description|floorplan|price|pricing|more|models?|lines?)\s*(?:are |is |will be |to be |)\s*coming soon|coming soon\s*(?:photos?|pictures?|pics|images?|videos?)|in transit (?:insurance|coverage|protection)")
def _norm(s): return re.sub(r'\s+',' ',re.sub(r"[^a-z0-9]+",' ',s.lower())).strip()
def text_hit(s):
    if not s: return None
    n=_norm(s)
    for m in ORDER.finditer(n):
        ctx=n[max(0,m.start()-40):m.end()+30]
        if NEG.search(ctx) and re.search(r'coming soon|in transit',m.group(0)): continue
        if re.search(r'\b(?:was|were|had been|previously)\s+$',n[max(0,m.start()-15):m.start()]): continue
        return n[max(0,m.start()-40):m.end()+40]
    return None
def status_hit(vals):
    for v in vals or []:
        if v and text_hit(str(v)): return str(v).strip()
    return None
WEAK=re.compile(r'\border(?:ed)?\b|\breserve\b|\barriv(?:e|ing)\b')
def weak_hit(s):
    """any order/arrival word, used only for new units with no VIN and a future model year"""
    if not s: return None
    n=_norm(s); m=WEAK.search(n)
    if m and not re.search(r'\b(?:was|were|had been)\s+$',n[max(0,m.start()-15):m.start()]): return n[max(0,m.start()-40):m.end()+40]
    return None
