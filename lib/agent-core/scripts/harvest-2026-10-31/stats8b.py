"""stats5.py: committed stats = KEEP_BASE build stats + fix5 + postfix + row-level holds (trial8b)."""
import json,re
H='/workspace/harvest-2026-10-31'; O=f'{H}/out_trial8b'
st=json.load(open(f'{O}/build_stats.json'))
st['fix5_2026_10_31']=json.load(open(f'{O}/fix5.json')); st['fix6_2026_10_31']=json.load(open(f'{O}/fix6.json')); st['fix7_2026_10_31']=json.load(open(f'{O}/fix7.json'))
st['postfix_2026_10_31']=json.loads(open(f'{O}/postfix.json').read().strip().splitlines()[-1])
rows={}
for n in ['pa_decide','ib_rows','ib2_rows','oc_rows','ib3a_rows','ib3b_rows','ib4_rows','ib5g_rows','ib5n_rows','ib6_rows']:
    try: rows[n]=json.loads(open(f'{H}/logs/{n}_trial6.txt').read())
    except Exception: pass
st['rowLevel_trial6']={n:{k:v for k,v in d.items() if k in('factory_order','sold_or_unavailable_unit_tag','lot_not_determined','price_prefee_sale_price','msrp_blanked_not_own_block','msrp_replaced_by_own_block','emitted','rows')} for n,d in rows.items()}
st['windows']=json.load(open(f'{O}/windows.json'))
print(json.dumps(st,indent=1))
