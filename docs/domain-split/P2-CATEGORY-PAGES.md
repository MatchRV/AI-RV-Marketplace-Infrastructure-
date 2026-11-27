# P2 — category and location landing pages

Not built in this change. The consumer site already has type pages (`/travel-trailers-for-sale` and the other `*-for-sale` routes) and server-rendered state hubs (`/rvs/{state}`, `/rvs/{state}/{type}`, `/rvs/{state}/{type}/under-{price}`). `/shop` links to those type pages, to budget ceilings on `/swipe`, and to a place search that opens `/swipe?place=`.

What is still missing, and should be a later change:

1. One indexable landing page per RV type that is the canonical browse URL, with the live count, a short buying guide, and links into the state hubs that actually have inventory. Several type pages exist but do not share one template with location and budget.
2. A location index (`/rvs` or a state directory) so shoppers are not guessing state slugs. Hubs 404 when a state has too few indexable units, so the index should only link hubs the sitemap already lists.
3. Budget landing pages that are real HTML, not only `/swipe?price_max=`. The hubs already have `under-{price}` URLs. The shopper nav should point at those when the hub exists.
4. Keep `/listing/{id}` and `/mcp` out of that work. New landing pages are additive consumer URLs on `matchrv.com`.

Do that after the domain split is deployed and Search Console shows the dealer property separate from the apex.
