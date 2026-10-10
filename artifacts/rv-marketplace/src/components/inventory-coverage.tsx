export function InventoryCoverage({ compact = false }: { compact?: boolean }) {
  return <aside className={`inventory-coverage ${compact ? "compact" : ""}`} aria-label="MatchRV inventory network coverage">
    <p className="inventory-coverage-label">MatchRV inventory network</p>
    <p className="inventory-coverage-counts"><span><strong>43,247</strong> RVs</span><span><strong>297</strong> dealers</span><span><strong>33</strong> states</span></p>
    <p className="inventory-coverage-date">As of October 10, 2026 · Inventory and availability can change.</p>
  </aside>;
}
