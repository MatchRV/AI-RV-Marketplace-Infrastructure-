/**
 * Per-dealer inventory status for dealer-facing pages (e.g. /browse/:slug).
 * "Searchable" means the unit passes the same screen as MCP search (screenMcpInventory:
 * stale-listing, price-floor and category rules). Deliberately returns no counts: the page only needs to know whether the
 * dealer currently has searchable units, or whether every unit is held while
 * its details are re-confirmed (so the page can show "inventory updating"
 * instead of an empty state).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CanonicalUnit } from "@workspace/agent-core";
import { getInventory } from "./agent-inventory";
import { screenMcpInventory } from "./mcp-inventory-quality";

export type DealerInventoryStatus = "listed" | "updating" | "not_listed";

export function normalizeDealerDomain(input: string): string | null {
  const raw = (input || "").trim().toLowerCase();
  if (!raw || raw.length > 253) return null;
  let host = raw;
  try { host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`).hostname; } catch { return null; }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** listed: >=1 searchable unit. updating: dealer is in our data but every unit is held. not_listed: unknown dealer. */
export function dealerInventoryStatus(domain: string, units: readonly CanonicalUnit[], heldDomains: ReadonlySet<string>, ready: (u: CanonicalUnit) => boolean): DealerInventoryStatus {
  let known = heldDomains.has(domain);
  for (const u of units) {
    if (normalizeDealerDomain(u.provenance?.dealerDomain ?? "") !== domain) continue;
    known = true;
    if (ready(u)) return "listed";
  }
  return known ? "updating" : "not_listed";
}

function findHeldFile(): string | null {
  const here = import.meta.dirname;
  for (const rel of ["../../../../lib/agent-core/data/held-dealer-domains.json", "../../lib/agent-core/data/held-dealer-domains.json", "../../../lib/agent-core/data/held-dealer-domains.json"]) {
    const p = resolve(here, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

let heldCache: Set<string> | null = null;
export function heldDealerDomains(): Set<string> {
  if (heldCache) return heldCache;
  const out = new Set<string>();
  const file = findHeldFile();
  if (file) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { domains?: unknown };
      for (const d of Array.isArray(parsed.domains) ? parsed.domains : []) { const n = typeof d === "string" ? normalizeDealerDomain(d) : null; if (n) out.add(n); }
    } catch { /* a malformed file means no held dealers, never a crash */ }
  }
  heldCache = out;
  return out;
}

let searchableIds: Set<string> | null = null;
export function liveDealerInventoryStatus(domain: string): DealerInventoryStatus {
  const inv = getInventory();
  searchableIds ??= new Set(screenMcpInventory(inv).units.map(u => u.id));
  const ids = searchableIds;
  return dealerInventoryStatus(domain, inv.units, heldDealerDomains(), u => ids.has(u.id));
}
