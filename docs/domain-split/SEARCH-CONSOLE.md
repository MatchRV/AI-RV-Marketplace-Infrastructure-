# Google Search Console

Do not change Search Console from this repo. Jonathan (or whoever owns the property) does this in the Search Console UI after `dealer.matchrv.com` answers over HTTPS.

## Properties

Keep the existing `matchrv.com` property. Add a second property for the dealer host. A domain property for `matchrv.com` already includes subdomains in the performance report, but sitemap submission and indexing are clearer with a URL-prefix property:

- Existing: `https://matchrv.com/`
- New URL-prefix property: `https://dealer.matchrv.com/`

Verify the new property the same way the apex was verified (DNS TXT at Squarespace, or the HTML file / meta tag method already used). Do not remove the apex verification.

## Sitemaps to submit

| Property | Sitemap |
| --- | --- |
| `https://matchrv.com/` | `https://matchrv.com/sitemap.xml` |
| `https://dealer.matchrv.com/` | `https://dealer.matchrv.com/sitemap.xml` |

The apex sitemap lists shopper pages, state hubs, and `/listing/{id}` URLs. The dealer sitemap lists only dealer HTML. It does not list listings. Submitting the apex sitemap on the dealer property would ask Google to index `matchrv.com` URLs inside the wrong property.

After the 301s have been live, use URL inspection on a few moved pages (`/visibility-solution`, `/lotai`, `/book`) and confirm Google reports the dealer URL as the canonical. Do not ask Google to index the old apex copies.

## What not to change

- Do not remove `https://matchrv.com/sitemap.xml` from the apex property.
- Do not add a change of address from `matchrv.com` to `dealer.matchrv.com`. The apex is still the consumer site.
- Do not inspect or index `/mcp`. It is an API.
