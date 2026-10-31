"""bundle5.py: bundle_trial8d/ + .tgz with README, snapshot, coords, patch, CSVs."""
import json,os,shutil,subprocess,csv,collections
H='/workspace/harvest-2026-10-31'; O=f'{H}/out_trial8d'; B=f'{H}/bundle_trial8d'; W='/workspace/wt-h31'
os.makedirs(B,exist_ok=True)
for f in ['inventory.snapshot.json.gz','dealer-city-coords.ts','qa_recheck_10_trial8b.csv','fix5_changes.csv','fix5_holds.csv','fix5.json','fix6_changes.csv','fix6_holds.csv','fix6.json','fix7_changes.csv','fix7_holds.csv','fix7_dedupe.csv','fix7.json','dedupe_carryover.csv','make_json_fixes.csv','type_conflict_holds_by_dealer_line.csv','type_fixes.csv','type_holds.csv','typefix.json','order_release_trial8d.csv','order_hold_by_dealer_trial8d.csv','vin_invalid_blanked_trial8d.csv','track_c_price_changes.csv','qa_recheck_10_trial8b.csv','postfix.json','postfix_holds.csv','postfix_class_fixes.csv','holds_qa.csv','windows.json','tracks.json','report.json','build_stats.json','mem.json','rebase.txt','test_agent_core.txt','test_api.txt',]:
    if os.path.exists(f'{O}/{f}'): shutil.copy(f'{O}/{f}',B)
shutil.copy('/workspace/harvest-2026-10-30/summary.md',B)
p=subprocess.run(f"cd {W} && git log --oneline -6 && git diff HEAD~1 HEAD -- . ':(exclude)lib/agent-core/data/inventory.snapshot.json.gz'",shell=True,capture_output=True,text=True).stdout
open(f'{B}/code_and_stats.patch','w').write(p)
w=json.load(open(f'{O}/windows.json')); t=json.load(open(f'{O}/tracks.json')); fx=json.load(open(f'{O}/fix5.json')); fx6=json.load(open(f'{O}/fix6.json')); fx7=json.load(open(f'{O}/fix7.json'))
mem=open(f'{O}/mem.json').read().strip().splitlines()[-1] if os.path.exists(f'{O}/mem.json') else 'n/a'
open(f'{B}/README.md','w').write(f"""# MatchRV harvest 2026-10-31 — trial8d bundle (local only; nothing pushed/deployed)
Branch data/harvest-2026-10-31 (/workspace/wt-h31). {open(f'{O}/rebase.txt').read().strip() if os.path.exists(f'{O}/rebase.txt') else ''}
Build KEEP_BASE=1 over v3.3, then fix5.py (trial4 QA fixes), fix6.py (trial5 QA fixes: on-order holds, per-unit lots, brokers) and postfix.py.
Loaded {w['loaded']:,}; searchable at 30 days {w['windows']['30']['eligible']:,} ({w['windows']['30']['domains']} domains / {w['windows']['30']['locations']} locations / {w['windows']['30']['states']} states).
New units vs v3.3: {t['new_units']:,} by track {t['new_units_by_track']}; searchable {t['new_searchable_by_track']}.
fix5 counts: {json.dumps({k:v for k,v in fx.items() if ':' not in k})}
fix6 counts (CSO QA trial5 fixes): {json.dumps({k:v for k,v in fx6.items() if ":" not in k})}
fix7 counts (trial8d: own-unit-field order holds, VIN validation, VIN-conflict-safe dedupe): {json.dumps({k:v for k,v in fx7.items() if ":" not in k})}
Memory probe: {mem}
Files: fix5_changes.csv (every field changed, with evidence), fix5_holds.csv + fix6_holds.csv (holds with reasons), qa_recheck_10_trial8b.csv (fresh sample for CSO,
excludes trial4+trial5 sample units; strata southland / broker_registry / multi_lot_audit / seller_lot_moved / near_on_order / track_C_price / fixed_other; blank CSO columns), test_*.txt, mem.json, code_and_stats.patch.
""")
subprocess.run(f"cd {H} && tar czf bundle_trial8d.tgz bundle_trial8d",shell=True,check=True)
print('bundle ok')
