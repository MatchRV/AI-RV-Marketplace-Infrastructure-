import { useState, type ReactNode } from "react";
import { ArrowUpRight, Bell, X } from "lucide-react";
import { dealerOutHref, looksLikeEmail, markBeforeYouGoSeen, savePriceAlertBeforeLeaving, shouldOfferBeforeYouGo, type HandoffSurface } from "@/lib/dealer-handoff";

/**
 * The small, secondary link to a dealer's own page. Goes through MatchRV's tagged redirect. The first time in a
 * tab it opens a short "before you go" step: an optional price-drop alert on this RV, a way back to MatchRV's own
 * "Check availability" form, and a plain "go to the dealer's site" link. Nothing there is required.
 */
export function DealerSiteLink({
  unitId, dealerId, surface, priceUsd, dealerName, onCheckAvailability, children, className,
}: {
  unitId?: string | null;
  dealerId?: string | null;
  surface: HandoffSurface;
  priceUsd?: number | null;
  dealerName?: string | null;
  /** Opens MatchRV's own inquiry form. When given, the step offers it first. */
  onCheckAvailability?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const href = dealerOutHref({ unitId, dealerId }, surface);
  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        data-testid="dealer-site-link"
        className={className ?? "inline-flex items-center gap-1 text-xs text-slate-500 underline underline-offset-4 hover:text-slate-700"}
        onClick={(e) => {
          if (!unitId || !shouldOfferBeforeYouGo()) return;
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children} <ArrowUpRight size={12} aria-hidden="true" />
      </a>
      {open && unitId && (
        <BeforeYouGo
          unitId={unitId}
          surface={surface}
          priceUsd={priceUsd}
          dealerName={dealerName}
          onCheckAvailability={onCheckAvailability ? () => { markBeforeYouGoSeen(); setOpen(false); onCheckAvailability(); } : undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BeforeYouGo({ unitId, surface, priceUsd, dealerName, onCheckAvailability, onClose }: {
  unitId: string; surface: HandoffSurface; priceUsd?: number | null; dealerName?: string | null;
  onCheckAvailability?: () => void; onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const valid = looksLikeEmail(email);
  const who = dealerName || "the dealer";

  const leave = (alertSaved: boolean) => {
    markBeforeYouGoSeen();
    window.open(dealerOutHref({ unitId }, surface, { alertSaved }), "_blank", "noopener");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Before you go to the dealer's site" style={{ background: "rgba(11,31,58,.55)" }}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl" data-testid="before-you-go">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[#0B1117]">Before you go</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {onCheckAvailability && (
          <>
            <p className="mt-1 text-sm text-slate-600">MatchRV can ask {who} for you. Your message goes straight to them, and you keep a record of it here.</p>
            <button type="button" onClick={onCheckAvailability} className="mt-3 w-full rounded-full bg-[#0B1117] py-3 text-sm font-extrabold text-[#65E7DF]">Ask the dealer through MatchRV</button>
          </>
        )}
        <form
          className="mt-4 rounded-2xl border border-slate-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            // Fire and forget (keepalive): the dealer page must open inside this tap or browsers block the new tab.
            void savePriceAlertBeforeLeaving({ email, unitId, priceUsd, surface });
            leave(true);
          }}
        >
          <label htmlFor="byg-email" className="flex items-center gap-2 text-sm font-bold text-[#0B1117]"><Bell size={15} aria-hidden="true" /> Get a price-drop alert on this RV (optional)</label>
          <input id="byg-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-base" />
          <button type="submit" disabled={!valid} className="mt-2 w-full rounded-full bg-[#00CED1] py-2.5 text-sm font-extrabold text-[#0B1117] disabled:opacity-50">
            Alert me, then open the dealer's site
          </button>
          <p className="mt-2 text-[0.7rem] text-slate-500">Optional. Skip it and the dealer's site still opens.</p>
        </form>
        <button type="button" onClick={() => leave(false)} className="mt-3 w-full text-center text-sm font-semibold text-slate-600 underline underline-offset-4" data-testid="before-you-go-skip">
          No thanks, go to the dealer's site
        </button>
      </div>
    </div>
  );
}
