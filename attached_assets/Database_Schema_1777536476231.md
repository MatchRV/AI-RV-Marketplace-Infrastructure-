# Database Schema — Listings Table

> 68 fields per listing, populated by the scraper

## Identity & Sourcing
| Field | Type | Notes |
|-------|------|-------|
| `dealer_name` | string | e.g. "Fife RV Center" |
| `dealer_domain` | string | e.g. "fifervcenter.com" |
| `dealer_location` | string | City/state |
| `source_inventory_url` | string | Where it was scraped from |
| `source_detail_url` | string | Detail page URL |
| `scraped_at` | datetime | When first scraped |
| `last_seen_at` | datetime | Most recent scrape |

## Status
| Field | Type | Values |
|-------|------|--------|
| `inventory_status` | enum | available, sold, pending, unknown |
| `condition` | enum | new, used, unknown |

## Core Vehicle Info
| Field | Type |
|-------|------|
| `year` | number |
| `make` | string |
| `model` | string |
| `trim` | string |
| `title` | string |
| `stock_number` | string |
| `vin` | string |

## Classification
| Field | Type | Values |
|-------|------|--------|
| `rv_type` | string | Class A, Class B, Class C, Fifth Wheel, Travel Trailer, Toy Hauler, Pop-Up, Truck Camper |

## Appearance
| Field | Type |
|-------|------|
| `exterior_color` | string |
| `interior_color` | string |

## Pricing
| Field | Type | Notes |
|-------|------|-------|
| `price` | number | Asking price |
| `sale_price` | number | Discounted price (if on sale) |
| `msrp` | number | Manufacturer suggested retail |
| `currency` | string | Default: USD |

## Mechanical
| Field | Type |
|-------|------|
| `mileage` | number |
| `engine` | string |
| `fuel_type` | string |
| `transmission` | string |
| `drivetrain` | string |

## Dimensions & Weight
| Field | Type | Used in Matching |
|-------|------|-----------------|
| `length` | number | Yes — maxLength/minLength filter |
| `width` | number | |
| `height` | number | |
| `dry_weight` | number | Yes — tow capacity fallback |
| `gvwr` | number | Yes — tow capacity check |
| `hitch_weight` | number | AI re-ranking |
| `payload_capacity` | number | |

## Living Facilities
| Field | Type | Used in Matching |
|-------|------|-----------------|
| `sleeps` | number | Yes — travelers filter |
| `slideouts` | number | AI re-ranking (full hookup preference) |
| `fresh_water_capacity` | number | AI re-ranking (boondocking) |
| `gray_water_capacity` | number | AI re-ranking (boondocking) |
| `black_water_capacity` | number | AI re-ranking (boondocking) |
| `fuel_capacity` | number | |
| `propane_capacity` | number | |

## Equipment
| Field | Type | Used in Matching |
|-------|------|-----------------|
| `axle_count` | number | |
| `refrigerator_size` | string | |
| `air_conditioner` | boolean | AI re-ranking |
| `awning` | boolean | AI re-ranking |
| `bunkhouse` | boolean | AI re-ranking (hasKids) |
| `toy_hauler` | boolean | AI re-ranking (activities) |
| `washer_dryer_prep` | boolean | AI re-ranking (full-time use) |
| `leveling_jacks` | boolean | AI re-ranking |
| `generator` | boolean | AI re-ranking (boondocking) |

## Textual Content
| Field | Type | Notes |
|-------|------|-------|
| `description` | string | Free text, first 300 chars sent to AI re-ranker |
| `features` | string[] | Array, first 20 items sent to AI re-ranker |

## Raw Data
| Field | Type |
|-------|------|
| `specs` | object | Raw spec dictionary |

## Media
| Field | Type |
|-------|------|
| `image_urls` | string[] |
| `image_count` | number |
| `primary_image` | string |
| `video_urls` | string[] |
| `brochure_url` | string |
| `floorplan` | string |

## Evidence & Traceability
| Field | Type |
|-------|------|
| `raw_json_blobs` | array |
| `extraction_confidence` | enum (high, medium, low) |
| `extraction_notes` | array |
| `field_sources` | object |

## Internal Tracking (added by inventory store)
| Field | Type | Notes |
|-------|------|-------|
| `_first_seen` | datetime | When listing first appeared |
| `_last_seen` | datetime | Last time scraper confirmed it |
| `_removed_at` | datetime | When it disappeared from dealer site |
| `_price_history` | array | Price changes over time |
