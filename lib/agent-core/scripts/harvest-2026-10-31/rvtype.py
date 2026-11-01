"""Python port of lib/agent-core/src/normalize.ts normalizeRvType + build-harvest-snapshot.ts urlType (same rules)."""
import re
CANON={"travel_trailer","fifth_wheel","toy_hauler","class_a","class_b","class_c","popup_camper","truck_camper"}
def norm_type(t,title=""):
    for raw in [str(t) if t else "",title or ""]:
        x=raw.lower().strip()
        if not x or x in("unknown","other","rv","park model"): continue
        if x in CANON: return x
        if "toy hauler" in x: return "toy_hauler"
        if "fifth wheel" in x or "5th wheel" in x: return "fifth_wheel"
        if "travel trailer" in x or "destination trailer" in x or x=="destination": return "travel_trailer"
        if "class a" in x or "diesel pusher" in x: return "class_a"
        if "class b" in x: return "class_b"
        if "class c" in x or "super c" in x: return "class_c"
        if any(k in x for k in("popup","pop-up","pop up","folding","tent trailer")): return "popup_camper"
        if "truck camper" in x: return "truck_camper"
        if "motorhome" in x or "motor home" in x: return "class_a"
    return None
URL_TYPE=[(r"fifth[-_ ]?wheel|5th[-_ ]?wheel","fifth_wheel"),(r"toy[-_ ]?hauler","toy_hauler"),(r"travel[-_ ]?trailer","travel_trailer"),
 (r"class[-_ ]?a(?![a-z])","class_a"),(r"class[-_ ]?b(?![a-z])","class_b"),(r"class[-_ ]?c(?![a-z])","class_c"),
 (r"truck[-_ ]?camper","truck_camper"),(r"pop[-_ ]?up|folding[-_ ]?camper|tent[-_ ]?trailer","popup_camper")]
def url_type(u):
    for p,t in URL_TYPE:
        if u and re.search(p,u,re.I): return t
    return None
