# Dealer site upgrade — October 18, 2026

## Plan verification: MODIFY

Outcome: consistent public B2B pages, working legal and legacy routes, immediate snapshot feedback, evidence-based comparison, and three service tiers.

- Verified facts: production website uses `codex/stitch-dealer-homepage` on Render; source tree matches deployed commit `477b8a79cbd3ca4028401c836aa14ce38441f69d`. BrandLayout, QuickReport, the contact endpoint, and a configured Google booking calendar exist. The Tacoma report is 57/100, observed September 21, 2026.
- Unverified assumptions: DMS compatibility, signed monthly-service terms, reporting coverage for each rooftop, and OpenAI advertiser eligibility require onboarding. They are qualified in offer copy.
- Missing access/information: DNS registrar access and a verified Render custom-domain entry for `mcp.matchrv.com`. The current public apex MCP address remains available as an alternative.
- Required tools: existing React/Vite/Express workspace, read-only Supabase evidence, official documentation, Render/GitHub integrations, browser verification.
- Complexity: moderate; shared public UI and routing changes. No billing processor, inventory ingestion pipeline, or schema migration is introduced.
- Costs/subscriptions: no new service subscription required by these code changes; existing hosting and providers continue. Advertising spend is separate from management fees.
- Security/privacy: preserve contact and snapshot API behavior, never expose secrets or private shopper data, use explicit form consent and supported third-party disclosures. Do not claim legal certification or guaranteed AI/towing outcomes.
- Sequence: layout and legal routes; branded endpoint/configuration; snapshot feedback; comparison and pricing; build and tests; responsive/browser verification; review and production release.
- Validation: SSR legal pages contain body text and shared B2B navigation; aliases issue 301 redirects; snapshot pending/success/failure states work with mocked local responses; plans and links agree; branded configuration copies correctly; desktop/mobile layouts have no horizontal overflow.
- Rollback: revert the release commit or redeploy `477b8a79cbd3ca4028401c836aa14ce38441f69d`; no database rollback is needed.
- Founder approval: the user requested these changes in the attached three-part implementation brief. No authority is inferred to start billing, change customer contracts, or modify database access rules.

## Required modifications to the proposed copy

- Highlight the core plan as “Recommended”; “Most Popular” is unsupported without customer adoption evidence.
- The comparison is explicitly illustrative. It does not invent a recorded AI answer, guaranteed first-place recommendation, customer relationship, or 100% weight-data failure.
- Camping World Fife stock 2747898: dealer page confirms 2025 Heartland Pioneer 17BH, 3,064-lb dry weight, 366-lb hitch weight, sleeps 5, and 20 ft 11 in length. Supabase capture on October 16 recorded an asking price of $11,999. The normalized record’s year conflicts with the dealer page; use the verified dealer-published title, not the conflicting year field.
- The live free check samples public HTML and one Gemini answer. The progress panel does not claim to have run a full JavaScript rendering test or completed unmeasured stages.
- Tier pricing is a service offer by scope review, not self-serve recurring billing or a claim that every DMS/third-party assistant is integrated.

## Branded MCP DNS instructions

1. In Render, open the existing **matchrv-mcp** service (not the website service), Settings → Custom Domains, and add `mcp.matchrv.com`.
2. At the authoritative DNS provider for `matchrv.com`, create:

| Field | Value |
|---|---|
| Type | CNAME |
| Name / host | `mcp` |
| Target / value | `matchrv-mcp.onrender.com` |
| TTL | Auto, or 300 seconds |
| Proxy | DNS only while verifying (if using Cloudflare) |

3. Remove conflicting A/AAAA/CNAME records for this exact host only. Do not alter apex, www, or mail records.
4. Use Render’s Verify action and wait for domain verification and its managed TLS certificate. Then test an MCP `initialize` request and `tools/list` at `https://mcp.matchrv.com/mcp`; DNS alone does not complete the setup.
5. Until the subdomain is verified, clients can use the existing public `https://matchrv.com/mcp` address. Existing connections are not removed.

## Sources

- [Render custom domains](https://render.com/docs/custom-domains)
- [OpenAI advertising principles](https://openai.com/index/our-approach-to-advertising-and-expanding-access/): sponsored ads do not influence organic answers.
- [OpenAI Ads Manager beta](https://openai.com/index/new-ways-to-buy-chatgpt-ads/)
- [FTC privacy and security guidance](https://www.ftc.gov/business-guidance/privacy-security): disclosures must reflect actual practices.
- [Dealer listing example](https://rv.campingworld.com/rv/2025-heartland-pioneer-17bh-2747898-fife-wa), checked October 18, 2026.

## Verification results

- Production website build and all ten marketing prerenders: passed.
- API build: passed.
- Frontend suite: 14 tests passed, including eight new public-page, offer, progress-state, and MCP configuration checks.
- Targeted typecheck for changed marketing components and pages: passed. Full-project typecheck remains blocked by existing `webmcp.ts` location-radius typing and unbuilt generated API-client declarations; no errors were reported in the changed marketing files.
- Actual Express application checks: `/terms-and-conditions` → `/terms`, `/tow-match` → `/tow-guide`, and `/buyer-guides` → `/guides` each returned HTTP 301. Contact, privacy, terms, and booking returned HTTP 200 with the B2B prerendered body.
- Built HTML checks: all prices, the audit credit, current network totals, evidence labels, canonical legal footer links, and branded MCP configuration passed. Obsolete $299–$499 metadata was removed.
- Local browser checks could not run: this background chat’s webview did not attach. No visual/mobile or live form-submission verification is claimed. A local fixture server was prepared without sending any leads or running a paid AI check.
- Dedicated MCP DNS/TLS activation remains external setup; see the exact CNAME and Render steps above. The apex public endpoint remains an alternative.

Legal copy describes the proposed operations and is not a certification of compliance in every jurisdiction. Monthly service agreements still need their own agreed renewal, cancellation, and payment terms.
