import { useEffect, useState } from "react";
import { type InventoryType } from "@/config/site";

type Total = { value: number | null; live: boolean };

type InventoryPayload = {
  total?: unknown;
  byType?: Record<string, unknown>;
};

const cache = new Map<string, Promise<number>>();

function usableCount(raw: unknown): number | null {
  const total = Number(raw);
  if (!Number.isFinite(total) || total < 0) return null;
  return total;
}

/**
 * Counts injected into the document at request time by the API server.
 * Absent during prerender and when the listings API could not be read.
 */
function readInjected(type?: InventoryType): number | null {
  if (typeof document === "undefined") return null;
  const node = document.getElementById("matchrv-inventory-counts");
  if (!node?.textContent) return null;
  try {
    const payload = JSON.parse(node.textContent) as InventoryPayload;
    return usableCount(type ? payload.byType?.[type] : payload.total);
  } catch {
    return null;
  }
}

function fetchTotal(type?: InventoryType): Promise<number> {
  const url = `/api/listings?limit=1${type ? `&type=${encodeURIComponent(type)}` : ""}`;
  let request = cache.get(url);
  if (!request) {
    request = fetch(url, { headers: { Accept: "application/json" } })
      .then(response => {
        if (!response.ok) throw new Error(`listings total: HTTP ${response.status}`);
        return response.json();
      })
      .then(payload => {
        const total = usableCount(payload?.total);
        if (total == null) throw new Error("listings total: no usable total");
        return total;
      });
    // A failed request may be retried by the next page that asks.
    request.catch(() => cache.delete(url));
    cache.set(url, request);
  }
  return request;
}

/**
 * The number of RVs in the inventory network, overall or for one RV type.
 * The number is the `total` from GET /api/listings (with `type` when set).
 * It starts at the server-injected count when this response included one,
 * otherwise blank — never a baked-in inventory size — then refreshes from
 * the API. A failed refresh keeps the injected count, or stays blank.
 */
export function useInventoryTotal(type?: InventoryType): Total {
  const [total, setTotal] = useState<Total>(() => {
    const value = readInjected(type);
    return { value, live: value != null };
  });
  useEffect(() => {
    let active = true;
    fetchTotal(type)
      .then(value => {
        if (!active) return;
        setTotal(prev => (prev.live && prev.value === value ? prev : { value, live: true }));
      })
      .catch(() => { /* keep the injected count, or the blank placeholder */ });
    return () => { active = false; };
  }, [type]);
  return total;
}
