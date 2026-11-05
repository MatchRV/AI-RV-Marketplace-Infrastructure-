/**
 * US ZIP → centroid lookup for shopper search locations ("98402", "Tacoma, WA 98402", "ZIP 98444").
 *
 * Data: lib/agent-core/data/zcta-centroids.txt.gz, built by lib/agent-core/scripts/zcta/build-zcta-table.py
 * from the US Census Bureau 2025 ZCTA Gazetteer (public domain; see lib/agent-core/data/ZCTA-SOURCE.md).
 * Coordinates are each ZCTA's internal point. ZCTAs approximate USPS ZIP areas; PO-box-only ZIPs have none.
 *
 * Memory: nothing is read until the first ZIP lookup. The table is then held as three Int32Arrays
 * (~33.8k ZCTAs × 12 bytes ≈ 400 KB); the decompressed text is dropped after parsing.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { registerZipCentroids, type LatLng } from "@workspace/agent-core";

interface ZipTable { zips: Int32Array; lat: Int32Array; lng: Int32Array }
let table: ZipTable | null | undefined;

function findTable(): string | null {
  const here = import.meta.dirname;
  const candidates = [
    resolve(here, "../../../../lib/agent-core/data/zcta-centroids.txt.gz"), // src/services
    resolve(here, "../../lib/agent-core/data/zcta-centroids.txt.gz"), // dist bundle
    resolve(here, "../../../lib/agent-core/data/zcta-centroids.txt.gz"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Parse "ZZZZZ\tlatE4\tlngE4\n" lines (sorted by ZIP) into typed arrays. Exported for tests. */
export function parseZipTable(text: string): ZipTable {
  const lines = text.split("\n").filter(Boolean);
  const zips = new Int32Array(lines.length), lat = new Int32Array(lines.length), lng = new Int32Array(lines.length);
  lines.forEach((line, i) => {
    const [z, a, b] = line.split("\t");
    zips[i] = Number(z); lat[i] = Number(a); lng[i] = Number(b);
  });
  return { zips, lat, lng };
}

function load(): ZipTable | null {
  const path = findTable();
  if (!path) {
    console.warn("[geo] ZIP table zcta-centroids.txt.gz not found; ZIP locations will be rejected");
    return null;
  }
  return parseZipTable(gunzipSync(readFileSync(path)).toString("utf-8"));
}

export function lookupZipCentroid(zip5: string): LatLng | null {
  if (!/^\d{5}$/.test(zip5)) return null;
  if (table === undefined) table = load();
  if (!table) return null;
  const want = Number(zip5);
  let lo = 0, hi = table.zips.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, z = table.zips[mid];
    if (z === want) return { lat: table.lat[mid] / 1e4, lng: table.lng[mid] / 1e4 };
    if (z < want) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}

/**
 * Nearest ZCTA to a coordinate (for a shopper's "near me" on /swipe). Linear scan of ~33.8k points;
 * the coordinate is used only to pick the ZIP and is never stored.
 */
export function nearestZip(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (table === undefined) table = load();
  if (!table) return null;
  const la = lat * 1e4, lo = lng * 1e4, k = Math.cos((lat * Math.PI) / 180) ** 2;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < table.zips.length; i++) {
    const dy = table.lat[i] - la, dx = table.lng[i] - lo;
    const d = dy * dy + k * dx * dx;
    if (d < bestD) { bestD = d; best = i; }
  }
  // More than ~1.5 degrees from any US ZCTA means the shopper isn't in the covered area.
  if (best < 0 || bestD > (1.5e4) ** 2) return null;
  return String(table.zips[best]).padStart(5, "0");
}

/** True once the table has been read (for memory diagnostics). */
export function zipTableLoaded(): boolean {
  return table !== undefined && table !== null;
}

registerZipCentroids(lookupZipCentroid);
