import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { RADIUS_STOPS, RV_TYPE_LABELS, radiusLabel, radiusStopIndex, type RvType } from "@/lib/swipe-deck";
import { NAVY, TEAL, LINE } from "./tokens";

export interface DeckFilter {
  rvType: RvType | "";
  priceMinUsd: number | null;
  priceMaxUsd: number | null;
  priceTargetUsd: number | null;
  lengthMinFt: number | null;
  lengthMaxFt: number | null;
  place: string;
  zip: string;
  coords: { lat: number; lng: number } | null;
  /** How far they'll travel, 5 miles up to nationwide. Null = the server's default. */
  radiusMiles: number | null;
}
export const defaultFilter = (): DeckFilter => ({
  rvType: "", priceMinUsd: null, priceMaxUsd: null, priceTargetUsd: null,
  lengthMinFt: null, lengthMaxFt: null, place: "", zip: "", coords: null, radiusMiles: null,
});

export function PreFilter({ initial, onStart, busy }: { initial: DeckFilter; onStart: (f: DeckFilter) => void; busy: boolean }) {
  const [f, setF] = useState<DeckFilter>(initial);
  const [minText, setMinText] = useState(initial.priceMinUsd?.toString() ?? "");
  const [maxText, setMaxText] = useState(initial.priceMaxUsd?.toString() ?? "");
  const [lenMinText, setLenMinText] = useState(initial.lengthMinFt?.toString() ?? "");
  const [lenMaxText, setLenMaxText] = useState(initial.lengthMaxFt?.toString() ?? "");
  const [radiusIndex, setRadiusIndex] = useState(radiusStopIndex(initial.radiusMiles));
  const radius = RADIUS_STOPS[radiusIndex];
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const label = "block text-xs font-bold uppercase tracking-wider mb-1.5";
  const field = "w-full rounded-xl px-3 py-3 bg-white text-base";
  const num = (raw: string, min: number, max: number) => {
    if (!raw.trim()) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
  };

  const nearMe = () => {
    setLocError(null);
    if (!navigator.geolocation) { setLocError("Location isn't available in this browser. Enter a city or ZIP instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setF((x) => ({ ...x, zip: "", place: "", coords: { lat: p.coords.latitude, lng: p.coords.longitude } })); },
      () => { setLocating(false); setLocError("We couldn't get your location. Enter a city or ZIP instead."); },
      { timeout: 8000, maximumAge: 600_000 },
    );
  };
  const priceMin = num(minText, 1000, 2_000_000);
  const priceMax = num(maxText, 1000, 2_000_000);
  const lengthMin = num(lenMinText, 8, 60);
  const lengthMax = num(lenMaxText, 8, 60);
  const placeOk = f.coords !== null || /^\d{5}$/.test(f.zip) || f.place.trim().length >= 2;
  const priceOk = (minText.trim() === "" || priceMin != null) && (maxText.trim() === "" || priceMax != null) && (priceMin == null || priceMax == null || priceMin <= priceMax);
  const lengthOk = (lenMinText.trim() === "" || lengthMin != null) && (lenMaxText.trim() === "" || lengthMax != null) && (lengthMin == null || lengthMax == null || lengthMin <= lengthMax);

  return (
    <form className="rounded-3xl bg-white p-5" style={{ border: `1px solid ${LINE}`, boxShadow: "0 10px 30px rgba(11,31,58,.08)" }}
      onSubmit={(e) => { e.preventDefault(); if (placeOk && priceOk && lengthOk) onStart({ ...f, priceMinUsd: priceMin, priceMaxUsd: priceMax, lengthMinFt: lengthMin, lengthMaxFt: lengthMax, radiusMiles: radius }); }}>
      <p className="text-sm text-slate-600 mb-4">Swipe right to like and left to pass. Your likes stay when you change filters.</p>
      <label className={label} style={{ color: NAVY }} htmlFor="swipe-type">RV type</label>
      <select id="swipe-type" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }} value={f.rvType} onChange={(e) => setF({ ...f, rvType: e.target.value as RvType | "" })}>
        <option value="">Any type</option>
        {(Object.keys(RV_TYPE_LABELS) as RvType[]).map((t) => <option key={t} value={t}>{RV_TYPE_LABELS[t]}</option>)}
      </select>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className={label} style={{ color: NAVY }} htmlFor="swipe-min">Lowest price</label>
          <input id="swipe-min" inputMode="numeric" placeholder="No floor" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }}
            value={minText} onChange={(e) => setMinText(e.target.value.replace(/[^\d]/g, ""))} />
        </div>
        <div>
          <label className={label} style={{ color: NAVY }} htmlFor="swipe-max">Highest price</label>
          <input id="swipe-max" inputMode="numeric" placeholder="No ceiling" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }}
            value={maxText} onChange={(e) => setMaxText(e.target.value.replace(/[^\d]/g, ""))} />
        </div>
      </div>
      {f.priceTargetUsd != null && <p className="mt-2 text-sm text-slate-600">Around ${f.priceTargetUsd.toLocaleString("en-US")} is a rough target, not a hard range, until you set a floor or ceiling.</p>}
      {!priceOk && <p className="mt-2 text-sm text-rose-700">The lowest price is higher than the highest price.</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className={label} style={{ color: NAVY }} htmlFor="swipe-len-min">Shortest length (ft)</label>
          <input id="swipe-len-min" inputMode="decimal" placeholder="Any" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }}
            value={lenMinText} onChange={(e) => setLenMinText(e.target.value.replace(/[^\d]/g, ""))} />
        </div>
        <div>
          <label className={label} style={{ color: NAVY }} htmlFor="swipe-len-max">Longest length (ft)</label>
          <input id="swipe-len-max" inputMode="decimal" placeholder="Any" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }}
            value={lenMaxText} onChange={(e) => setLenMaxText(e.target.value.replace(/[^\d]/g, ""))} />
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Length uses published lengths only. Diesel and brand are not filters.</p>
      <label className={`${label} mt-4`} style={{ color: NAVY }} htmlFor="swipe-place">Where are you shopping?</label>
      <input id="swipe-place" placeholder="City, or leave blank and use ZIP" className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }}
        value={f.place} onChange={(e) => setF({ ...f, place: e.target.value, coords: null })} />
      <div className="mt-3 flex gap-2">
        <input id="swipe-zip" inputMode="numeric" maxLength={5} placeholder={f.coords ? "Using your location" : "ZIP code"} className={field} style={{ border: `1px solid ${LINE}`, color: NAVY }}
          value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value.replace(/\D/g, "").slice(0, 5), coords: null })} aria-label="ZIP code" />
        <button type="button" onClick={nearMe} className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 text-sm font-bold" style={{ border: `1.5px solid ${NAVY}`, color: NAVY }}>
          <LocateFixed size={16} /> {locating ? "Locating…" : f.coords ? "Near me ✓" : "Near me"}
        </button>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <label className={label} style={{ color: NAVY }} htmlFor="swipe-radius">How far will you travel?</label>
        <span className="text-sm font-bold" style={{ color: NAVY }} data-testid="swipe-radius-value">{radiusLabel(radius)}</span>
      </div>
      <input id="swipe-radius" type="range" min={0} max={RADIUS_STOPS.length - 1} step={1} value={radiusIndex}
        aria-valuetext={radiusLabel(radius)} className="w-full" style={{ accentColor: NAVY }}
        onChange={(e) => setRadiusIndex(Number(e.target.value))} />
      <div className="flex justify-between text-xs text-slate-500"><span>5 miles</span><span>Nationwide</span></div>
      {locError && <p className="mt-2 text-sm text-rose-700">{locError}</p>}
      {!placeOk && <p className="mt-2 text-sm text-slate-600">Enter a city or ZIP, or choose Near me. We don't pick a city for you.</p>}
      <button type="submit" disabled={!placeOk || !priceOk || !lengthOk || busy} className="mt-5 w-full rounded-full py-3.5 text-base font-extrabold disabled:opacity-50" style={{ background: NAVY, color: TEAL }}>
        {busy ? "Finding RVs…" : "Start swiping"}
      </button>
    </form>
  );
}
