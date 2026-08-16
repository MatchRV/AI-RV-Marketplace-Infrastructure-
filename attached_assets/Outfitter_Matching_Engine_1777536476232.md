# Outfitter Matching Engine

> **Status:** Fix designed 2026-04-26. Needs to be deployed to Replit.
> **File:** `artifacts/api-server/src/routes/outfitter.ts`
> **Fixed copy:** `MatchRV/outfitter-fixed.ts` (local)

## The Bug (Critical)

The original matching engine collected detailed buyer info through 8 conversation steps (Golden Ticket methodology) but **only filtered on 3 fields** when querying the database:

1. `rvType` (exact match on type)
2. `maxBudget` (price ceiling)
3. `minBudget` (price floor)

**Everything else was thrown away:**
- campingStyle (boondocking, full hookup, mixed)
- useCase (weekends, full-time, seasonal)
- activities
- travelers / sleeps
- towVehicle
- maxLength / minLength
- mustHaves

Result: users got RVs that were the wrong type, wrong budget, wrong camping style.

## The Fix (Three Layers)

### Layer 1: Full SQL Filtering (`buildListingFilters`)

Hard filters applied to the database query:

| Profile Field | SQL Filter | Why |
|--------------|------------|-----|
| `rvType` | `rv_type = ?` | Must match requested type |
| `maxBudget` | `COALESCE(sale_price, price) <= ?` | NEVER exceed budget |
| `minBudget` | `COALESCE(sale_price, price) >= ?` | Floor if specified |
| `travelers` | `sleeps >= ?` | Must fit the travel party |
| `maxLength` | `length <= ?` | Size constraint |
| `minLength` | `length >= ?` | Size constraint |
| `towVehicle` | `COALESCE(gvwr, dry_weight) <= [tow capacity]` | Can't tow what your truck can't handle |
| `condition` | `condition = 'new'` or `'used'` | If preference stated |
| — | `inventory_status = 'available'` | Always applied |

Tow capacity is estimated from a lookup table of common trucks/SUVs (F-150, Ram 1500, Tundra, Tacoma, etc.).

**Pulls 15 candidates** (not 3) to give the AI options.

### Layer 2: AI Re-Ranking (`rerankWithAI`)

A second Claude call receives:
- The full buyer profile (all fields)
- 15 candidate listings (with specs, features, descriptions)

Claude selects the **best 3** based on ranked priorities:

1. **BUDGET** — non-negotiable ceiling
2. **RV TYPE** — must match
3. **CAMPING STYLE** — boondocking needs generator + big fresh water tank; full hookup needs slideouts + washer/dryer prep
4. **USE CASE** — full-timers need durability/storage; weekenders need easy setup
5. **TRAVELERS** — sleeps count, bunkhouse for kids
6. **TOW VEHICLE** — GVWR within capacity, prefer lighter if borderline
7. **ACTIVITIES** — toy hauler for ATVs, outdoor kitchen for tailgaters, pet-friendly

### Layer 3: Personalized Descriptions

Each recommendation includes:
- `whyMatch` — 2-3 sentence explanation referencing the buyer's SPECIFIC needs
- `matchScore` — 0-100 confidence score

The UI shows:
- "Best Match" / "Runner Up" / "Great Option" badges
- Match score percentage
- The personalized description
- Sleeps count and length for quick comparison

## Fallback

If the AI re-ranking call fails (parse error, timeout), the system falls back to returning the first 3 SQL results without descriptions. The user still gets filtered results — just without the personalization.

## Tow Capacity Lookup

| Vehicle | Tow Capacity (lbs) |
|---------|-------------------|
| F-150 | 13,000 |
| F-250 | 20,000 |
| F-350 | 37,000 |
| Ram 1500 | 12,750 |
| Ram 2500 | 20,000 |
| Ram 3500 | 37,090 |
| Silverado 1500 | 13,300 |
| Tundra | 12,000 |
| Tacoma | 6,800 |
| 4Runner | 5,000 |
| Suburban | 8,300 |
| Tahoe | 8,400 |
| Expedition | 9,300 |
| Durango | 8,700 |

> **Note:** These are max capacities. Actual tow rating varies by trim, engine, and packages. A future improvement could ask for the specific year/trim or look up exact specs via an API.
