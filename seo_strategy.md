# SEO Strategy — MatchRV

## Site Identity
MatchRV (matchrv.com) — AI-powered RV marketplace targeting buyers in Washington State. Combines a live inventory browser with an AI Match Report tool.

## Rendering Mode
**React SPA (Vite)** — All per-route metadata is injected client-side via `react-helmet-async`. Social preview bots (LinkedIn, Twitter/X, Facebook, iMessage) and most AI crawlers (GPTBot, ClaudeBot, PerplexityBot) only see the static `index.html` shell and cannot read per-route titles, descriptions, Open Graph tags, or JSON-LD schemas.

## In Scope
- Public marketing + content pages: `/`, `/browse`, `/rvs-for-sale`, `/travel-trailers-for-sale`, `/fifth-wheels-for-sale`, `/class-a-rvs-for-sale`, `/class-b-rvs-for-sale`, `/class-c-rvs-for-sale`, `/toy-haulers-for-sale`, `/rv-dealers`, `/guides/*`, `/rv-financing/*`, `/tow-guide`, `/finance`, `/sell`, `/about`, `/contact`, `/pricing`, `/outfitter`, `/match`, `/listing/:id`

## Out of Scope
- Authenticated/user pages: `/account`, `/saved`, `/searches`, `/alerts`, `/messages`, `/admin`, `/trips`, `/trip-detail` (correctly noindexed)
- Mobile app (`artifacts/lotlink-mobile`) — native app, not web-indexed

## Target Audience
RV buyers in the Pacific Northwest (Washington State) searching for specific RV types, comparing options, or researching purchases.

## Primary Keywords
- RVs for sale Washington / Washington State
- Travel trailers for sale, Fifth wheels for sale, Class A/B/C RVs for sale
- RV tow guide, RV financing, how to buy an RV
- AI RV match, RV deal scoring

## Dismissed Categories
- (None yet)
