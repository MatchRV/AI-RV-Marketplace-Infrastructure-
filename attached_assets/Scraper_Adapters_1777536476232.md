# Scraper Adapters

> Platform-specific scrapers that handle different dealer website technologies

## Adapter Registry

The scraper uses a **registry pattern** — each dealer domain maps to an adapter class. If no custom adapter exists, the `BaseAdapter` (generic multi-source extraction) is used.

**File:** `lotlink-scraper/scraper/adapters/registry.js`

| Adapter | Platform | Dealers | Method |
|---------|----------|---------|--------|
| PoulsboRvAdapter | WordPress REST API | Poulsbo RV | API-based — no page scraping needed |
| CampingWorldAdapter | Next.js RSC | Camping World (all locations) | Extracts from `__next_f` stream data |
| **InteractRvAdapter** | InteractRV | Fife RV Center | Server-rendered HTML + spec tables |
| **CoastStealthAdapter** | Coast Technology Stealth Suite | Tacoma RV | JS-rendered, Playwright waits for WARP10 widgets |
| BaseAdapter | Generic | 60+ other dealers | Multi-source extraction pipeline |

## InteractRV Adapter (NEW — 2026-04-29)

**File:** `lotlink-scraper/scraper/adapters/interactrv.js`
**Dealers:** Fife RV Center (fifervcenter.com), potentially others

### How InteractRV Works
- Server-rendered HTML — inventory listing pages contain actual content (no API needed)
- jQuery `.ajaxUnitList()` plugin handles AJAX pagination
- Detail pages have rich spec tables with VIN, price, sleeps, length, weight, 20+ images
- Unit IDs embedded in JavaScript: `var unitIds = [3175732, ...]`
- Pagination via `?pg=N` URL parameter
- Detail URL pattern: `/product/{slug}-{unitId}-{pageId}`

### Adapter Strategy
1. Navigate to inventory page with `?resultsperpage=72` (max per page)
2. Extract listing links from server-rendered HTML (`.unit a[href*="/product/"]`)
3. Paginate using URL params (`?pg=2`, `?pg=3`, etc.)
4. Detail page extraction uses the base multi-source pipeline (spec tables, DOM, images)
5. Fife RV has ~166 units across 3 pages

### Key Selectors
```
Listing links: .unitList .unit a[href*="/product/"]
Pagination:    ?pg=N URL parameter
Total count:   "Showing X - Y of Z" text pattern
```

## Coast Technology Stealth Suite Adapter (NEW — 2026-04-29)

**File:** `lotlink-scraper/scraper/adapters/coast-stealth.js`
**Dealers:** Tacoma RV (tacomarv.com, company ID 40)

### How Stealth Suite Works
- Inventory is **entirely client-side rendered** via WARP10 JavaScript widgets
- Widgets fetch from `inventory.coasttechnology.org/api/v3/` but the API requires server-side auth
- Auth goes through WordPress tunnel: `/wp-json/warp10/v1/api/tunnel`
- Page config embedded in `warp10_settings`, `warp10_environment` variables
- Pagination: often infinite scroll or "Load More" buttons

### Adapter Strategy
1. Navigate with Playwright (full browser rendering required)
2. Wait up to 20 seconds for WARP10 widgets to render inventory cards into DOM
3. Extract links from rendered DOM elements
4. Handle pagination via infinite scroll + "Load More" button clicking
5. Visit detail pages for full specs using base extraction pipeline

### Why Not Just Hit the API?
The Coast Technology API at `inventory.coasttechnology.org` returns 404 for unauthenticated requests. Auth is handled server-side through WordPress. Rather than reverse-engineering the auth, we let the browser handle it naturally — same as a real user would see the inventory.

### Key Selectors
```
Inventory cards: .warp10-srp-result a, .warp10-vehicle-card a
Load more:       .warp10-load-more, button:has-text("Load More")
Results count:   /(\d+)\s*results?/i text pattern
```

## Adding New Adapters

1. Create a new file in `adapters/` extending `BaseAdapter`
2. Override key methods:
   - `getInventoryListSelector()` — CSS selectors for listing links
   - `getPaginationType()` — 'click', 'url', or 'scroll'
   - `collectInventoryLinks(page)` — full override for API-based adapters
   - `transformRecord(record)` — post-process extracted data
3. Register in `registry.js`:
   ```javascript
   import { MyAdapter } from './my-adapter.js';
   registry.set('dealerdomain.com', MyAdapter);
   ```

## How to Detect a Dealer's Platform

| Clue | Platform |
|------|----------|
| "Powered by Interact RV" in footer | InteractRV |
| `warp10_settings` in page source | Coast Technology Stealth Suite |
| `/wp-json/pbrv/api/` API calls | Poulsbo RV custom WordPress |
| `__next_f` array in page source | Next.js (Camping World) |
| `DealerSocket` or `DealerOn` in scripts | DealerSocket (use BaseAdapter) |
| No clear platform markers | Use BaseAdapter generic extraction |
