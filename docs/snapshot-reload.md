# In-process inventory snapshot reload

Status: implemented on `perf/snapshot-cache-reload`. Nothing here changes Caddy, DNS, the VM or the pull script.

The API server can swap in a new inventory snapshot without a restart. Shopper and lead state (inquiries, lead previews, sessions, learned memory) lives in other modules and is untouched by a reload.

## Triggers

Both re-read the same file the server loaded at startup (`INVENTORY_SNAPSHOT_PATH` if set, else the bundled `inventory.snapshot.json.gz`).

```sh
# Signal (no output; watch the journal)
systemctl kill -s HUP --kill-whom=main matchrv
# or: kill -HUP "$(systemctl show -p MainPID --value matchrv)"

# HTTP, localhost only. Waits for the outcome. 200 = swapped/unchanged, 422 = rejected.
curl -sS -X POST http://127.0.0.1:10000/internal/reload-snapshot
# Fire and forget (202):
curl -sS -X POST 'http://127.0.0.1:10000/internal/reload-snapshot?wait=0'

# Status: version, unit count, last outcome
curl -sS http://127.0.0.1:10000/internal/snapshot-status
```

Builds without this change exit on SIGHUP (Node's default action). Do not send SIGHUP to a release older than this branch.

## What a reload does

1. Read the file and hash it (sha256). The same bytes as the version being served mean `unchanged`.
2. Check memory headroom: 1.5x the decompressed size must fit in the cgroup limit (systemd `MemoryMax`), host available memory and the V8 heap. On the production snapshot (574 MB decompressed) RSS rose by about 1.1x at peak. `SNAPSHOT_RELOAD_MEMORY_FACTOR` overrides the factor; `0` disables the check.
3. Gunzip on the libuv threadpool and parse in ~25 ms slices.
4. Validate: it parsed, it has a `units` array, units > 0, and the count drops by no more than 10% against the snapshot being served.
5. Index it and fill every per-snapshot cache (listings, counts, filters, screened MCP inventory, slugs, hubs, sitemap, SEO indexability) for the candidate while the old snapshot keeps serving.
6. Swap with one assignment. Every derived cache is keyed on the index object, so the old caches drop out at once and are garbage collected.

Any failure leaves the old snapshot serving and logs the reason. Concurrent triggers coalesce: one reload runs, and all triggers that arrive meanwhile share one follow-up run that re-reads the file.

## Log lines

```
[snapshot-reload] SIGHUP received
[snapshot-reload] <trigger>: reading <path> (<bytes> bytes); serving version <v> (<n> units)
[snapshot-reload] swapped: version <old> (<n> units) -> <new> (<m> units, built <iso>) in <t>ms (read+parse+index <p>ms, caches <w>ms)
[snapshot-reload] unchanged: version <v> (<n> units); nothing to swap
[snapshot-reload] rejected: <reason>; still serving version <v> (<n> units)
[snapshot-reload] <trigger>: a reload is already running; queued one follow-up run
[snapshot-reload] <trigger>: coalesced into the queued follow-up run
```

`<trigger>` is `SIGHUP` or `http`. Rejection reasons include a parse error, `snapshot has 0 units`, `unit count would drop X% (a -> b), more than the 10% limit` and `insufficient memory headroom: ...`.

## Status fields

`GET /internal/snapshot-status`:

- `snapshot.version`: first 16 hex characters of the file's sha256. `snapshot.sha256` is the full hash.
- `snapshot.units`, `snapshot.dealers`, `snapshot.builtAt`: from the snapshot.
- `snapshot.path`, `snapshot.resolvedPath`, `snapshot.sizeBytes`, `snapshot.mtime`, `snapshot.loadedAt`, `snapshot.loadMs`.
- `units`: the same as `snapshot.units`.
- `reload.inProgress`, `reload.queued`, `reload.counts.{swapped,unchanged,rejected}`, `reload.last` (the last outcome, as returned by POST).

The POST response is the outcome: `{ status: "swapped" | "unchanged" | "rejected", trigger, previous?, current, reason?, ms, prepareMs?, warmMs?, finishedAt }`.

## Localhost only

`/internal/*` answers only when both hold:

- the TCP peer (`req.socket.remoteAddress`, not `req.ip`, because `trust proxy` is set) is `127.0.0.1`, `::1` or `::ffff:127.0.0.1`;
- the request carries none of `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `Forwarded`, `X-Real-IP`, `Via`, `CF-Connecting-IP`.

Caddy's `reverse_proxy` connects from 127.0.0.1 but always adds `X-Forwarded-For`, so a public request for `/internal/...` gets a 404. Anything else under `/internal` is a 404 too. Responses carry `Cache-Control: no-store`.

Defence in depth (not applied; it is a Caddy change and needs its own approval): add this to the site block before `reverse_proxy`:

```
respond /internal/* 404
```

Check from outside: `curl -si -X POST https://<public host>/internal/reload-snapshot` must return 404.

## Pull script

`matchrv-inventory-pull.mjs` can replace `systemctl restart matchrv` with the POST above and keep its existing wait on `/api/listings?limit=1`. On a `rejected` outcome, or if the request fails, it should fall back to the restart it does today. The pull script's own 10% check stays; the server repeats it.

## Costs and risks

- While a reload runs both snapshots are in memory (about +0.6 GB RSS on the production snapshot). The headroom check refuses the reload when that does not fit.
- Indexing and some cache builds run synchronously; on the production snapshot the longest event-loop stall during a reload was about 2 s, over a ~14 s reload.
- A request already in flight when the swap happens can see old and new data in one response.
