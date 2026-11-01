"""bundle_pp.py: out_pagepass/bundle_pagepass_2026-11-01/ + .tgz (README, snapshot, CSVs, stats, tests, mem, patch)."""
import json,os,shutil,subprocess,re
H='/workspace/harvest-2026-10-30'; O=f'{H}/out_pagepass/fix2'; B=f'{H}/out_pagepass/bundle_pagepass_2026-11-01_fix2'; W='/workspace/wt-pp'
os.makedirs(B,exist_ok=True)
for f in ['inventory.snapshot.json.gz','pagepass_apply_summary.json','pagepass_field_changes.csv','pagepass_removed_units.csv','pagepass_stores_created.csv','fix1_summary.json','fix1_field_changes.csv','fix1_removed_or_held.csv','fix1_type_changes.csv','fix1_stores_created.csv','qa_sample_30_pagepass_fix1.csv','fix1_steps_note.txt','windows.json','windows_base_at_fix1_builtAt.json','coords.txt','test_agent_core.txt','test_api.txt','test_web.txt','mem.json','commit.txt']:
    if os.path.exists(f'{O}/{f}'): shutil.copy(f'{O}/{f}',B)
shutil.copy(f'{H}/summary.md',B)
p=subprocess.run(f"cd {W} && git log --oneline -3 && git diff HEAD~1 HEAD -- . ':(exclude)lib/agent-core/data/inventory.snapshot.json.gz'",shell=True,capture_output=True,text=True).stdout
open(f'{B}/code_and_stats.patch','w').write(p)
subprocess.run(f"cd {W} && git bundle create {B}/data-pagepass-2026-11-01.bundle origin/main..data/pagepass-2026-11-01",shell=True,check=True,capture_output=True)
def res(f):
    t=open(f'{O}/{f}').read() if os.path.exists(f'{O}/{f}') else ''
    m=re.findall(r'Tests\s+(.*)',t); return m[-1].strip() if m else 'n/a'
w=json.load(open(f'{O}/windows.json')); wb=json.load(open(f'{H}/out_pagepass/windows_base.json')); wa=json.load(open(f'{O}/windows_base_at_fix1_builtAt.json')); s=json.load(open(f'{O}/pagepass_apply_summary.json')); fx=json.load(open(f'{O}/fix1_summary.json'))
mem=open(f'{O}/mem.json').read().strip().splitlines()[-1] if os.path.exists(f'{O}/mem.json') else 'n/a'
line=f"commit {open(f'{O}/commit.txt').read().strip()}; loaded {s['in']:,} -> {fx['out']:,}; 30d {wb['windows']['30']['eligible']:,} -> {w['windows']['30']['eligible']:,}; 14d {wb['windows']['14']['eligible']:,} -> {w['windows']['14']['eligible']:,}; tests core [{res('test_agent_core.txt')}] api [{res('test_api.txt')}] web [{res('test_web.txt')}]; mem {mem}"
open(f'{O}/result_line.txt','w').write(line)
open(f'{B}/README.md','w').write(f"""# MatchRV page pass 2026-10-30/31 + fix1 (CSO QA, Nov 1 re-read) + fix2 (MSRP-only = price_unverified) on main e1a3cb4 (local only; nothing pushed/deployed)
Branch data/pagepass-2026-11-01 (/workspace/wt-pp), one local commit on origin/main e1a3cb4. git bundle: data-pagepass-2026-11-01.bundle (origin/main..branch).
Push later from a credentialed clone: git fetch data-pagepass-2026-11-01.bundle data/pagepass-2026-11-01 && git push origin FETCH_HEAD:refs/heads/data/pagepass-2026-11-01
{line}
builtAt {w['builtAt']} (latest applied page read). Base windows at its own builtAt {wb['builtAt']}: {json.dumps({k:v['eligible'] for k,v in wb['windows'].items()})}; base at the new builtAt: {json.dumps({k:v['eligible'] for k,v in wa['windows'].items()})}; new: {json.dumps({k:v['eligible'] for k,v in w['windows'].items()})}.
Page pass categories: {json.dumps(s['categories'])}\nfix1: {json.dumps({k:fx[k] for k in ('removedOrHeldByReason','typeChanges','fieldChangesByField','storesCreated')})}
Removed by reason: {json.dumps(s['heldByReason'])}
Rules: docstrings of lib/agent-core/scripts/pagepass-2026-11-01/apply_pp2.py and fix1.py.
Files: pagepass_field_changes.csv (every field changed, old/new, source URL, fetch time), pagepass_removed_units.csv, qa_sample_30_pagepass.csv (blank CSO_check), windows*.json, test_*.txt, mem.json, code_and_stats.patch.
""")
subprocess.run(f"cd {H}/out_pagepass && tar czf bundle_pagepass_2026-11-01_fix2.tgz bundle_pagepass_2026-11-01_fix2",shell=True,check=True)
print('bundle ok')
