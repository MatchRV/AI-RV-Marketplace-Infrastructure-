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

## MAT-39 OpenAI Citation Runner

The first automated MAT-39 provider runner lives in `openai_citation_runner.py`.
It intentionally implements **OpenAI only**: no Gemini, Claude, scoring,
dashboard writes, or scheduling.

It reuses the ten existing dealer citation prompts from `audit.py`, including
the branded review prompt. Each prompt is tagged with a stable `P01`-`P10`
id, category, and `is_branded` flag so branded observations can be excluded
from headline visibility metrics later.

### Requirements

- Python 3.10+
- `OPENAI_API_KEY`
- Optional `MATCHRV_CITATION_MODEL` (defaults to `gpt-5.6`)

The runner uses only Python's standard library; it does not add a Python
package dependency.

### Run a dealer observation set

```powershell
$env:OPENAI_API_KEY="..."
python openai_citation_runner.py `
  --dealer "Porter's RV" `
  --city "Coos Bay" `
  --state "OR" `
  --domain "portersrv.com"
```

For each prompt the request uses the OpenAI Responses API with `web_search`, explicit live internet access (`external_web_access: true`), `tool_choice: "required"`, and approximate US city/state location. The system instruction is neutral:
the model is not told to find or favor the target dealer.

The request also asks the API to include
`web_search_call.action.sources`, in addition to the response's inline
`url_citation` annotations.

### Evidence output

A run is written under:

```
citation-runs/<dealer>-<UTC-run-id>/
  manifest.json
  observations.jsonl
  observations.csv
  raw/openai/P01.json
  raw/openai/P02.json
  ...
  raw/openai/P10.json
```

**Evidence invariant:** the exact provider response bytes are fsynced to the
prompt's raw JSON file before `json.loads` or any normalization runs.

Normalized observations currently contain:

- prompt id/text/category/location/locale and branded flag
- target dealer/domain
- platform and requested/returned model
- response id and timestamps
- status: `success`, `no_search`, `api_error`, `rate_limit`,
  `empty_response`, or `parse_error`
- response text
- inline citation URL/title pairs
- web-search queries when returned by the API
- web-search source URL/title pairs
- relative pointer to the immutable raw provider response

This is an observation collector only. It deliberately does **not** decide
whether the dealer was mentioned/cited, calculate the four MAT-39 metrics, or
write to the dealer dashboard yet.

### Offline test

```powershell
python test_openai_citation_runner.py
```

The test uses a fixed Responses API fixture; it never calls OpenAI.
