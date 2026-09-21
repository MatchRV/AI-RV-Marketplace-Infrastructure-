# MatchRV AI Visibility Audit v2

Stdlib-only Python (no installs). Read-only live audit + PDF/Excel/JSON reports.

## Run (PowerShell, from this folder)

```powershell
python audit.py --url https://www.tacomarv.com --dealer "Tacoma RV Center" --city Fife --state WA --detail-json "<path to rendered scrape JSON>" --expected-units 342
python audit.py --demo   # synthetic sample, no network
```

`Run-Audit.cmd` double-click works too and forwards CLI args.

## Reviewer citation workflow (v1: manual, no auto-submission)

1. Open `<report>/citation_prompts.csv`, run each prompt on the target AI platform.
2. Save observations as CSV with headers: `prompt,platform,model,tested_at,location,dealer_mentioned,dealer_cited,inventory_cited,competitors,cited_urls,response_excerpt`
3. Regenerate without re-crawling: `python audit.py --from-json reports/<dealer>-<date>/report.json --import-responses responses.csv`

(`--from-json` also rebuilds PDF/Excel after any tool update, e.g. the Executive Summary page.)

## Fixes vs v1

- Excel dates are ISO-8601 text (was: raw serial like 46286.44).
- Explicit reconciliation: sitemap count vs sampled vs analyzed vs dealer `--expected-units`.
- 56 buyer queries (50 + 6 RV-intent combos); `under` excludes boundary; unknown never false/zero.
- `Run-Audit.cmd` forwards `%*` and falls back to the `py` launcher.
- Never fetches robots-disallowed `/api/`; never impersonates bots; ~1.2 s between requests.
