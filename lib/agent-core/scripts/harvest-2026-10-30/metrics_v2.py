import json,gzip,collections as C,sys
B="/workspace/harvest-2026-10-30"
snap=json.load(gzip.open(sys.argv[1])); old=json.load(gzip.open(f"{B}/inventory.snapshot.oct14.json.gz"))
oid={u['id'] for u in old['units']}; odom={u['provenance']['dealerDomain'].replace('www.','') for u in old['units']}
H=[u for u in snap['units'] if u['provenance'].get('harvestMethod')]
new=[u for u in H if u['id'] not in oid]
mc_new=[u for u in new if u['provenance']['harvestMethod'].startswith('market')]
web_new=[u for u in new if not u['provenance']['harvestMethod'].startswith('market')]
calls=[json.loads(l) for l in open(f"{B}/logs/mc_calls.jsonl")]
luna=[json.loads(l) for l in open(f"{B}/logs/luna_calls.jsonl")]
cost=sum((c.get('cost') or c.get('cost_usd') or 0) for c in luna)
luna_units=sum(1 for u in H if any('GPT-6 Luna' in str((u.get(k) or {}).get('note','')) for k in ('sleeps','lengthFt','dryWeightLbs','gvwrLbs','hitchWeightLbs','slideouts','freshWaterGal','greyWaterGal','blackWaterGal')))
R={"loaded":len(snap['units']),"harvested_units_in_snapshot":len(H),"new_units":len(new),"new_units_mc":len(mc_new),"new_units_web":len(web_new),
   "new_units_at_new_dealer_domains":sum(1 for u in new if u['provenance']['dealerDomain'].replace('www.','') not in odom),
   "new_dealer_domains_with_units":len({u['provenance']['dealerDomain'] for u in new if u['provenance']['dealerDomain'].replace('www.','') not in odom}),
   "mc_calls_logged":len(calls),"mc_calls_per_1000_mc_units_in_snapshot":round(1000*len(calls)/max(1,sum(1 for u in H if u['provenance']['harvestMethod'].startswith('market'))),1),
   "luna_calls":len(luna),"luna_cost_usd":round(cost,4),"units_with_luna_value":luna_units,"luna_cost_per_1000_units_with_value":round(1000*cost/max(1,luna_units),3),
   "price_basis":dict(C.Counter((u['priceUsd'].get('note') or '')[:60] for u in H)),
   "last_seen_basis":dict(C.Counter(u['provenance'].get('lastSeenBasis') for u in H)),
   "refresh_source_existing_units":dict(C.Counter(('marketcheck' if u['provenance']['harvestMethod'].startswith('market') else 'dealer_website') for u in H if u['id'] in oid))}
print(json.dumps(R,indent=1))
