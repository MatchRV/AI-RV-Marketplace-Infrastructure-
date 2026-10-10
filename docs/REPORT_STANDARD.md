# MatchRV report standard — approved October 9, 2026

The supplied Tacoma RV Center full report and one-page teaser are the presentation references for every future report. The exact supplied PDFs are published in `/reports/` and linked from `/visibility-report` (the third navigation tab).

## Full AI Visibility Report

Use navy #0a2233, teal #00bfa6, the MatchRV wordmark, dealer and location, original observation date, a prominent readiness badge and three findings. Follow with: 60-second summary; scorecard; dealership snapshot; shopper questions and results; inventory field health; three listing spot-checks; up to five evidence-backed fixes ranked by impact; next steps and methodology. Keep complete questions, sources and AI observations in the evidence appendix. Page count may grow with evidence; do not claim the reference PDF has four pages (it has nine).

## Free Visibility Snapshot

One page: navy/teal header, readiness card, three findings, three shopper-question rows, short full-report call to action, dated sample scope. No detailed paid fix list. Homepage display, PDF download and PDF email use the same snapshot data. The complete Gemini answer and citations remain under the evidence details on the result page.

## Evidence rules

Never copy Tacoma's 57/100 score to another dealer. Preserve existing scored audit metrics. Unassessed scores stay unknown. The homepage's bounded sample has a transparent sample-readiness score: readable field checks divided by assessed field checks. This smaller-scope score is explicitly distinguished from the full audit score and AI rankings. Assess inventory detail pages, not dealership home/category pages. A zero denominator is “not assessed.” Extracted evidence gaps do not prove absence from all sources. A failed AI call does not mean negative visibility. Keep original dates when reformatting saved data.

## Implementations

- Website: `components/report-examples.tsx` and `components/quick-report.tsx`.
- Live free snapshot data: `api-server/src/lib/visibility-snapshot.ts`.
- Live one-page PDF and email attachment: `api-server/src/lib/quick-report-pdf.ts`.
- Full/free offline templates: `tools/ai-visibility-audit/report_templates.py`; used by `audit.py`. Local desktop copies are also used by `MatchRV/report_runner.py` and `matchrv-audit-v2/audit.py`.
- Supplied reference PDFs stay byte-for-byte unchanged. The companion HTML previews add only responsive layout rules.
