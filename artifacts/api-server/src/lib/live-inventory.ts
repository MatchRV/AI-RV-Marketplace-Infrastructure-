/**
 * Live RV counts for the marketing site and /llms.txt.
 *
 * The number is always the `total` from the same query as GET /api/listings
 * (photo-bearing rows; `type` narrows byType). Nothing here is a stored
 * inventory size. When the query fails, callers omit the number.
 *
 * Placeholder strings must match the React markup in
 * artifacts/rv-marketplace/src/components/inventory-coverage.tsx.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { db, listingsTable, DB_MODE } from "@workspace/db";
import { sql } from "drizzle-orm";
import { snapshotInventoryCounts, SNAPSHOT_COUNT_TYPES, type SnapshotInventoryCounts } from "../services/snapshot-listings";

export type InventoryCounts = SnapshotInventoryCounts;

export const RV_COUNT_PLACEHOLDER = "\u2014";
export const RV_COUNT_LIVE_STATUS = "RV count is live from MatchRV inventory.";
export const RV_COUNT_UNAVAILABLE_STATUS = "Live RV count is unavailable right now.";
export const LLMS_COUNT_TOKEN = "{{LIVE_RV_COUNT}}";

const numberFormat = new Intl.NumberFormat("en-US");
const formatCount = (value: number) => numberFormat.format(value);

const TTL_MS = 30_000;
let cache: { at: number; counts: InventoryCounts } | null = null;
let pending: Promise<InventoryCounts | null> | null = null;

async function loadFromDatabase(): Promise<InventoryCounts> {
  // Same photo gate as GET /api/listings in database mode. A fresh SQL
  // fragment per query so the two statements do not share one object.
  const photoGate = () => sql`${listingsTable.images} IS NOT NULL AND jsonb_array_length(${listingsTable.images}) > 0`;
  const [grouped, totals] = await Promise.all([
    db
      .select({ type: listingsTable.type, count: sql<number>`count(*)::int` })
      .from(listingsTable)
      .where(photoGate())
      .groupBy(listingsTable.type),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(photoGate()),
  ]);
  const byType = Object.fromEntries(SNAPSHOT_COUNT_TYPES.map((type) => [type, 0])) as InventoryCounts["byType"];
  for (const row of grouped) {
    const type = String(row.type ?? "");
    if (Object.prototype.hasOwnProperty.call(byType, type)) {
      byType[type as keyof typeof byType] = Number(row.count);
    }
  }
  return { total: Number(totals[0]?.count ?? 0), byType };
}

async function loadInventoryCounts(): Promise<InventoryCounts> {
  if (DB_MODE === "none") return snapshotInventoryCounts();
  return loadFromDatabase();
}

/** Cached listings totals. Null when the inventory query fails. */
export function getLiveInventoryCounts(): Promise<InventoryCounts | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.counts);
  if (!pending) {
    pending = loadInventoryCounts()
      .then((counts) => {
        cache = { at: Date.now(), counts };
        return counts;
      })
      .catch((err) => {
        // Embedded tests import the app before ensureDbReady(). That throws
        // DatabaseUnavailableError; omit the count instead of a stack trace.
        if (err instanceof Error && err.name === "DatabaseUnavailableError") {
          console.warn("[inventory-counts] database unavailable; omitting the RV count");
        } else {
          console.error("[inventory-counts] load failed:", err);
        }
        return cache?.counts ?? null;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** For tests that need a clean cache. */
export function clearLiveInventoryCache(): void {
  cache = null;
  pending = null;
}

/**
 * Insert the counts the browser hook reads, and replace prerender placeholders
 * so a no-JS response shows the same number. A null count leaves the
 * placeholder and does not invent a number.
 */
export function applyInventoryCounts(html: string, counts: InventoryCounts | null): string {
  const stripped = html.replace(/<script type="application\/json" id="matchrv-inventory-counts">[\s\S]*?<\/script>\n?/, "");
  if (!counts) return stripped;
  const payload = JSON.stringify({ total: counts.total, byType: counts.byType });
  const tag = `<script type="application/json" id="matchrv-inventory-counts">${payload}</script>`;
  let out = stripped.includes("</head>")
    ? stripped.replace("</head>", `${tag}\n  </head>`)
    : `${tag}${stripped}`;
  out = out.replaceAll(
    `<dd data-rv-count="total">${RV_COUNT_PLACEHOLDER}</dd>`,
    `<dd data-rv-count="total">${formatCount(counts.total)}</dd>`,
  );
  out = out.replaceAll(
    `<span data-rv-count-status="total">${RV_COUNT_UNAVAILABLE_STATUS}</span>`,
    `<span data-rv-count-status="total">${RV_COUNT_LIVE_STATUS}</span>`,
  );
  for (const type of SNAPSHOT_COUNT_TYPES) {
    out = out.replaceAll(
      `<strong data-rv-count="${type}">${RV_COUNT_PLACEHOLDER}</strong>`,
      `<strong data-rv-count="${type}">${formatCount(counts.byType[type])}</strong>`,
    );
  }
  return out;
}

export async function withLiveInventory(html: string): Promise<string> {
  try {
    return applyInventoryCounts(html, await getLiveInventoryCounts());
  } catch (err) {
    console.error("[inventory-counts] decorate failed:", err);
    return applyInventoryCounts(html, null);
  }
}

export function fillLlmsInventoryCount(template: string, counts: InventoryCounts | null): string {
  const replacement = counts
    ? `${formatCount(counts.total)} RVs`
    : "the live total from GET /api/listings (unavailable for this response)";
  return template.replaceAll(LLMS_COUNT_TOKEN, replacement);
}

function llmsTemplatePath(): string | null {
  const here = import.meta.dirname;
  // Prefer the source template so a stale dist copy cannot keep an old count.
  // Two layouts: tsx/vitest runs this file from src/lib (three levels up to
  // artifacts); the production bundle's __dirname is api-server/dist (two).
  const candidates = [
    resolve(here, "../../../rv-marketplace/public/llms.txt"),
    resolve(here, "../../rv-marketplace/public/llms.txt"),
    resolve(here, "../../../rv-marketplace/dist/public/llms.txt"),
    resolve(here, "../../rv-marketplace/dist/public/llms.txt"),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

export async function renderLiveLlmsTxt(): Promise<string | null> {
  const path = llmsTemplatePath();
  if (!path) return null;
  const template = readFileSync(path, "utf8");
  const counts = await getLiveInventoryCounts();
  return fillLlmsInventoryCount(template, counts);
}
