import json,gzip,collections as C,re,sys
codes="ABCDEFGHJKLMNPRSTVWXY123456789"
def vy(v):
    if not v or len(v)!=17 or v[9] not in codes: return None
    b=1980+codes.index(v[9])
    while b+30<=2027: b+=30
    return b
W=dict(zip("ABCDEFGHJKLMNPRSTUVWXYZ",[1,2,3,4,5,6,7,8,1,2,3,4,5,7,9,2,3,4,5,6,7,8,9])); WT=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]
def chk(v):
    if not v or len(v)!=17: return False
    try: t=sum((int(ch) if ch.isdigit() else W[ch])*w for ch,w in zip(v,WT))
    except KeyError: return False
    r=t%11; return v[8]==('X' if r==10 else str(r))
def ty(t):
    m=re.search(r'\b(19[89]\d|20[0-3]\d)\b',t or ''); return int(m.group(1)) if m else None
