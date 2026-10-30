# zcta-centroids.txt.gz: US ZIP (ZCTA) centroids

- **Source:** U.S. Census Bureau, 2025 Gazetteer Files, ZIP Code Tabulation Areas (ZCTAs), national file
  <https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_zcta_national.zip>
  (documentation: <https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html>).
- **License:** public domain. Works of the U.S. Government are not subject to copyright (17 U.S.C. § 105).
- **Fields kept:** GEOID (5-digit ZCTA), INTPTLAT, INTPTLONG (internal point), rounded to 4 decimals (~11 m).
- **Format:** gzip text, one ZCTA per line, sorted: `ZZZZZ<TAB>lat×1e4<TAB>lng×1e4`. 33,791 rows, ~285 KB.
- **Rebuild:** `python3 lib/agent-core/scripts/zcta/build-zcta-table.py 2025_Gaz_zcta_national.txt`
- **Caveat:** ZCTAs approximate USPS ZIP delivery areas. PO-box-only and some business ZIPs have no ZCTA, so
  search returns a clear "unknown ZIP" error that suggests a city instead.
- **Used by:** `artifacts/api-server/src/services/zip-centroids.ts` (lazy-loaded on the first ZIP search),
  registered into `resolveSearchPlace` (agent-core `geo.ts`). Dealer geocoding never uses ZIPs.
