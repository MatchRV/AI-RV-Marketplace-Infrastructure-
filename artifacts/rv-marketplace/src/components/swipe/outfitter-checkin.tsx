import { useState } from "react";
import { Compass } from "lucide-react";
import { RV_TYPE_LABELS, type CheckInEdits, type RvType } from "@/lib/swipe-deck";
import { NAVY, TEAL, LINE } from "./tokens";

const BUDGETS = [25_000, 50_000, 75_000, 100_000, 150_000, 250_000];
const RADII = [25, 50, 100, 150, 250, 500];
const SLEEPS = [2, 4, 6, 8];

/** "RV Outfitter" check-in: quick edits that re-rank the rest of the deck, or keep swiping. */
export function OutfitterCheckIn({ initial, busy, onApply, onDismiss }: {
  initial: CheckInEdits;
  busy: boolean;
  onApply: (e: CheckInEdits) => void;
  onDismiss: () => void;
}) {
  const [e, setE] = useState<CheckInEdits>(initial);
  const field = "w-full rounded-xl px-3 py-2.5 bg-white text-base";
  const lab = "block text-xs font-bold uppercase tracking-wider mb-1";
  const changed = JSON.stringify(e) !== JSON.stringify(initial);
  return (
    <div className="rounded-3xl bg-white p-5" role="dialog" aria-label="RV Outfitter check-in" data-testid="outfitter-checkin" style={{ border: `1.5px solid ${TEAL}`, boxShadow: "0 10px 30px rgba(11,31,58,.12)" }}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: NAVY }}><Compass size={16} /> RV Outfitter</p>
      <h2 className="mt-1 text-xl font-extrabold leading-tight" style={{ color: NAVY }}>Want to change anything about what you're seeing?</h2>
      <p className="mt-1 text-sm text-slate-600">Tweak any of these and we'll re-sort the rest of your deck. Your likes stay put.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={lab} style={{ color: NAVY }} htmlFor="ci-type">Type</label>
          <select id="ci-type" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }} value={e.rvType ?? ""} onChange={(x) => setE({ ...e, rvType: (x.target.value || null) as RvType | null })}>
            <option value="">Any type</option>
            {(Object.keys(RV_TYPE_LABELS) as RvType[]).map((t) => <option key={t} value={t}>{RV_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className={lab} style={{ color: NAVY }} htmlFor="ci-budget">Budget</label>
          <select id="ci-budget" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }} value={e.priceMaxUsd ?? ""} onChange={(x) => setE({ ...e, priceMaxUsd: x.target.value ? Number(x.target.value) : null })}>
            <option value="">Any</option>
            {BUDGETS.map((b) => <option key={b} value={b}>Up to ${b / 1000}k</option>)}
          </select>
        </div>
        <div>
          <label className={lab} style={{ color: NAVY }} htmlFor="ci-radius">Distance</label>
          <select id="ci-radius" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }} value={e.radiusMiles ?? ""} onChange={(x) => setE({ ...e, radiusMiles: x.target.value ? Number(x.target.value) : null })}>
            {RADII.map((r) => <option key={r} value={r}>{r} mi</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <p className={lab} style={{ color: NAVY }}>Sleeps at least</p>
          <div className="flex gap-2" role="group" aria-label="Sleeps at least">
            {[null, ...SLEEPS].map((n) => (
              <button key={String(n)} type="button" aria-pressed={(e.sleepsMin ?? null) === n} onClick={() => setE({ ...e, sleepsMin: n })}
                className="flex-1 rounded-full py-2 text-sm font-bold" style={(e.sleepsMin ?? null) === n ? { background: NAVY, color: TEAL } : { border: `1px solid ${LINE}`, color: NAVY }}>
                {n === null ? "Any" : `${n}+`}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button type="button" disabled={!changed || busy} onClick={() => onApply(e)} className="mt-5 w-full rounded-full py-3.5 text-base font-extrabold disabled:opacity-50" style={{ background: NAVY, color: TEAL }}>
        {busy ? "Updating…" : "Update my deck"}
      </button>
      <button type="button" onClick={onDismiss} className="mt-2 w-full rounded-full py-3 text-base font-bold" style={{ color: NAVY, border: `1px solid ${LINE}` }}>Keep swiping</button>
    </div>
  );
}
