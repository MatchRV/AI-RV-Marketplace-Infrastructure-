import { INVENTORY, formatCount, type InventoryType } from "@/config/site";
import { useInventoryTotal } from "@/hooks/use-inventory-total";

/** Network size: RVs (live), dealers, stores, states. */
export function InventoryCoverage() {
  const rvs = useInventoryTotal();
  const counts: Array<[label: string, value: number]> = [
    ["RVs", rvs.value],
    ["dealers", INVENTORY.dealers],
    ["stores", INVENTORY.stores],
    ["states", INVENTORY.states],
  ];
  return <div className="stats" data-reveal aria-label="MatchRV inventory network coverage">
    <p className="stats__label">MatchRV inventory network</p>
    <dl className="stats__list">
      {counts.map(([label, value]) => <div key={label}><dd data-count={value}>{formatCount(value)}</dd><dt>{label}</dt></div>)}
    </dl>
    <p className="fine">{rvs.live ? "RV count is live from MatchRV inventory." : `RV count as of ${INVENTORY.rvsAsOf}.`} Dealer, store, and state counts as of {INVENTORY.networkAsOf}. Inventory and availability can change.</p>
  </div>;
}

/** Live count of one RV type, for the swipe preview cards. */
export function TypeCount({ type }: { type: InventoryType }) {
  return <strong>{formatCount(useInventoryTotal(type).value)}</strong>;
}
