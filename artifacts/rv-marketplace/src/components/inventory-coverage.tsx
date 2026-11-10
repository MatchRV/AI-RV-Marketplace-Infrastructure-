import {
  INVENTORY,
  RV_COUNT_LIVE_STATUS,
  RV_COUNT_PLACEHOLDER,
  RV_COUNT_UNAVAILABLE_STATUS,
  formatCount,
  type InventoryType,
} from "@/config/site";
import { useInventoryTotal } from "@/hooks/use-inventory-total";

/**
 * Placeholder markup is rewritten at request time by
 * artifacts/api-server/src/lib/live-inventory.ts. Keep the two in sync:
 * `<dd data-rv-count="total">—</dd>` and
 * `<strong data-rv-count="{type}">—</strong>`.
 */
function RvCount({ value }: { value: number | null }) {
  if (value == null) return <dd data-rv-count="total">{RV_COUNT_PLACEHOLDER}</dd>;
  return <dd data-rv-count="total">{formatCount(value)}</dd>;
}

/** Network size: RVs (live listings total), plus dated dealer, store, and state coverage. */
export function InventoryCoverage() {
  const rvs = useInventoryTotal();
  const coverage: Array<[label: string, value: number]> = [
    ["dealers", INVENTORY.dealers],
    ["stores", INVENTORY.stores],
    ["states", INVENTORY.states],
  ];
  return <div className="stats" data-reveal aria-label="MatchRV inventory network coverage">
    <p className="stats__label">MatchRV inventory network</p>
    <dl className="stats__list">
      <div><RvCount value={rvs.value}/><dt>RVs</dt></div>
      {coverage.map(([label, value]) => <div key={label}><dd data-count={value}>{formatCount(value)}</dd><dt>{label}</dt></div>)}
    </dl>
    <p className="fine">
      <span data-rv-count-status="total">{rvs.live ? RV_COUNT_LIVE_STATUS : RV_COUNT_UNAVAILABLE_STATUS}</span>
      {" "}Dealer, store, and state counts as of {INVENTORY.networkAsOf}. Inventory and availability can change.
    </p>
  </div>;
}

/** Live count of one RV type, from GET /api/listings?type=. */
export function TypeCount({ type }: { type: InventoryType }) {
  const { value } = useInventoryTotal(type);
  if (value == null) return <strong data-rv-count={type}>{RV_COUNT_PLACEHOLDER}</strong>;
  return <strong data-rv-count={type}>{formatCount(value)}</strong>;
}
