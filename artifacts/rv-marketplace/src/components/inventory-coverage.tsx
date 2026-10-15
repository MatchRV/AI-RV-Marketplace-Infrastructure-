export function InventoryCoverage({ compact = false }: { compact?: boolean }) {
  return <aside className={`inventory-coverage ${compact ? "compact" : ""}`} aria-label="MatchRV inventory network coverage">
    <p className="inventory-coverage-label">MatchRV inventory network</p>
    <p className="inventory-coverage-counts"><span><strong>84,117</strong> RVs</span><span><strong>312</strong> dealerships</span><span><strong>48</strong> states</span></p>
    <p className="inventory-coverage-date">As of October 14, 2026 · Inventory and availability can change.</p>
  </aside>;
}
