import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Heart, SlidersHorizontal } from "lucide-react";
import { SEO } from "@/components/seo";
import { SwipeCardView } from "@/components/swipe/swipe-card";
import { OnboardingHint } from "@/components/swipe/onboarding-hint";
import { PreFilter, defaultFilter, type DeckFilter } from "@/components/swipe/pre-filter";
import { DetailSheet } from "@/components/swipe/detail-sheet";
import { Shortlist } from "@/components/swipe/shortlist";
import { NAVY, TEAL } from "@/components/swipe/tokens";
import { trackSwipe } from "@/lib/swipe-analytics";
import { DECK_LIMIT, isComplete, skipBroken, startDeck, swipe, type DeckState, type SwipeCard } from "@/lib/swipe-deck";

const BASE = import.meta.env.BASE_URL || "/";

type Phase = "filter" | "loading" | "deck" | "done" | "empty";

export function Swipe() {
  const [phase, setPhase] = useState<Phase>("filter");
  const [filter, setFilter] = useState<DeckFilter>(defaultFilter());
  const [deck, setDeck] = useState<DeckState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SwipeCard | null>(null);
  const [zipUsed, setZipUsed] = useState<string | null>(null);
  const completed = useRef(false);

  const load = async (f: DeckFilter) => {
    setFilter(f); setError(null); setPhase("loading"); completed.current = false;
    try {
      const body: Record<string, unknown> = {};
      if (f.rvType) body.rvType = f.rvType;
      if (f.priceMaxUsd) body.priceMaxUsd = f.priceMaxUsd;
      if (f.coords) { body.lat = f.coords.lat; body.lng = f.coords.lng; } else body.zip = f.zip;
      const r = await fetch(`${BASE}api/swipe/deck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await r.json().catch(() => ({}))) as { cards?: SwipeCard[]; radiusMiles?: number; zip?: string; guidance?: string };
      if (!r.ok) { setError(data.guidance ?? "We couldn't load RVs right now. Please try again."); setPhase("filter"); return; }
      const s = startDeck(data.cards ?? [], data.radiusMiles ?? 150);
      setZipUsed(data.zip ?? null);
      setDeck(s);
      setPhase(isComplete(s) ? "empty" : "deck");
    } catch {
      setError("We couldn't load RVs right now. Please try again."); setPhase("filter");
    }
  };

  useEffect(() => {
    if (phase === "deck" && deck && isComplete(deck) && !completed.current) {
      completed.current = true;
      trackSwipe("deck_complete", { shown: deck.shown.length, liked: deck.liked.length });
      setPhase("done");
    }
  }, [deck, phase]);

  const onSwipe = (liked: boolean) => {
    if (!deck?.current) return;
    const c = deck.current;
    trackSwipe(liked ? "swipe_like" : "swipe_pass", { unitId: c.id, position: deck.shown.length, rvType: c.rvType, priceUsd: c.priceUsd });
    setDeck(swipe(deck, liked));
  };

  const position = deck ? Math.min(deck.shown.length, DECK_LIMIT) : 0;
  return (
    <div className="min-h-screen" style={{ background: "#F5F8FB", fontFamily: "'DM Sans', sans-serif" }}>
      <SEO title="Swipe RVs near you" description="Swipe through RVs for sale near you and build a shortlist." canonical="/swipe" noIndex />
      <header className="sticky top-0 z-40 bg-white" style={{ borderBottom: "1px solid #DDE4EE" }}>
        <div className="max-w-md mx-auto flex items-center justify-between px-4 h-14">
          <Link href="/" aria-label="MatchRV home" className="relative block overflow-hidden" style={{ width: 140, height: 42 }}>
            {/* The light logo has wide transparent margins; crop to the wordmark. */}
            <img src="/matchrv-logo-light.png" alt="MatchRV" className="absolute max-w-none" style={{ width: 230, left: -49, top: -51 }} />
          </Link>
          {(phase === "deck" || phase === "done") && deck && (
            <div className="flex items-center gap-3 text-sm font-bold" style={{ color: NAVY }}>
              {phase === "deck" && <span data-testid="deck-progress">{position} / {DECK_LIMIT}</span>}
              <span className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: NAVY, color: TEAL }}><Heart size={14} fill={TEAL} /> {deck.liked.length}</span>
              <button type="button" aria-label="Change filters" onClick={() => setPhase("filter")}><SlidersHorizontal size={20} /></button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 pb-10">
        {(phase === "filter" || phase === "loading") && (
          <>
            <h1 className="text-[1.7rem] font-extrabold leading-tight mb-3" style={{ color: NAVY, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Swipe to find your RV</h1>
            {error && <p className="mb-3 text-sm text-rose-700" role="alert">{error}</p>}
            <PreFilter initial={filter} onStart={load} busy={phase === "loading"} />
          </>
        )}

        {phase === "empty" && (
          <div className="rounded-3xl bg-white p-6 text-center" style={{ border: "1px solid #DDE4EE" }}>
            <p className="font-bold" style={{ color: NAVY }}>No RVs with a listed price and photo match those filters{zipUsed ? ` near ${zipUsed}` : ""}.</p>
            <button type="button" onClick={() => setPhase("filter")} className="mt-4 rounded-full px-5 py-3 font-bold" style={{ background: NAVY, color: TEAL }}>Change filters</button>
          </div>
        )}

        {phase === "deck" && deck?.current && (
          <div className="relative">
            <OnboardingHint />
            <SwipeCardView key={deck.current.id} card={deck.current} onSwipe={onSwipe} onDetails={() => setDetail(deck.current)} onPhotoError={() => setDeck(skipBroken(deck))} />
          </div>
        )}

        {phase === "done" && deck && <Shortlist liked={deck.liked} shown={deck.shown.length} onOpen={setDetail} onRestart={() => setPhase("filter")} />}
      </main>

      {detail && <DetailSheet card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
