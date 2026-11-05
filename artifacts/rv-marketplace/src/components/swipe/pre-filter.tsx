import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { DEFAULT_ZIP, RV_TYPE_LABELS, type RvType } from "@/lib/swipe-deck";
import { NAVY, TEAL, LINE } from "./tokens";

export interface DeckFilter { rvType: RvType | ""; priceMaxUsd: number | null; zip: string; coords: { lat: number; lng: number } | null }
export const defaultFilter = (): DeckFilter => ({ rvType: "", priceMaxUsd: null, zip: DEFAULT_ZIP, coords: null });

const BUDGETS = [25_000, 50_000, 75_000, 100_000, 150_000, 250_000];

/** Short, optional pre-filter (type, budget, ZIP or near me) that feeds the deck search. */
export function PreFilter({ initial, onStart, busy }: { initial: DeckFilter; onStart: (f: DeckFilter) => void; busy: boolean }) {
  const [f, setF] = useState<DeckFilter>(initial);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const label = "block text-xs font-bold uppercase tracking-wider mb-1.5";
  const field = "w-full rounded-xl px-3 py-3 bg-white text-base";

  const nearMe = () => {
    setLocError(null);
    if (!navigator.geolocation) { setLocError("Location isn't available in this browser. Enter a ZIP instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setF((x) => ({ ...x, zip: "", coords: { lat: p.coords.latitude, lng: p.coords.longitude } })); },
      () => { setLocating(false); setLocError("We couldn't get your location. Enter a ZIP instead."); },
      { timeout: 8000, maximumAge: 600_000 },
    );
  };
  const zipOk = f.coords !== null || /^\d{5}$/.test(f.zip);

  return (
    <form className="rounded-3xl bg-white p-5" style={{ border: `1px solid ${LINE}`, boxShadow: "0 10px 30px rgba(11,31,58,.08)" }}
      onSubmit={(e) => { e.preventDefault(); if (zipOk) onStart(f); }}>
      <p className="text-sm text-slate-600 mb-4">All optional. Swipe right on RVs you like and left on ones you don't. We'll show 20, then your shortlist.</p>
      <label className={label} style={{ color: NAVY }} htmlFor="swipe-type">RV type</label>
      <select id="swipe-type" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }} value={f.rvType} onChange={(e) => setF({ ...f, rvType: e.target.value as RvType | "" })}>
        <option value="">Any type</option>
        {(Object.keys(RV_TYPE_LABELS) as RvType[]).map((t) => <option key={t} value={t}>{RV_TYPE_LABELS[t]}</option>)}
      </select>
      <label className={`${label} mt-4`} style={{ color: NAVY }} htmlFor="swipe-budget">Budget</label>
      <select id="swipe-budget" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }} value={f.priceMaxUsd ?? ""} onChange={(e) => setF({ ...f, priceMaxUsd: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Any price</option>
        {BUDGETS.map((b) => <option key={b} value={b}>Up to ${b.toLocaleString("en-US")}</option>)}
      </select>
      <label className={`${label} mt-4`} style={{ color: NAVY }} htmlFor="swipe-zip">Near ZIP</label>
      <div className="flex gap-2">
        <input id="swipe-zip" inputMode="numeric" maxLength={5} placeholder={f.coords ? "Using your location" : "ZIP code"} className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }}
          value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value.replace(/\D/g, "").slice(0, 5), coords: null })} />
        <button type="button" onClick={nearMe} className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 text-sm font-bold" style={{ border: `1.5px solid ${NAVY}`, color: NAVY }}>
          <LocateFixed size={16} /> {locating ? "Locating…" : f.coords ? "Near me ✓" : "Near me"}
        </button>
      </div>
      {locError && <p className="mt-2 text-sm text-rose-700">{locError}</p>}
      <button type="submit" disabled={!zipOk || busy} className="mt-5 w-full rounded-full py-3.5 text-base font-extrabold disabled:opacity-50" style={{ background: NAVY, color: TEAL }}>
        {busy ? "Finding RVs…" : "Start swiping"}
      </button>
    </form>
  );
}
