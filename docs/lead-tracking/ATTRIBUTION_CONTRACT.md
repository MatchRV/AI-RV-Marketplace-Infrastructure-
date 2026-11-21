# Client attribution contract

What clients (the Expo app on iOS/Android, the website, ChatGPT/MCP hosts, LotAI and other
agents) send so a lead can be attributed precisely. **Everything is optional and
backward-compatible**: a client that sends nothing works exactly as today and its leads are
attributed from the channel and user agent alone. Unknown values become `other`/`unknown`;
malformed values are dropped; nothing here can make a request fail. Never put a name, email,
phone or free text in any of these fields; values that look like PII (contain `@`, spaces, URLs)
are dropped or collapsed to `other`.

Server code: `artifacts/api-server/src/services/lead-attribution.ts`.

## 1. HTTP headers (app → `/api/*` and `/mcp`)

Send on every API call (inquiries, funnel events, and MCP calls if the app talks to `/mcp`):

| Header | Values | Example |
|---|---|---|
| `X-MatchRV-Client` | `native_ios` \| `native_android` \| `website` \| `lotai` \| `other_ai_agent` (aliases: `ios`, `android`, `web`, `matchrv-ios`, `matchrv-android`, `agent`) | `native_ios` |
| `X-MatchRV-Platform` | `ios` \| `android` \| `web` | `ios` |
| `X-MatchRV-App-Version` | `[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}` | `1.0.0+42` |
| `X-MatchRV-Session-Id` | opaque id, 8–120 chars `[A-Za-z0-9._:-]`, new per app session (e.g. after 30 min idle) | `s_01JD5Z8K3Q…` |
| `X-MatchRV-Device-Id` | opaque install id (random UUID stored in SecureStore; **not** the advertising id, not the Firebase uid) | `d_7f3c…` |
| `X-MatchRV-Anonymous-Id` | optional opaque analytics id (e.g. PostHog distinct id if anonymous) | |
| `X-MatchRV-Surface` | the screen the call came from (see surfaces) | `swipe` |

The native app must send `X-MatchRV-Client` (or `X-MatchRV-Platform`): its HTTP stack's user
agent (iOS CFNetwork / Android okhttp) is otherwise classified as a script by bot detection and
would not count as a shopper.

**Surfaces:** `swipe`, `grid`, `ask_ai`, `favorites`, `compare`, `saved_search_alert`,
`price_drop`, `tow_fit`, `unit_detail`, `other`. Accepted aliases: `listing_detail`/`detail` →
`unit_detail`, `discover`/`search`/`results` → `grid`, `chat` → `ask_ai`, `saved`/`favorite` →
`favorites`, `alert` → `saved_search_alert`, `price_alert` → `price_drop`, `tow` → `tow_fit`.
For an inquiry, the surface is **where the shopper pressed Contact Dealer** (e.g. opened from a
price-drop notification → `price_drop`).

## 2. `attribution` object (body field / MCP tool argument)

Optional object, at most 8 KB serialized. Body/argument values win over headers.

```json
{
  "client": "native_ios",
  "platform": "ios",
  "app_version": "1.0.0",
  "surface": "price_drop",
  "campaign": "dealer-pilot-nov",
  "utm_source": "facebook", "utm_medium": "paid_social", "utm_campaign": "spring-towables",
  "utm_term": "travel-trailer", "utm_content": "carousel-2",
  "referrer": "https://www.facebook.com/",
  "landing_page": "/listing/abc123",
  "session_id": "s_01JD5Z8K3QX9", "device_id": "d_7f3c2a9e11", "anonymous_id": "a_0193f2",
  "journey": {
    "views": 12, "swipes": 40, "favorites": 3, "searches": 2, "impressions": 80, "compares": 1,
    "first_at": "2026-11-21T17:02:11Z", "last_at": "2026-11-21T17:25:40Z",
    "events": [
      { "type": "search", "at": "2026-11-21T17:02:11Z", "surface": "grid" },
      { "type": "favorite", "at": "2026-11-21T17:20:03Z", "surface": "swipe", "unit_id": "vin:1UJBJ0BN8M1TJ0001" }
    ]
  }
}
```

- `campaign`, `utm_*`: lowercase slugs `[a-z0-9][a-z0-9._+~-]*`, ≤ 80 chars (others → `other`).
  For app installs/deep links, pass the utm params from the opening link (`matchrv://…?utm_source=…`).
- `referrer`: reduced to its host. `landing_page`: path only (query stripped, ids collapsed).
- `journey` (optional fallback): counts ≤ 100,000; `events` types `impression`, `view`, `swipe`,
  `favorite`, `search`, `compare`, `inquiry_start`; up to 200 sent, the last 25 kept. The server
  prefers the journey it recorded itself from funnel events with the same session/device id
  (last 24 h), so an app that posts funnel events (section 3) does not need to send this.

### Where to put it

| Call | Where |
|---|---|
| `POST /api/inquiries` (preview step) | top-level `attribution` field next to `unit_id`, `name`, … (it is carried in the signed confirmation token; you may send it again on the confirm step, later values win) |
| `/mcp` `prepare_dealer_inquiry`, `send_dealer_inquiry`, `search_rvs`, `get_rv`, `compare_rvs` | extra tool argument `attribution`, **or** `params._meta["matchrv/attribution"]` on the `tools/call` request, **or** the headers above. The published tool schemas are unchanged; the server reads the raw arguments before the SDK strips unknown keys, so old clients and strict hosts are unaffected |
| `/mcp/v1` `prepare_inquiry`, `send_inquiry`, `search_inventory`, `get_unit` | same as `/mcp`; the API key additionally makes the source verified (`lotai` for LotAI client ids) |
| `POST /api/leads` (legacy forms) | top-level `attribution` field |

## 3. Funnel events: `POST /api/funnel/events`

```http
POST /api/funnel/events
Content-Type: application/json
X-MatchRV-Client: native_ios
X-MatchRV-Session-Id: s_01JD5Z8K3QX9
X-MatchRV-Device-Id: d_7f3c2a9e11

{ "events": [
    { "type": "impression", "surface": "swipe", "count": 10 },
    { "type": "view", "surface": "swipe", "unit_id": "vin:1UJBJ0BN8M1TJ0001" },
    { "type": "favorite", "surface": "swipe", "unit_id": "vin:1UJBJ0BN8M1TJ0001" }
  ],
  "attribution": { "utm_source": "facebook" } }
```

- `type`: `impression` | `view` | `swipe` | `favorite` | `search` | `compare` | `inquiry_start`.
  (`inquiry` is rejected: the server counts it only when an inquiry is really sent.)
- `surface`: as above. `unit_id`: the MatchRV unit id from MCP results. `count`: 1–100 (batch
  impressions instead of one event per card).
- 1–25 events per request, body ≤ 8 KB, 60 requests/min per client address. Batch and flush
  every ~10 s or on app background. Response `202 {"accepted": n}`; `404` while lead tracking is
  off (treat as success and drop), `429` back off 60 s, `400` drop the batch.
- Suggested mapping in the app: card shown → `impression`; detail opened → `view`; right swipe →
  `swipe` + `favorite`; left swipe → `swipe`; saved → `favorite`; Ask AI/filters run → `search`;
  compare opened → `compare`; inquiry form opened → `inquiry_start`.

## 4. Website (already wired in this PR)

The site records the first landing of each browser session (utm tags, referrer host, landing
path) in sessionStorage and sends `attribution` with `client: "website"`, the surface
(`unit_detail` for the listing page, `swipe` for the swipe sheet) and its analytics session id on
every Contact Dealer inquiry. Its existing `/api/analytics/product` beacon events feed the funnel
counters with the same session id, so website leads get their server-side journey.
