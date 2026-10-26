# Schema.org JSON-LD templates for MatchRV

Draft templates for making MatchRV pages machine-readable for search engines and AI crawlers. They map MatchRV's canonical inventory schema (`CanonicalUnit` in `lib/agent-core/src/types.ts`) to schema.org.

Files in this folder:

| File | Use |
|---|---|
| `unit-detail.jsonld` | Template for `/listing/{id}`: Product + Vehicle + Offer, seller AutoDealer, Place, BreadcrumbList |
| `unit-detail.example.jsonld` | The same template filled with **fictional example data** (fake VIN, fake dealer) |
| `dealer.jsonld` | Template for a dealer page: AutoDealer + LocalBusiness |
| `homepage.jsonld` | Template for `/`: Organization + WebSite with SearchAction + WebAPI (the MCP server) |

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
| `status` | `offers.availability` | `available` = `InStock`; `pending` = `Reserved`; `removed` = `SoldOut` (and consider `noindex`); `unknown` = **omit** `availability` |
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
| Unit detail | `/listing/:id` | Product + Vehicle + Offer, seller AutoDealer, Place, BreadcrumbList | Partly live: `artifacts/api-server/src/lib/listing-seo.ts` already injects Product + Vehicle + Offer. Specs, provenance and breadcrumbs are the follow-up. |
| Dealer page | none yet (proposed `/dealers/:dealerId`) | AutoDealer + LocalBusiness, with `makesOffer` AggregateOffer and an ItemList of units | New route needed. `/dealers` and `/rv-dealers` are list pages and should carry an ItemList of dealer links. |
| Category pages | `/travel-trailers-for-sale`, `/fifth-wheels-for-sale`, etc. | CollectionPage + ItemList of `/listing/` URLs, plus BreadcrumbList | Optional |
| Homepage | `/` | Organization + WebSite (SearchAction) + WebAPI for the MCP server | `index.html` already has Organization + WebSite. Its SearchAction needs fixing (below). |

### Homepage SearchAction

`SearchAction` must point at an **HTTP URL template** that a browser can open and that contains `{search_term_string}`. It can't point at the MCP endpoint, which takes JSON-RPC POSTs rather than a GET URL.

- The current `index.html` SearchAction uses `"urlTemplate": "https://matchrv.com/shop"` with no `{search_term_string}` and no `query-input`, so it isn't valid.
- No page in the router reads a search query today. `/shop`, `/rvs-for-sale` and `/browse` don't read `?q=`. The only GET search endpoint is the JSON API `/api/listings?search=`, which isn't a page.
- `homepage.jsonld` uses `https://matchrv.com/rvs-for-sale?q={search_term_string}`, which **requires a follow-up code change** so `/rvs-for-sale` reads `q`. Until that ships, omit the SearchAction rather than publish one that ignores the query.
- The MCP server is described as a linked `WebAPI` node (`subjectOf`), with `documentation` pointing to `/mcp-setup`.

## Follow-up code changes (not in this PR)

1. `listing-seo.ts` `availability()`: `unknown` currently maps to `InStock` and `pending` to `PreOrder`. Change these to omit availability for `unknown` and use `Reserved` for `pending`.
2. `buildUnitJsonLd()`: add `bodyType`, `vehicleConfiguration`, `itemCondition`, `weightTotal`, the `additionalProperty` specs with provenance, `availableAtOrFrom`, and BreadcrumbList, following this mapping.
3. Fix or remove the homepage SearchAction in `artifacts/rv-marketplace/index.html`.
4. Add dealer detail pages if dealer schema is wanted.
5. Validate rendered output with the Schema.org validator (validator.schema.org) and Google's Rich Results Test before shipping.
