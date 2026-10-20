export function InventoryCoverage({ compact = false }: { compact?: boolean }) {
  return <aside className={`inventory-coverage ${compact ? "compact" : ""}`} aria-label="MatchRV inventory network coverage">
    <p className="inventory-coverage-label">MatchRV inventory network</p>
    <p className="inventory-coverage-counts"><span><strong>128,174</strong> RVs</span><span><strong>517</strong> dealers</span><span><strong>841</strong> stores</span><span><strong>49</strong> states</span></p>
    <p className="inventory-coverage-date">As of October 19, 2026 · Inventory and availability can change.</p>
  </aside>;
}
