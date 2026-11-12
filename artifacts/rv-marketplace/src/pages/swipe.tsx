import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { SEO } from "@/components/seo";
import { SwipeCardView } from "@/components/swipe/swipe-card";
import { OnboardingHint, hintAlreadySeen, markHintSeen } from "@/components/swipe/onboarding-hint";
import { CompareLikes } from "@/components/swipe/compare-likes";
import { PreFilter, defaultFilter, type DeckFilter } from "@/components/swipe/pre-filter";
import { DetailSheet } from "@/components/swipe/detail-sheet";
import { Shortlist } from "@/components/swipe/shortlist";
import { OutfitterCheckIn } from "@/components/swipe/outfitter-checkin";
import { NAVY, TEAL } from "@/components/swipe/tokens";
import { trackSwipe } from "@/lib/swipe-analytics";
import { getAnalyticsSessionId } from "@/lib/analytics";
import { trackWebsiteProductEvent } from "@/lib/product-analytics";
import { loadLikes, parseSwipeSearch, saveLikes } from "@/lib/swipe-session";
import { DECK_LIMIT, applyCheckIn, isComplete, markCheckIn, shouldCheckIn, skipBroken, startDeck, swipe, type RvType, type CheckInEdits, type DeckState, type SwipeCard } from "@/lib/swipe-deck";
import { SwipeWordmark } from "@/components/swipe/swipe-wordmark";

const BASE = import.meta.env.BASE_URL || "/";

type Phase = "filter" | "loading" | "deck" | "done" | "empty" | "compare";

function filterFromQuery(search: string): DeckFilter {
  const q = parseSwipeSearch(search);
  return {
    ...defaultFilter(),
    rvType: q.rvType,
    priceMinUsd: q.priceMinUsd,
    priceMaxUsd: q.priceMaxUsd,
    priceTargetUsd: q.priceTargetUsd,
    lengthMinFt: q.lengthMinFt,
    lengthMaxFt: q.lengthMaxFt,
    place: q.zip ? "" : q.place,
    zip: q.zip,
    radiusMiles: q.radiusMiles,
  };
}

export function Swipe() {
  const search = useSearch();
  const [phase, setPhase] = useState<Phase>("filter");
  const [filter, setFilter] = useState<DeckFilter>(() => filterFromQuery(search));
  const [hintOpen, setHintOpen] = useState(false);
  const [deck, setDeck] = useState<DeckState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SwipeCard | null>(null);
  const [zipUsed, setZipUsed] = useState<string | null>(null);
  const completed = useRef(false);
  const [checkIn, setCheckIn] = useState(false);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [sleepsMin, setSleepsMin] = useState<number | null>(null);

  const deckBody = (f: DeckFilter, extra: Record<string, unknown> = {}) => {
    const body: Record<string, unknown> = { ...extra };
    if (f.rvType) body.rvType = f.rvType;
    if (f.priceMinUsd) body.priceMinUsd = f.priceMinUsd;
    if (f.priceMaxUsd) body.priceMaxUsd = f.priceMaxUsd;
    if (f.lengthMinFt) body.lengthMinFt = f.lengthMinFt;
    if (f.lengthMaxFt) body.lengthMaxFt = f.lengthMaxFt;
    if (f.radiusMiles && body.radiusMiles == null) body.radiusMiles = f.radiusMiles;
    if (f.coords) { body.lat = f.coords.lat; body.lng = f.coords.lng; }
    else if (/^\d{5}$/.test(f.zip)) body.zip = f.zip;
    else if (f.place.trim().length >= 2) body.place = f.place.trim();
    return body;
  };

  const load = async (f: DeckFilter) => {
    setFilter(f); setError(null); setPhase("loading"); completed.current = false; setCheckIn(false); setSleepsMin(null);
    try {
      const body = deckBody(f);
      const r = await fetch(`${BASE}api/swipe/deck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await r.json().catch(() => ({}))) as { cards?: SwipeCard[]; radiusMiles?: number; zip?: string; guidance?: string };
      if (!r.ok) { setError(data.guidance ?? "We couldn't load RVs right now. Please try again."); setPhase("filter"); return; }
      const s = startDeck(data.cards ?? [], data.radiusMiles ?? 150, loadLikes(localStorage));
      if (!hintAlreadySeen()) setHintOpen(true);
      setZipUsed(data.zip ?? null);
      setDeck(s);
      setPhase(isComplete(s) ? "empty" : "deck");
    } catch {
      setError("We couldn't load RVs right now. Please try again."); setPhase("filter");
    }
  };

  useEffect(() => {
    if (phase !== "deck" || !deck?.current) return;
    let sessionId: string | undefined;
    try { sessionId = getAnalyticsSessionId(); } catch { sessionId = undefined; }
    trackWebsiteProductEvent({ event: "website_card_viewed", listingId: deck.current.id, surface: "swipe", sessionId });
  }, [phase, deck?.current?.id]);

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
    if (liked) {
      let sessionId: string | undefined;
      try { sessionId = getAnalyticsSessionId(); } catch { sessionId = undefined; }
      trackWebsiteProductEvent({ event: "website_inventory_attention", listingId: c.id, surface: "swipe", action: "like", sessionId });
    }
    const next = swipe(deck, liked);
    if (liked) saveLikes(localStorage, next.liked);
    setDeck(next);
    if (shouldCheckIn(next)) {
      setCheckIn(true);
      trackSwipe("outfitter_checkin", { action: "shown", position: next.shown.length, passStreak: next.passStreak, checkIn: next.checkIns + 1 });
    }
  };

  const dismissCheckIn = () => {
    if (!deck) return;
    trackSwipe("outfitter_checkin", { action: "dismissed", position: deck.shown.length });
    setDeck(markCheckIn(deck)); setCheckIn(false);
  };

  const applyEdits = async (e: CheckInEdits) => {
    if (!deck) return;
    setCheckInBusy(true);
    const f: DeckFilter = { ...filter, rvType: (e.rvType ?? "") as RvType | "", priceMaxUsd: e.priceMaxUsd ?? null, radiusMiles: e.radiusMiles ?? filter.radiusMiles };
    let fresh: SwipeCard[] = [];
    try {
      const extra: Record<string, unknown> = { excludeIds: deck.shown.filter((c) => c.id !== deck.current?.id).map((c) => c.id) };
      if (e.radiusMiles) extra.radiusMiles = e.radiusMiles;
      if (e.sleepsMin) extra.sleepsMin = e.sleepsMin;
      const r = await fetch(`${BASE}api/swipe/deck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deckBody(f, extra)) });
      if (r.ok) fresh = ((await r.json()) as { cards?: SwipeCard[] }).cards ?? [];
    } catch { /* fall back to re-ranking what we already have */ }
    const next = applyCheckIn(deck, e, fresh);
    trackSwipe("outfitter_checkin", { action: "changed", position: deck.shown.length, rvType: e.rvType ?? null, priceMaxUsd: e.priceMaxUsd ?? null, radiusMiles: e.radiusMiles ?? null, sleepsMin: e.sleepsMin ?? null, added: fresh.length });
    setFilter(f); setSleepsMin(e.sleepsMin ?? null);
    setDeck(next); setCheckIn(false); setCheckInBusy(false);
  };

  const position = deck ? Math.min(deck.shown.length, DECK_LIMIT) : 0;
  return (
    <div className="min-h-screen" style={{ background: "#F5F8FB", fontFamily: "'DM Sans', sans-serif" }}>
      <SEO title="Swipe RVs near you" description="Swipe through RVs for sale near you and build a shortlist." canonical="/swipe" noIndex />
      <header className="sticky top-0 z-40 bg-white" style={{ borderBottom: "1px solid #DDE4EE" }}>
        <div className="max-w-md mx-auto flex items-center justify-between px-4 h-16">
          <Link href="/" aria-label="MatchRV home" className="inline-flex shrink-0 items-center">
            <SwipeWordmark />
          </Link>
          {deck && phase === "deck" && <span data-testid="deck-progress" className="text-sm font-bold" style={{ color: NAVY }}>{position} / {DECK_LIMIT}</span>}
        </div>
        <div className="max-w-md mx-auto grid grid-cols-2 gap-2 px-4 py-2">
          <button type="button" className="rounded-full py-2.5 text-sm font-extrabold" style={{ background: NAVY, color: TEAL }} onClick={() => setPhase("compare")}>Compare your likes</button>
          <button type="button" className="rounded-full py-2.5 text-sm font-extrabold" style={{ border: `1.5px solid ${NAVY}`, color: NAVY }} onClick={() => { setHintOpen(false); setPhase("filter"); }}>Change filters</button>
        </div>
        <div className="max-w-md mx-auto px-4 pb-2">
          <button type="button" className="text-sm font-bold underline" style={{ color: NAVY }} onClick={() => setHintOpen(true)}>Replay swipe tips</button>
        </div>
      </header>

      <main className={`${phase === "compare" ? "max-w-4xl" : "max-w-md"} mx-auto px-4 pt-4 pb-10`}>
        {hintOpen && phase !== "deck" && (
          <div className="relative mb-4 h-80">
            <OnboardingHint open onClose={() => { markHintSeen(); setHintOpen(false); }} />
          </div>
        )}
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

        {phase === "deck" && deck?.current && checkIn && (
          <OutfitterCheckIn busy={checkInBusy} onApply={(e) => void applyEdits(e)} onDismiss={dismissCheckIn}
            initial={{ rvType: filter.rvType || null, priceMaxUsd: filter.priceMaxUsd, radiusMiles: deck.radiusMiles, sleepsMin }} />
        )}

        {phase === "deck" && deck?.current && !checkIn && (
          <div className="relative">
            <OnboardingHint open={hintOpen} onClose={() => { markHintSeen(); setHintOpen(false); }} />
            <SwipeCardView key={deck.current.id} card={deck.current} onSwipe={onSwipe} onDetails={() => setDetail(deck.current)} onPhotoError={() => setDeck(skipBroken(deck))} />
          </div>
        )}

        {phase === "compare" && <CompareLikes likes={loadLikes(localStorage)} activeIds={deck ? new Set(deck.pool.map((c) => c.id)) : null} onOpen={setDetail} />}
        {phase === "done" && deck && <Shortlist liked={deck.liked} shown={deck.shown.length} onOpen={setDetail} onRestart={() => setPhase("filter")} />}
      </main>

      {detail && <DetailSheet card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
