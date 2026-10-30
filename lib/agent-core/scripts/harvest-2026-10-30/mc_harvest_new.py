"""MarketCheck harvest of NEW dealers (not in live network, not already pulled Oct 25-26).
Largest dealers first. Paging cap 500 rows/query -> partition big dealers by year (facet) then make."""
import json,os,sys,datetime
import mccall
B=os.path.dirname(os.path.abspath(__file__)); S="/workspace/scrape-2026-10-26"
OUT=open(os.path.join(B,"mc","new_dealers.jsonl"),"a"); PROG=os.path.join(B,"mc","progress.json")
prog=json.load(open(PROG)) if os.path.exists(PROG) else {"done":[], "records":0, "calls":0}
done_prev=set(json.load(open(f"{S}/marketcheck/progress.json"))["done_sources"])
T=[t for t in json.load(open(f"{S}/target_new_dealers_marketcheck.json")) if t["item"] not in done_prev and t["item"] not in prog["done"]]
WEB=json.load(open(os.path.join(B,"web_oct26_counts.json")))
RVM=set(json.load(open(os.path.join(B,"rv_makes.json"))))
skipped=[t["item"] for t in T if WEB.get(t["item"],0)>=0.6*t["count"]]
T=[t for t in T if t["item"] not in skipped]
prog.setdefault("skipped_web",skipped); prog.setdefault("skipped_nonrv",[])
T.sort(key=lambda t:-t["count"])
print("targets",len(T),"listings",sum(t["count"] for t in T),flush=True)
base={"country":"US"}
def save(): json.dump(prog,open(PROG,"w"))
def page_all(params,purpose,expected=None):
    start=0
    while start<500:
        d=mccall.call("/v2/search/rv/active",{**base,**params,"rows":50,"start":start},purpose); prog["calls"]+=1
        if not d: return
        ls=d.get("listings") or []
        ts=datetime.datetime.now().astimezone().isoformat()
        for l in ls: OUT.write(json.dumps({"_harvest":{"method":"marketcheck_api_v2_rv_active","harvested_at":ts,"query":params},**l})+"\n")
        OUT.flush(); prog["records"]+=len(ls)
        nf=d.get("num_found") or 0; start+=50
        if start>=nf or not ls: return
def groups(fac,limit=500):
    out=[];cur=[];tot=0
    for k,c in fac:
        if cur and tot+c>limit: out.append(cur);cur=[];tot=0
        cur.append(k);tot+=c
    if cur: out.append(cur)
    return out
try:
    small=[];stot=0
    def flush_small():
        global small,stot
        if small: page_all({"source":",".join(small)},f"new dealers batch x{len(small)}"); prog["done"]+=small; save()
        small=[];stot=0
    for t in T:
        dom,c=t["item"],t["count"]
        if c<=450:
            if small and stot+c>450: flush_small()
            small.append(dom); stot+=c; continue
        flush_small()
        d=mccall.call("/v2/search/rv/active",{**base,"source":dom,"rows":0,"facets":"year|0|80,make|0|100"},f"year+make facet {dom}"); prog["calls"]+=1
        if not d: continue
        mf=d["facets"].get("make",[]); tot=sum(x["count"] for x in mf) or 1
        rvshare=sum(x["count"] for x in mf if str(x["item"]).lower() in RVM)/tot
        if rvshare<0.4:
            prog["skipped_nonrv"].append([dom,c,round(rvshare,2)]); prog["done"].append(dom); save(); print("skip non-RV",dom,c,round(rvshare,2),flush=True); continue
        yf=sorted([(int(x["item"]),x["count"]) for x in d["facets"]["year"] if str(x["item"]).isdigit()])
        for g in groups(yf):
            n=sum(c for y,c in yf if y in g)
            if n<=500: page_all({"source":dom,"year_range":f"{min(g)}-{max(g)}"},f"{dom} years {min(g)}-{max(g)}")
            else:
                y=g[0]; dm=mccall.call("/v2/search/rv/active",{**base,"source":dom,"year":y,"rows":0,"facets":"make|0|200"},f"make facet {dom} {y}"); prog["calls"]+=1
                for mg in groups([(x["item"],x["count"]) for x in (dm or {}).get("facets",{}).get("make",[])]):
                    page_all({"source":dom,"year":y,"make":",".join(mg)},f"{dom} {y} makes x{len(mg)}")
        prog["done"].append(dom); save()
        print(datetime.datetime.now().strftime("%H:%M:%S"),dom,c,"records",prog["records"],"calls",prog["calls"],"quota",mccall.quota,flush=True)
    flush_small()
except mccall.QuotaExhausted as e:
    print("STOP quota reserve reached",e,flush=True)
save(); print("DONE",prog["records"],prog["calls"],len(prog["done"]),mccall.quota,flush=True)
