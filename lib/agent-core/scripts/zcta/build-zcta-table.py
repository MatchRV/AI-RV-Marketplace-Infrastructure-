#!/usr/bin/env python3
"""Build lib/agent-core/data/zcta-centroids.txt.gz from the US Census Bureau
ZCTA Gazetteer (public domain, US Government work).

Source: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_zcta_national.zip
Usage:  python3 build-zcta-table.py 2025_Gaz_zcta_national.txt

Output format (one ZCTA per line, sorted, no header):
    ZZZZZ<TAB>lat*1e4<TAB>lng*1e4     (INTPTLAT/INTPTLONG, internal point)
"""
import gzip, sys, os
src = sys.argv[1]
rows = []
with open(src, encoding="utf-8") as f:
    header = [h.strip() for h in f.readline().split("|")]
    gi, la, lo = header.index("GEOID"), header.index("INTPTLAT"), header.index("INTPTLONG")
    for line in f:
        p = [x.strip() for x in line.split("|")]
        if len(p) <= lo or not p[gi].isdigit() or len(p[gi]) != 5: continue
        rows.append((p[gi], round(float(p[la]) * 1e4), round(float(p[lo]) * 1e4)))
rows.sort()
out = os.path.join(os.path.dirname(__file__), "../../data/zcta-centroids.txt.gz")
with gzip.GzipFile(out, "wb", compresslevel=9, mtime=0) as g:
    g.write("".join(f"{z}\t{a}\t{b}\n" for z, a, b in rows).encode())
print(f"{len(rows)} ZCTAs -> {os.path.normpath(out)} ({os.path.getsize(out)} bytes)")
