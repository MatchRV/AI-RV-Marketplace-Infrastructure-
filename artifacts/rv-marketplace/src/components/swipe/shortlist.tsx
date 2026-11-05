import { Heart, MapPin, RotateCcw } from "lucide-react";
import { cardPlace, cardTitle, formatPrice, type SwipeCard } from "@/lib/swipe-deck";
import { NAVY, TEAL, TEAL_DARK, LINE } from "./tokens";

export function Shortlist({ liked, shown, onOpen, onRestart }: { liked: SwipeCard[]; shown: number; onOpen: (c: SwipeCard) => void; onRestart: () => void }) {
  return (
    <section aria-label="Your shortlist" data-testid="shortlist">
      <h2 className="text-2xl font-extrabold flex items-center gap-2" style={{ color: NAVY }}><Heart fill={TEAL} color={TEAL} /> Your shortlist</h2>
      <p className="mt-1 text-sm text-slate-600">You liked {liked.length} of {shown} RVs. Tap one to see who sells it and set up a visit.</p>
      {liked.length === 0 && <p className="mt-6 text-base" style={{ color: NAVY }}>No likes this round. Try a different type, budget or ZIP.</p>}
      <ul className="mt-4 flex flex-col gap-3">
        {liked.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onOpen(c)} className="w-full flex gap-3 text-left rounded-2xl bg-white p-2.5" style={{ border: `1px solid ${LINE}` }}>
              <img src={c.photo} alt={cardTitle(c)} className="w-28 h-20 rounded-xl object-cover shrink-0" />
              <span className="flex flex-col justify-center min-w-0">
                <span className="font-extrabold leading-tight truncate" style={{ color: NAVY }}>{cardTitle(c)}</span>
                <span className="font-black" style={{ color: TEAL_DARK }}>{formatPrice(c.priceUsd)}</span>
                <span className="flex items-center gap-1 text-xs text-slate-600"><MapPin size={13} /> {cardPlace(c)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onRestart} className="mt-6 w-full flex items-center justify-center gap-2 rounded-full py-3 font-bold" style={{ border: `1.5px solid ${NAVY}`, color: NAVY }}>
        <RotateCcw size={16} /> Start a new deck
      </button>
    </section>
  );
}
