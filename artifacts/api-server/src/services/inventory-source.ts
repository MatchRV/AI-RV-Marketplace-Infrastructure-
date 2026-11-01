/**
 * Where inventory is served from.
 *
 *   INVENTORY_SOURCE=snapshot (default) — the committed snapshot, parsed into
 *     memory at boot (the original path; ~1.8 GB RSS at 129k units).
 *   INVENTORY_SOURCE=supabase — Postgres (inventory schema, loaded by
 *     `pnpm --filter @workspace/api-server run load-inventory-db`). Needs
 *     INVENTORY_DATABASE_URL. The snapshot is never parsed in this mode.
 *
 * Flip back to snapshot (and restart) to roll back; nothing else changes.
 */
export type InventorySourceKind = "snapshot" | "supabase";

export function inventorySource(): InventorySourceKind {
  return (process.env.INVENTORY_SOURCE ?? "").trim().toLowerCase() === "supabase" ? "supabase" : "snapshot";
}

export const usingInventoryDb = () => inventorySource() === "supabase";
