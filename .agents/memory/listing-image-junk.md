---
name: Listing image arrays contain non-photo junk
description: Scraped listing.images include dealer banners, floor-plan drawings, and duplicate resolution variants that pollute the detail gallery
---

# Listing images contain non-photo junk

Per-listing `images` arrays coming from dealer feeds (e.g. overfuel.com) are NOT a
clean set of unit photos. A single listing's array commonly mixes in:

- **Dealer marketing banners** under a `/dealers/.../image/*Banner*.webp` path (these
  are the generic "different RV / fake stock" images users complain about).
- **Floor-plan tech drawings** (`unit_tech_drawing_*.webp`) — legitimately belong to
  the unit, kept on purpose.
- **Duplicate resolution / thumbnail variants** of the same photo: same base URL with
  `?w=1920&q=80`, `?w=1080&q=80`, or a `-thumb` suffix. These inflate the gallery and
  the "1 / N" counter.

**Why this matters:** the reported "wrong/mismatched gallery photos" bug was caused by
the banner + duplicate variants inside one listing's own array, NOT by cross-listing
leakage. The hero (`images[0]`) is always a real photo, which is why only the
thumbnails/lightbox looked wrong.

**How to apply:** clean images before rendering any gallery. `cleanListingImages()`
in `artifacts/rv-marketplace/src/lib/listing-images.ts` filters marketing assets and
dedupes by a normalized key (strip query string + `-thumb`). Never fall back to a
stock placeholder image when a listing has zero photos — render a "Photos coming soon"
state instead, or the placeholder reads as a fake/mismatched photo.
