import { useEffect, useState } from "react";
import { INVENTORY, type InventoryType } from "@/config/site";

type Total = { value: number; live: boolean };

const cache = new Map<string, Promise<number>>();

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
        const total = Number(payload?.total);
        if (!Number.isFinite(total) || total < 0) throw new Error("listings total: no usable total");
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
 * Starts at the configured fallback so the page is right before the request
 * returns (and in the prerendered HTML), then switches to the live total.
 */
export function useInventoryTotal(type?: InventoryType): Total {
  const [total, setTotal] = useState<Total>({ value: type ? INVENTORY.byType[type] : INVENTORY.rvs, live: false });
  useEffect(() => {
    let active = true;
    fetchTotal(type)
      .then(value => { if (active) setTotal({ value, live: true }); })
      .catch(() => { /* keep the fallback */ });
    return () => { active = false; };
  }, [type]);
  return total;
}
