# URL migration matrix

Status values:

- **stays** — same host and path. The response body may be redesigned.
- **301** — permanent redirect. Query strings are kept.
- **both** — the path exists on both hosts. Each host canonicalizes to itself.
- **infra** — not a marketing page. Never redirected. The registered URL stays on `https://matchrv.com`.

Production redirects run only when the `Host` is `matchrv.com`, `www.matchrv.com`, or `dealer.matchrv.com`. `localhost` and `*.local` do not bounce to production.

## Infrastructure (do not move)

| Current URL | New URL | Status |
| --- | --- | --- |
| `https://matchrv.com/mcp` | same | infra |
| `https://matchrv.com/mcp/v1` | same | infra |
| `https://matchrv.com/api/*` including `/api/listings`, `/api/out`, `/api/inquiries`, `/api/analytics/*` | same | infra |
| `https://matchrv.com/.well-known/*` | same | infra |
| `https://matchrv.com/ops/leads-dashboard` and other `/ops/*` | same | infra |
| `https://matchrv.com/llms.txt` | same | infra |
| `https://matchrv.com/listing/{id}` and `/listing/{id}.md` | same | stays |
| `https://matchrv.com/rvs/{state}...` hub pages | same | stays |

A request for those listing or hub paths on `dealer.matchrv.com` 301s to the same path on `https://matchrv.com`, including the query string. The apex URL does not redirect.

## Homepages

| Current URL | New URL | Status |
| --- | --- | --- |
| `https://matchrv.com/` | `https://matchrv.com/` consumer homepage (search, match, compare, ask the dealer) | stays (new body) |
| `https://matchrv.com/` dealer homepage content | `https://dealer.matchrv.com/` | 301 is not used for `/`. The dealer design moved; the apex path was replaced. |
| `https://dealer.matchrv.com/` | DealerHome (free Visibility Snapshot, audits, LotAI, booking) | new host |

## Dealer marketing (apex → dealer subdomain)

| Current URL | New URL | Status |
| --- | --- | --- |
| `/visibility-report` | `https://dealer.matchrv.com/visibility-report` | 301 |
| `/visibility-solution` | `https://dealer.matchrv.com/visibility-solution` | 301 |
| `/lotai` | `https://dealer.matchrv.com/lotai` | 301 |
| `/for-dealers` | `https://dealer.matchrv.com/for-dealers` | 301 |
| `/book` | `https://dealer.matchrv.com/book` | 301 |
| `/dealer-tools` | `https://dealer.matchrv.com/dealer-tools` | 301 |
| `/dealer-visibility` | `https://dealer.matchrv.com/dealer-visibility` | 301 |
| `/dealers/chatgpt-advertising` | `https://dealer.matchrv.com/dealers/chatgpt-advertising` | 301 |
| `/dealers/login` | `https://dealer.matchrv.com/dealers/login` | 301 |
| `/dealer-login` | `https://dealer.matchrv.com/dealers/login` | 301 |
| `/dealers/ai` | `https://dealer.matchrv.com/for-dealers` | 301 |
| `/advertising` and `/advertising/` | `https://dealer.matchrv.com/visibility-solution` | 301 |

## Shared company pages

| Path | Consumer | Dealer | Status |
| --- | --- | --- | --- |
| `/about` | shopper story and shop CTAs | dealer story and booking CTAs | both |
| `/contact` | shopper copy; same `POST /api/contact` and `dealer_contact_form` lead type | dealer copy | both |
| `/privacy` | consumer canonical | dealer canonical | both |
| `/terms` | consumer canonical | dealer canonical | both |
| `/terms-and-conditions` | `/terms` on the same host | `/terms` on the same host | 301, same host |

## Consumer pages that stay on matchrv.com

These 301 from `dealer.matchrv.com` to `https://matchrv.com` plus the same path and query.

| Path | Status |
| --- | --- |
| `/shop` | stays (redesigned around shopping) |
| `/swipe` | stays (noindex, unchanged) |
| `/outfitter` | stays |
| `/match` | stays |
| `/match-report` | stays |
| `/browse` and `/browse/:slug` | stays (demo report; still noindex in the sitemap) |
| `/answers` | stays |
| `/mcp-setup` | stays. The documented endpoint remains `https://matchrv.com/mcp`. |
| `/mcp-docs` | stays |
| `/tow-guide`, `/tow-match` | `/tow-guide` stays. `/tow-match` 301s to `/tow-guide` on the same host, then off the dealer host if needed. |
| `/find-the-right-rv-for-your-tow-vehicle` | stays |
| `/finance`, `/sell`, `/discover`, `/campgrounds`, `/pricing` | `/pricing` still 301s to `/campgrounds`. The others stay. |
| `/guides` and `/guides/*` | stays. `/buyer-guides` 301s to `/guides`. |
| `/rv-financing` and `/rv-financing/*` | stays |
| `/rvs-for-sale`, `/travel-trailers-for-sale`, `/fifth-wheels-for-sale`, `/class-a-rvs-for-sale`, `/class-b-rvs-for-sale`, `/class-c-rvs-for-sale`, `/toy-haulers-for-sale` | stays |
| `/rv/*` legacy paths | 301 to the matching `*-for-sale` path on the same host |
| `/rv-dealers` | stays |
| `/dealers` | stays (directory). Child paths in the dealer table above do not. |
| `/account`, `/saved`, `/searches`, `/alerts`, `/messages`, `/admin` | stays |
| `/sign-in`, `/sign-up` | stays |
| `/trips`, `/trips/:id`, `/ar` | stays |
| `/about-us` | 301 to `/about` |
| `/fleet` | 301 to `/shop` |

## Sitemaps

| URL | What it lists |
| --- | --- |
| `https://matchrv.com/sitemap.xml` | consumer core, state/type hubs, unit pages |
| `https://matchrv.com/sitemaps/core.xml` | consumer HTML only |
| `https://dealer.matchrv.com/sitemap.xml` | dealer core only |
| `https://dealer.matchrv.com/sitemaps/core.xml` | dealer HTML only |
| `https://dealer.matchrv.com/sitemaps/units-*.xml` and `hubs.xml` | 404. Listings are not duplicated. |
