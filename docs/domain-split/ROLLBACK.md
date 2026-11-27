# Rollback

This change is application code only. DNS, Caddy, Render, Search Console, and Clerk were not modified. Rolling back the app restores the previous single-host behavior even if a `dealer` DNS record already exists, because that record would then hit the old build, which does not know the hostname.

## Application rollback

1. Do not merge this branch, or revert the merge commit on `main` if it has been merged.
2. Redeploy the previous build to the GCE VM the same way the current app is deployed. Do not change the Caddyfile as part of the rollback.
3. Confirm:
   - `https://matchrv.com/` is the previous dealer homepage again.
   - `https://matchrv.com/mcp` still answers.
   - `https://matchrv.com/listing/{id}` still answers and its canonical is still `https://matchrv.com/listing/{id}`.
   - `https://matchrv.com/sitemap.xml` is a single sitemap index again.
4. If `dealer.matchrv.com` was already pointed at the VM, leave the DNS record. The old build will serve the same app there. Remove the Search Console property only if one was created for the subdomain.

## What this rollback does not undo

- Analytics events already captured with `site_surface` stay in PostHog and GA4. They are an extra property. Old dashboards that ignore it keep working.
- Lead rows, click rows, and inquiry attribution are unchanged by this branch. There is nothing to migrate back.
- A 301 that Google has already seen can stay in the index until Google recrawls. After rollback, those URLs return 200 again on the apex. Request indexing for `/`, `/visibility-solution`, `/lotai`, and `/book` if the redirects were live.

## Do not do this during rollback

- Do not delete `/mcp` or point it at another host.
- Do not change `/api/out` or listing URLs.
- Do not edit Squarespace DNS, Caddy, or Render while reverting the app, unless a dealer site block was added later. If it was, remove only that site block after the app rollback, so `matchrv.com` keeps its certificate and proxy.
