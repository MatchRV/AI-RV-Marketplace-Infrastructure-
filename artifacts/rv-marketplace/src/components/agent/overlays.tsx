/**
 * Overlays for the agent shopping experience: unit detail with per-fact
 * provenance, side-by-side comparison, and the human-approval card for
 * dealer contact requests.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, X as XIcon, HelpCircle, ShieldCheck, MapPin } from "lucide-react";
import type { UnitMatch } from "@workspace/agent-core";
import { useAgentSession, setFocusedUnit, setComparison, setLeadModalHidden, setLeadPreview } from "@/agent/session";
import { humanDecideLead } from "@/agent/human-actions";
import { FactRow, SourceTag, VerifiedPill, ScoreRing } from "./bits";

const usd = (v: unknown) => `$${Number(v).toLocaleString()}`;
const lbs = (v: unknown) => `${Number(v).toLocaleString()} lbs`;
const gal = (v: unknown) => `${v} gal`;
const ft = (v: unknown) => `${v} ft`;

export function UnitDrawer() {
  const s = useAgentSession();
  const focused = s.focused;
  const match: UnitMatch | undefined = focused
    ? s.results.find((m) => m.unit.id === focused.unit.id)
    : undefined;

  if (!focused) return null;
  const u = focused.unit;

  return (
    <Dialog open onOpenChange={(open) => !open && setFocusedUnit(null, "human")}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto rounded-[1.25rem] p-0">
        <div className="grid md:grid-cols-2">
          <div className="relative bg-[#eef5f4] min-h-56">
            {u.images[0] && (
              <img src={u.images[0]} alt={u.title} className="absolute inset-0 w-full h-full object-cover" />
            )}
          </div>
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="font-display tracking-tight text-xl text-[#161d1d]">{u.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 text-sm text-[#5c6b6b]">
                <MapPin className="w-3.5 h-3.5" /> {u.dealer.name} · {u.dealer.city}, {u.dealer.state}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between mt-3">
              <p className="text-2xl font-bold text-[#161d1d]">
                {u.priceUsd.value != null ? usd(u.priceUsd.value) : "Price unknown"}
              </p>
              {match && (
                <div className="flex items-center gap-2">
                  <ScoreRing score={match.score} />
                  <VerifiedPill status={match.hardStatus} />
                </div>
              )}
            </div>
            <p className="text-[11px] text-[#8a9a9a] mt-1">
              Last verified on the dealer's site: {new Date(u.provenance.lastSeenAt).toLocaleDateString()} (snapshot dataset)
            </p>
          </div>
        </div>

        <div className="px-6 pb-6 grid md:grid-cols-2 gap-x-8">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#8a9a9a] mt-2 mb-1">Specs · every fact shows its source</h4>
            <FactRow label="Length" fact={u.lengthFt} format={ft} />
            <FactRow label="Dry weight" fact={u.dryWeightLbs} format={lbs} />
            <FactRow label="GVWR" fact={u.gvwrLbs} format={lbs} />
            <FactRow label="Hitch weight" fact={u.hitchWeightLbs} format={lbs} />
            <FactRow label="Sleeps" fact={u.sleeps} />
            <FactRow label="Slideouts" fact={u.slideouts} />
            <FactRow label="Fresh water" fact={u.freshWaterGal} format={gal} />
            <FactRow label="Grey water" fact={u.greyWaterGal} format={gal} />
            <FactRow label="Black water" fact={u.blackWaterGal} format={gal} />
          </div>
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#8a9a9a] mt-2 mb-1">Capability</h4>
            <FactRow label="Bunkhouse" fact={u.bunkhouse} />
            <FactRow label="Entry doors" fact={u.entryDoors} />
            <FactRow label="Solar" fact={u.solar} />
            <FactRow label="Lithium battery" fact={u.lithiumBattery} />
            <FactRow label="Generator" fact={u.generator} />
            <FactRow label="Four-season" fact={u.fourSeason} />
            <FactRow label="Outdoor kitchen" fact={u.outdoorKitchen} />
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-[#5c6b6b]">Boondocking score</span>
              <span className="text-sm font-semibold text-[#161d1d]">
                {u.boondocking.score !== null ? `${u.boondocking.score}/100` : "Unknown"}
              </span>
            </div>
            {u.boondocking.knownInputs.length > 0 && (
              <p className="text-[11px] text-[#6b7a7a]">{u.boondocking.knownInputs.join(" · ")}</p>
            )}
            {u.boondocking.missingInputs.length > 0 && (
              <p className="text-[11px] text-[#b45309] mt-1">Missing: {u.boondocking.missingInputs.join(", ")}</p>
            )}
          </div>
        </div>

        {match && (
          <div className="mx-6 mb-6 rounded-xl border border-[#E2E8F0] bg-[#f8fbfb] p-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#8a9a9a] mb-2">
              Why this match — deterministic receipts
            </h4>
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-1">
              <ul className="space-y-1">
                {match.hardChecks.map((h) => (
                  <li key={h.constraint} className="flex items-start gap-1.5 text-xs">
                    {h.status === "pass" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    ) : h.status === "fail" ? (
                      <XIcon className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                    ) : (
                      <HelpCircle className="w-3.5 h-3.5 text-[#b45309] mt-0.5 shrink-0" />
                    )}
                    <span className="text-[#3b4a4a]">
                      {h.constraint} <span className="text-[#8a9a9a]">— {h.actual}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div>
                <ul className="space-y-1">
                  {match.softChecks.map((sc) => (
                    <li key={sc.preference} className="text-xs text-[#3b4a4a]">
                      {sc.satisfied === true ? "✓" : sc.satisfied === false ? "△" : "?"} {sc.preference}
                      <span className="text-[#8a9a9a]"> — {sc.detail}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-[#8a9a9a] mt-2">
                  Score math: {match.scoreBreakdown.map((b) => `${b.points >= 0 ? "+" : ""}${b.points} ${b.label}`).join(" · ")}
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CompareSheet() {
  const s = useAgentSession();
  if (!s.comparison) return null;
  const { comparison } = s.comparison;
  const knownRows = comparison.rows.filter((r) => r.values.some((v) => v !== null));
  const allUnknown = comparison.rows.filter((r) => r.values.every((v) => v === null));

  return (
    <Dialog open onOpenChange={(open) => !open && setComparison(null, "human")}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto rounded-[1.25rem]">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight text-[#161d1d]">Side-by-side — true values only</DialogTitle>
          <DialogDescription className="text-[#5c6b6b] text-sm">
            “Unknown” means the dealer doesn't publish it. MatchRV never fills gaps with guesses.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-[11px] uppercase tracking-wider text-[#8a9a9a] font-bold py-2 pr-3">Spec</th>
                {comparison.titles.map((t, i) => (
                  <th key={`${i}-${t}`} className="text-left text-xs font-semibold text-[#161d1d] py-2 pr-3 min-w-36">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {knownRows.map((row) => (
                <tr key={row.spec} className="border-t border-[#eef2f2]">
                  <td className="py-2 pr-3 text-[#5c6b6b]">{row.spec}{row.unit ? ` (${row.unit})` : ""}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className={`py-2 pr-3 ${v === null ? "text-[#b45309]" : "text-[#161d1d]"}`}>
                      <span className={row.bestIndex === i ? "font-bold text-[#0e7490]" : ""}>
                        {v === null ? "Unknown" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}
                        {row.bestIndex === i && " ◀"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allUnknown.length > 0 && (
          <p className="text-[11px] text-[#b45309] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Not published by any of these dealers: {allUnknown.map((r) => r.spec).join(", ")}. Your agent can
            include these questions in a dealer contact request.
          </p>
        )}
        {comparison.unknownNotes.length > 0 && (
          <p className="text-[11px] text-[#8a9a9a]">{comparison.unknownNotes.join(" · ")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function LeadApprovalModal() {
  const s = useAgentSession();
  const p = s.leadPreview;
  if (!p || p.status === "rejected" || s.leadModalHidden) return null;

  const awaiting = p.status === "awaiting_human_approval";
  const submitted = p.status === "submitted";

  const onOpenChange = (open: boolean) => {
    if (open) return;
    // Closing never counts as a decision: pending previews stay pending
    // (reopen from the results header); finished ones clear.
    if (awaiting) setLeadModalHidden(true);
    else setLeadPreview(null, "human");
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-[1.25rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display tracking-tight text-[#161d1d]">
            <ShieldCheck className="w-5 h-5 text-[#00CED1]" />
            {awaiting ? "Your agent wants to contact a dealership" : submitted ? "Contact request submitted" : "Approved — agent can submit"}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#5c6b6b]">
            {awaiting
              ? "Review exactly what would be sent. Nothing leaves MatchRV until you approve."
              : submitted
                ? "Recorded in MatchRV's lead queue. Demo environment — no real dealership is contacted."
                : "Tell your agent to go ahead, or it will submit on its next turn."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-[#E2E8F0] divide-y divide-[#eef2f2] text-sm">
          <div className="p-3 flex justify-between gap-3"><span className="text-[#8a9a9a]">To</span><span className="font-semibold text-right">{p.dealer.name} · {p.dealer.city}, {p.dealer.state}</span></div>
          <div className="p-3 flex justify-between gap-3"><span className="text-[#8a9a9a]">About</span><span className="font-semibold text-right">{p.unitTitle}{p.unitPrice ? ` — $${p.unitPrice.toLocaleString()}` : ""}</span></div>
          <div className="p-3 flex justify-between gap-3"><span className="text-[#8a9a9a]">From</span><span className="text-right">{p.customer.name} · {p.customer.email}{p.customer.phone ? ` · ${p.customer.phone}` : ""}</span></div>
          <div className="p-3">
            <span className="text-[#8a9a9a] block mb-1">Message</span>
            <p className="text-[#161d1d] leading-relaxed">{p.message}</p>
          </div>
        </div>

        <p className="text-[11px] text-[#8a9a9a]">{p.consent}</p>

        {awaiting && (
          <div className="flex gap-3">
            <button
              onClick={() => void humanDecideLead(p, "approve")}
              className="flex-1 rounded-xl bg-[#0B1117] text-white font-semibold py-3 hover:bg-[#1a2530] transition-colors"
            >
              Approve &amp; allow send
            </button>
            <button
              onClick={() => void humanDecideLead(p, "reject")}
              className="flex-1 rounded-xl border border-[#E2E8F0] text-[#5c6b6b] font-semibold py-3 hover:bg-[#f4fbfa] transition-colors"
            >
              Decline
            </button>
          </div>
        )}
        {submitted && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
            Receipt: lead #{String(p.submittedLeadId)} · {p.decidedAt ? `approved ${new Date(p.decidedAt).toLocaleTimeString()}` : ""}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
