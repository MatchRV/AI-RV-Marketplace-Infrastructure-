# MatchRV inventory import manifest

Source upload set received 2026-09-17. These files are intended for the MatchRV inventory ingestion pipeline. Preserve missing specifications as unknown; do not infer horsepower, towing capacity, suspension, Starlink, or other equipment from absent source fields.

## Source files

| File | Rows | Unique record IDs | SHA-256 |
|---|---:|---:|---|
| `inventory_master.csv` | 30,500 | 30,500 | `e4bf22f0db43216842f2ea159b6b6b792fe0331345853a3767395e5af12e2c0b` |
| `inventory_master.json` | 30,500 | 30,500 | `85b66e7161f284b92f0b410f16ac2f740c6a524e33b45c789707f661629fc603` |
| `inventory_push_4000.csv` | 4,000 | 4,000 | `ba6bb92a4ed0a891b8ec773f4ad089c0c3ef2cd7f6ea9f568b0f8862f77d86b3` |
| `inventory_push_4000.json` | 4,000 | 4,000 | `47720c0d500af3bbbdbb5cae4ddf39938561619a151f05538962fbb97acc5dd1` |
| `inventory_push_bulk.csv` | 4,000 | 4,000 | `a6edd3d594482ec941d95a0e89c693aa97c6ae8a20a61afeb1ac55423a04d819` |
| `inventory_push_bulk.json` | 4,000 | 4,000 | `37717e7c9cdddc996b46fff22f5bcb8a7806661cfbb0d10b8b6c75f22201c23b` |

## Canonical inventory

`inventory_master.csv` / `inventory_master.json` represent the same 30,500 record IDs and are the canonical full source set. Both 4,000-record push datasets are subsets of the master and must not be appended as additional units. The two push sets overlap each other by 2,686 record IDs.

Expected canonical source count: **30,500 unique listing IDs**.

## Data-quality notes

The master source contains 4,296 blank VIN values and 2,998 additional nonblank VIN-field values that do not look like valid 17-character VINs. Do not use VIN alone as the universal identity key. There are 94 duplicated VDP URLs. The source `id` field has no duplicates in the master. Use source ID as the primary stable listing identity, with valid VIN and VDP/dealer identity as secondary deduplication signals.

## MatchRV search requirements associated with this import

Motorhome towing capacity must be searchable independently of tow-vehicle/towable-RV logic for Class A, Class B/B+, Class C, and Super C. Shopper minimum tiers are 5,000 / 7,500 / 10,000 / 15,000 / 20,000+ lb while preserving the actual published rating. Known values below the requested minimum fail; missing values remain unverified. A published rating does not by itself establish safe towing.

Also support structured horsepower, chassis/manufacturer, suspension/shock brand and package, Starlink status (`installed`, `factory_option`, `prewired_ready`, `unknown`), and off-grid attributes such as lithium capacity, inverter, solar, AWD/4x4, fresh-water capacity, and ground clearance. Subjective quality requests should use objective evidence and separately labeled review evidence rather than an invented quality score.

Dealer contact must remain two-phase with explicit human approval and must never expose approval tokens.

## Acceptance searches

1. Class A: towing capacity >=10,000 lb, sleeps >=2, length >=35 ft, price $250k-$350k.
2. Super C: horsepower >=450 hp, length >=36 ft, bunk beds, price $200k-$500k, West Coast.
3. Premium Class B: FOX suspension, Starlink requirement, off-grid capability, approximately 19 ft, Mercedes chassis preferred.

This manifest records the exact source-set expectations. The six source files themselves must be transferred to repository/object storage separately before an import can be considered complete.