"""onorder.py: the unit's own text or badge says it is not on the lot yet (on order, coming soon, in transit...)."""
import re
ORDER=re.compile(r"\b(on[- ]order|coming soon|in[- ]transit|arriving soon|expected to arrive|expected arrival|pre-?order(?:ed)?|available (?:to|for) (?:factory )?order|incoming unit|not yet (?:arrived|on (?:the|our) lot)|has not arrived|arriving (?:in|on|by|mid|late|early) (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|spring|summer|fall|winter|\d))",re.I)
NEG=re.compile(r"(photos?|pictures?|pics|images?|videos?|walk-?through|tour|more info(?:rmation)?|details|specs?|description|floorplan|price|pricing|more|info|models?|lines?)\s*(?:are |is |will be |to be |)\s*coming soon|coming soon\s*(?:photos?|pictures?|pics|images?|videos?)|(?:sorry|oops)[^.]{0,40}|in[- ]transit (?:insurance|coverage|protection)",re.I)
STATUS=re.compile(r"^\s*(on order|coming soon|in transit|arriving soon|incoming|pre-?order|available to order|factory order|special order|build to order|ordered|en route|on the way|reserved for order)\s*$",re.I)
def text_hit(s):
    if not s: return None
    for m in ORDER.finditer(s):
        ctx=s[max(0,m.start()-40):m.end()+30]
        if NEG.search(ctx) and re.search(r'coming soon|in[- ]transit',m.group(0),re.I): continue
        if re.search(r'\b(?:was|were|had been)\s+$',s[max(0,m.start()-12):m.start()],re.I): continue
        return re.sub(r'\s+',' ',s[max(0,m.start()-40):m.end()+40]).strip()
    return None
def status_hit(vals):
    for v in vals or []:
        if v and STATUS.match(str(v)): return str(v).strip()
    return None
