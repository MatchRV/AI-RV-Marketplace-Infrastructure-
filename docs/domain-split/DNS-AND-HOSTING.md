# DNS and hosting for dealer.matchrv.com

Nothing in this document was applied. Production DNS, Caddy, and Render were not changed.

MatchRV today is one Node process on a Google Compute Engine VM. Caddy terminates TLS and proxies to that process. DNS is on Squarespace nameservers. A legacy Render service (`matchrv-webmcp` in `render.yaml`) still exists for the WebMCP demo. The public site Jonathan described is the VM, not Render.

The app already serves both hostnames from that one process. DNS and TLS are the only things required before `https://dealer.matchrv.com` answers.

## Squarespace DNS

Add a record for the host `dealer` in the `matchrv.com` zone. Use the same target the apex uses.

- If `matchrv.com` is an A/AAAA record to the VM, add `dealer` as an A/AAAA to that same address.
- If `matchrv.com` is a CNAME, add `dealer` as a CNAME to the same target. Do not CNAME the apex. Only the `dealer` label is new.

Do not change the apex A/AAAA or the Squarespace nameservers. Do not add a redirect at Squarespace from `matchrv.com` to `dealer.matchrv.com`. The app sends the 301s. A DNS-level redirect would also move `/mcp` and `/api/*`, which must stay on the apex.

`www.matchrv.com` is treated as the consumer host. If `www` is not already pointed at the VM, leave it. This change does not require a www record.

## Caddy

Add a site block for `dealer.matchrv.com` on the same VM. It should terminate TLS for that name and reverse-proxy to the same upstream as `matchrv.com`. Do not add a handle that redirects `/mcp`, `/api`, `/.well-known`, or `/ops`.

Example, matching a typical existing apex block. Replace the upstream port with the port the Node process already uses:

```caddy
dealer.matchrv.com {
  encode gzip
  reverse_proxy 127.0.0.1:PORT
}
```

Caddy will obtain a certificate for `dealer.matchrv.com` once the DNS record points at the VM and ports 80 and 443 reach Caddy. Confirm with:

```bash
curl -sI https://dealer.matchrv.com/ | head
curl -sI https://matchrv.com/mcp | head
curl -sI https://dealer.matchrv.com/lotai | head
curl -sI https://matchrv.com/visibility-solution | head
```

Expected after the app and DNS are both live:

- `dealer.matchrv.com/` is 200 and the dealer homepage.
- `matchrv.com/visibility-solution` is 301 to `https://dealer.matchrv.com/visibility-solution`.
- `matchrv.com/mcp` is not a redirect.
- `dealer.matchrv.com/listing/...` is 301 to `https://matchrv.com/listing/...`.

The repo's older migration note (`docs/superpowers/plans/2026-11-08-google-migration.md`) describes certbot DNS-01 instead of Caddy's automatic issuer. If this VM still issues certificates that way, issue a name for `dealer.matchrv.com` the same way `matchrv.com` was issued, and load that certificate in the existing proxy. Do not switch issuers as part of this change.

## Render

`render.yaml` describes the legacy `matchrv-webmcp` service. It has no custom domains in the file. If that service is still reachable and is ever put in front of `dealer.matchrv.com`, add the custom domain in the Render dashboard for that service only:

- Domain: `dealer.matchrv.com`
- Redirect: none. Render must not redirect the apex, and it must not redirect `/mcp`.

The production path Jonathan is using is the GCE VM behind Caddy. Do not move the apex to Render to make the subdomain work.

## Cookies, CORS, and CSRF

Reviewed with this change. Not a secret or environment change.

- Browser CORS now allows credentialed requests from `https://matchrv.com`, `https://www.matchrv.com`, `https://dealer.matchrv.com`, and local dev hosts. Other origins are refused. Requests with no `Origin` (the MCP server, curl, server-side partners) are still allowed.
- Ops dashboard cookies stay host-only. `sameOrigin` compares the form's Origin to the request Host. A cookie set on `matchrv.com` is not sent to `dealer.matchrv.com`. Keep `/ops/leads-dashboard` on the apex.
- Clerk session cookies are whatever Clerk is configured to set today. This branch does not set `Domain=.matchrv.com` and does not add a Clerk satellite domain. Sign-in on the apex does not automatically sign the dealer host in. See the open decision in the pull request.
- Listing canonicals stay `https://matchrv.com/listing/{id}`. Outbound dealer clicks stay `GET /api/out` on the host the page called. Do not point those at the dealer subdomain.
