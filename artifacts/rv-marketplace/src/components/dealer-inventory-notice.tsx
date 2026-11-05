/**
 * Calm "inventory updating" state for dealer pages when every one of the
 * dealer's units is held out of search (e.g. prices being re-confirmed).
 * Generic for any dealer; states no counts and makes no claims about why.
 */
import { RefreshCw } from "lucide-react";

export type DealerInventoryStatus = "listed" | "updating" | "not_listed";

/** Dealer website host used to ask the API for inventory status (www. stripped). */
export function dealerDomainFromReport(report: { website?: string; inventory_url?: string }): string | null {
  const raw = report.website || report.inventory_url || "";
  if (!raw) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Display-name overrides for this card only, keyed by dealer host. The report JSON is left untouched;
 * these match the name the rest of the site uses (e.g. the report-examples section).
 */
export const DEALER_DISPLAY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  "tacomarv.com": "Tacoma RV Center",
};

export function dealerDisplayName(dealer: string, domain?: string | null): string {
  return (domain && DEALER_DISPLAY_NAME_OVERRIDES[domain]) || dealer;
}

export function inventoryUpdatingCopy(dealer: string): { title: string; body: string } {
  const name = dealer.trim() || "This dealership";
  return {
    title: "Inventory updating",
    body: `${name}${name.endsWith("s") ? "'" : "'s"} listings are being refreshed. Units show in MatchRV search again once their listing details are confirmed.`,
  };
}

export function DealerInventoryNotice({ dealer, domain, status }: { dealer: string; domain?: string | null; status: DealerInventoryStatus | null }) {
  if (status !== "updating") return null;
  const copy = inventoryUpdatingCopy(dealerDisplayName(dealer, domain));
  return (
    <div
      role="status"
      data-testid="dealer-inventory-updating"
      className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 flex items-start gap-3 shadow-sm"
    >
      <RefreshCw className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-display font-bold text-[#0B1117]">{copy.title}</p>
        <p className="text-sm text-slate-600 leading-relaxed mt-0.5">{copy.body}</p>
      </div>
    </div>
  );
}
