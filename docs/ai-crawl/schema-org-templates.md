# Schema.org JSON-LD templates for MatchRV

Draft templates for making MatchRV pages machine-readable for search engines and AI crawlers. They map MatchRV's canonical inventory schema (`CanonicalUnit` in `lib/agent-core/src/types.ts`) to schema.org.

Files in this folder:

| File | Use |
|---|---|
| `unit-detail.jsonld` | Template for `/listing/{id}`: Product + Vehicle + Offer, seller AutoDealer, Place, BreadcrumbList |
| `unit-detail.example.jsonld` | The same template filled with **fictional example data** (fake VIN, fake dealer) |
| `dealer.jsonld` | Template for a dealer page: AutoDealer + LocalBusiness |
| `homepage.jsonld` | Template for `/`: Organization + WebSite + WebAPI (the MCP server). No SearchAction until a page reads a query (see below). |

`{{...}}` placeholders refer to `CanonicalUnit` paths. When rendering, numbers and booleans are emitted as JSON numbers and booleans, not strings. The templates are kept as valid JSON so they can be linted.

## Golden rule: unknown stays unknown

1. **Omit, never guess.** If a `Fact` has `value: null`, leave the whole property (or `additionalProperty` entry) out. Don't emit `0`, `""`, `"N/A"` or a default.
2. **Database defaults are not facts.** The legacy `listings` and `dealers` tables have column defaults (`sleeps` = 2, `slides` = 0, `awning` = true, `dealers.rating` = 4.0, `yearsInBusiness` = 5, `avgResponseTime` = "< 2 hours"). Never emit these into JSON-LD. Use only `CanonicalUnit` facts with a non-null `source`.
3. **No `aggregateRating` or `review`** unless it comes from real, attributable reviews. Never use the default `dealers.rating`.
4. **Drop empty containers.** If every field inside `vehicleEngine`, `geo` or `towing` is unknown, drop the container.
5. **VIN only if valid.** Emit `vehicleIdentificationNumber` only for a 17-character VIN that passes `isRealVin()` (already in `listing-seo.ts`).
6. **Provenance stays with the value.** Each spec in `additionalProperty` carries `measurementTechnique` = the `FactSource` (`dealer_listing`, `derived_text`, `derived_model_code`, `reference_table`, `computed`, `learned`) and a `description` such as `"Source: dealer_listing; confidence: high"`. The `unknownFields` entry lists which canonical fields are null, so agents can see the gap is honest rather than an omission.

## Canonical field to schema.org mapping

### Identity and listing

| Canonical field (`CanonicalUnit`) | schema.org property | Notes |
|---|---|---|
| `id` | `@id`, `url`, `offers.url` | `https://matchrv.com/listing/{id}` (matches `listingCanonicalUrl()`) |
| `title` | `name` | |
| `description` | `description` | First 500 characters, as in the current builder |
| `images[]` | `image` | Absolute URLs |
| `stockNumber` | `sku` | Omit if null |
| `vin` | `vehicleIdentificationNumber` | Only if valid (rule 5) |
| `year` | `vehicleModelDate` | String, e.g. `"2026"` |
| `make` | `brand` (Brand), `manufacturer` (Organization) | |
| `model` + `trim` | `model` | |
| `floorplanCode` | `vehicleConfiguration` | e.g. `"26BH"` |
| `rvType` | `bodyType` | `travel_trailer` = "Travel Trailer", `fifth_wheel` = "Fifth Wheel", `toy_hauler` = "Toy Hauler", `class_a` = "Class A Motorhome", `class_b` = "Class B Motorhome", `class_c` = "Class C Motorhome", `popup_camper` = "Pop-Up Camper", `truck_camper` = "Truck Camper" |
| `condition` | `itemCondition` (product and offer) | `new` = `NewCondition`, `used` = `UsedCondition` |

### Price and status (Offer)

| Canonical field | schema.org property | Notes |
|---|---|---|
| `priceUsd.value` | `offers.price` | Omit `price` if unknown. Don't emit `msrpUsd` as `price`. |
| (constant) | `offers.priceCurrency` | `USD` |
| `msrpUsd.value` | `offers.priceSpecification` (UnitPriceSpecification, `priceType` = `https://schema.org/ListPrice`) | Optional; only if known |
| `status` | `offers.availability` | `available` = `InStock`; `pending` = `Reserved` (on hold for a buyer; never `PreOrder`); `removed` = `OutOfStock` (and consider `noindex`); `unknown` = **omit** `availability` entirely (never `InStock`). Live in `listing-seo.ts` `availability()`, covered by `artifacts/api-server/test/listing-seo-availability.test.ts`. |
| `dealer` | `offers.seller` (AutoDealer), `offers.availableAtOrFrom` (Place) | Linked by `@id` to the dealer nodes |
| `provenance.lastSeenAt` | `additionalProperty` `lastVerifiedAt` | Freshness anchor used by `check_availability` |

### Specs (Vehicle and additionalProperty)

| Canonical field | schema.org property | unitCode |
|---|---|---|
| `lengthFt` | `additionalProperty` `lengthFt` | `FOT` (feet) |
| `gvwrLbs` | `weightTotal` (QuantitativeValue) **and** `additionalProperty` `gvwrLbs` (with provenance) | `LBR` (pounds) |
| `dryWeightLbs` | `additionalProperty` `dryWeightLbs` | `LBR` |
| `hitchWeightLbs` | `additionalProperty` `hitchWeightLbs` | `LBR` |
| `sleeps` | `additionalProperty` `sleeps` | none. Don't use `vehicleSeatingCapacity`, which means seat belts, not berths. |
| `slideouts` | `additionalProperty` `slideouts` | none |
| `freshWaterGal`, `greyWaterGal`, `blackWaterGal` | `additionalProperty` | `GLL` (US gallons) |
| `bunkhouse`, `entryDoors`, `solar`, `lithiumBattery`, `generator`, `fourSeason`, `outdoorKitchen` | `additionalProperty` (boolean, number or enum value) | none |
| `boondocking.score` | `additionalProperty` `boondockingScore` | none. Include `missingInputs` in `description`. |

### Motorized only (`powertrain`, `towing`)

| Canonical field | schema.org property | unitCode |
|---|---|---|
| `powertrain.fuelType` | `fuelType` | `gas` = "Gasoline", `diesel` = "Diesel" |
| `powertrain.engine` | `vehicleEngine.name` | |
| `powertrain.horsepower` | `vehicleEngine.enginePower` | `BHP` |
| `powertrain.torqueLbFt` | `vehicleEngine.torque` | `F17` (lbf·ft) |
| `powertrain.transmission` | `vehicleTransmission` | |
| `powertrain.chassis` | `additionalProperty` `chassis` | |
| `towing.cargoCapacityLbs` | `payload` | `LBR` |
| `towing.hitchTowRatingLbs` | `trailerWeight` | `LBR` |
| `towing.tongueWeightLimitLbs` | `tongueWeight` | `LBR` |
| `towing.gcwrLbs`, `frontAxleRatingLbs`, `rearAxleRatingLbs` | `additionalProperty` | `LBR` |

For towables, `tongueWeight` and `trailerWeight` don't apply. Those Vehicle properties describe what a vehicle can tow; a trailer's own hitch weight goes in `additionalProperty` `hitchWeightLbs`.

### Dealer (`DealerRef`)

| Canonical field | schema.org property |
|---|---|
| `dealer.id` | `@id` (`https://matchrv.com/dealers/{id}#dealer`) |
| `dealer.name` | `name` (pass through `dealerDisplayName()`) |
| `dealer.city`, `dealer.state` | `address.addressLocality`, `address.addressRegion`; `addressCountry` = `US` |
| `dealer.lat`, `dealer.lng` | `geo` (GeoCoordinates). Omit if null. |
| `dealer.website` | `url` on unit pages; `sameAs` on dealer pages |
| `dealers.phone` (DB) | `telephone`. Only if present. |

## Which pages carry which schema

| Page | Route | Schema | Status |
|---|---|---|---|
| Unit detail | `/listing/:id` | Product + Vehicle + Offer, seller AutoDealer, Place, BreadcrumbList | Partly live: `artifacts/api-server/src/lib/listing-seo.ts` already injects Product + Vehicle + Offer, with the availability mapping above. Specs, provenance and breadcrumbs are the follow-up. |
| Dealer page | none yet (proposed `/dealers/:dealerId`) | AutoDealer + LocalBusiness, with `makesOffer` AggregateOffer and an ItemList of units | New route needed. `/dealers` and `/rv-dealers` are list pages and should carry an ItemList of dealer links. |
| Category pages | `/travel-trailers-for-sale`, `/fifth-wheels-for-sale`, etc. | CollectionPage + ItemList of `/listing/` URLs, plus BreadcrumbList | Optional |
| Homepage | `/` | Organization + WebSite + WebAPI for the MCP server | `index.html` has Organization + WebSite. The broken SearchAction was removed (below). |

### Homepage SearchAction

`SearchAction` must point at an **HTTP URL template** that a browser can open and that contains `{search_term_string}`. It can't point at the MCP endpoint, which takes JSON-RPC POSTs rather than a GET URL.

- `index.html` used to carry a SearchAction with `"urlTemplate": "https://matchrv.com/shop"`, no `{search_term_string}` and no `query-input`, so it wasn't valid. **It has been removed**; the WebSite and Organization nodes stay.
- No page in the router reads a search query today. `/shop`, `/rvs-for-sale` and `/browse` don't read `?q=`. The only GET search endpoint is the JSON API `/api/listings?search=`, which isn't a page.
- `homepage.jsonld` therefore has **no SearchAction**. Add one only after a page actually reads the query, e.g. `/rvs-for-sale?q=`, using `"urlTemplate": "https://matchrv.com/rvs-for-sale?q={search_term_string}"` and `"query-input": "required name=search_term_string"`. Never publish a SearchAction whose page ignores the query.
- The MCP server is described as a linked `WebAPI` node (`subjectOf`), with `documentation` pointing to `/mcp-setup`.

## Done in PR #55

- `listing-seo.ts` `availability()`: `unknown` now emits no availability (was `InStock`) and `pending` emits `Reserved` (was `PreOrder`). The client-side `/listing/:id` JSON-LD in `listing-detail.tsx` no longer hard-codes `InStock` (those records carry no verified status).
- Removed the invalid homepage SearchAction from `artifacts/rv-marketplace/index.html`.
- These templates stay documentation; none of them is added to live pages yet.

## Follow-up code changes (not in this PR)

1. `buildUnitJsonLd()`: add `bodyType`, `vehicleConfiguration`, `itemCondition`, `weightTotal`, the `additionalProperty` specs with provenance, `availableAtOrFrom`, and BreadcrumbList, following this mapping.
2. Add dealer detail pages if dealer schema is wanted.
3. `dealer-tools.ts` (the dealer JSON-LD generator for dealers' own feeds) still defaults `availability` to `InStock`; review separately.
4. Validate rendered output with the Schema.org validator (validator.schema.org) and Google's Rich Results Test before shipping.
