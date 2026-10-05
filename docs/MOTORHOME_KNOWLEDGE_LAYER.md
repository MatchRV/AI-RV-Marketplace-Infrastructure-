# Motorhome knowledge layer

MatchRV's canonical record distinguishes an observed dealer listing from a validated vehicle specification. The first implementation adds explicit motorhome fields and receipts to `get_rv`; it does **not** populate missing manufacturer facts or certify a tow setup.

## Record contract

Each motorhome rating is a `Fact<T>` with `value`, `source`, `confidence`, optional exact `sourceUrl`, and `observedAt`. Missing values remain `null`. The record carries dealer listing URL and first/last observation times. `get_rv` returns the full canonical unit plus `knowledge` receipts for price, identity, availability, photos, and the motorhome fields. Compact search cards stay small.

Motorhome fields: GVWR (already canonical), UVW, OCCC, CCC, GCWR, front/rear axle ratings, receiver hitch and tongue ratings, engine, horsepower, torque, transmission, chassis, and the calculated towing **screening ceiling at GVWR**. Dealer `hitchWeightLbs` for trailers is distinct from a motorhome's receiver rating.

The screening calculation is `min(receiver hitch rating, GCWR - GVWR)` only when all three ratings are valid for the exact coach. It gives the ceiling if the motorhome itself is at GVWR. A real towing assessment uses the measured loaded motorhome weight, manufacturer/chassis instructions, receiver and tongue limits, axle loads, brakes, equipment and the towed vehicle's actual loaded weight. UVW cannot substitute for loaded weight. OCCC is never inferred from UVW.

## Source pipeline to build next

1. Ingest dealer inventory with a listing URL, observation timestamp and raw evidence; do not discard the original source.
2. Ingest manufacturer/chassis specifications with exact year, make, model, floorplan, chassis, VIN or option identifiers, source URL, publication date and units. Require a configuration match before joining; a model family's maximum rating is not an exact-coach fact.
3. Normalize units and reject implausible values. Retain conflicting facts as a review queue instead of silently choosing a larger rating.
4. Publish the canonical record and receipts through MCP. Search may rank on facts, but hard requirements remain unverified when a needed value is missing or only inferred.
5. Recheck availability and price with the dealer before a purchase decision. A snapshot timestamp is not a live guarantee.

Current scraped inventory rarely carries these additional structured ratings. The new fields will therefore return `null` until source-backed ingestion is built and the snapshot is regenerated. Do not represent this schema change as a completed nationwide verified knowledge base.
