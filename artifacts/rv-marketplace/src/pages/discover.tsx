import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useGetListings } from "@workspace/api-client-react";
import type { Listing } from "@workspace/api-client-react";
import { X, Heart, MapPin, RefreshCw, ArrowRight, Info, Sparkles } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { recordBuyerIntent } from "@/lib/buyer-intent";
import { formatCurrency, formatRvType } from "@/lib/utils";
import { useAppAuth } from "@/contexts/auth-context";

const DRAG_THRESHOLD = 80;
const LIKES_FOR_BANNER = 5;
const SWIPES_FOR_MODAL = 10;

function getDealBadge(score: string | undefined): { label: string; className: string } | null {
  switch (score) {
    case "great_deal": return { label: "🔥 Great Deal", className: "bg-green-500 text-white" };
    case "good_deal":  return { label: "✅ Good Deal",  className: "bg-emerald-400 text-white" };
    case "high_price": return { label: "High Price",    className: "bg-orange-100 text-orange-700" };
    case "overpriced": return { label: "Overpriced",    className: "bg-red-100 text-red-700" };
    default: return null;
  }
}

export function Discover() {
  const { isAuthenticated, login } = useAppAuth();
  const [, navigate] = useLocation();

  const { data: listingsData, isLoading } = useGetListings({ limit: 100 });
  const allListings = (listingsData?.listings ?? []) as Listing[];

  const [currentIdx, setCurrentIdx]     = useState(0);
  const [likedIds, setLikedIds]         = useState<number[]>([]);
  const [totalSwiped, setTotalSwiped]   = useState(0);
  const [showBanner, setShowBanner]     = useState(false);
  const [showModal, setShowModal]       = useState(false);
  const [modalDismissed, setModalDismissed] = useState(false);

  const [dragX, setDragX]         = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [swipeAnim, setSwipeAnim]  = useState<"none" | "left" | "right">("none");
  const startXRef = useRef(0);
  const cardRef   = useRef<HTMLDivElement>(null);

  const current    = allListings[currentIdx];
  const next       = allListings[currentIdx + 1];
  const isFinished = !isLoading && allListings.length > 0 && currentIdx >= allListings.length;
  const progress   = allListings.length > 0 ? Math.round((currentIdx / allListings.length) * 100) : 0;

  useEffect(() => {
    trackEvent("page_view", { metadata: { page: "discover" } });
  }, []);

  useEffect(() => {
    if (!current) return;
    recordBuyerIntent("listing_view", {
      listingId: current.id,
      dealerId: current.dealerId as number,
      metadata: {
        source: "discover_card",
        title: current.title,
        type: current.type,
        price: current.price,
        location: current.location,
        dealerName: current.dealer?.name,
        dealerCity: current.dealer?.city,
        dealerState: current.dealer?.state,
      },
      sendAnalytics: false,
    });
  }, [current]);

  const triggerSwipe = useCallback((dir: "left" | "right") => {
    if (!current || swipeAnim !== "none") return;

    const newTotal = totalSwiped + 1;
    setTotalSwiped(newTotal);

    if (dir === "right") {
      const newLiked = [...likedIds, current.id];
      setLikedIds(newLiked);
      recordBuyerIntent("listing_saved", {
        listingId: current.id,
        dealerId: current.dealerId as number,
        metadata: { source: "discover_swipe", title: current.title, type: current.type, price: current.price },
      });
      if (!isAuthenticated && newLiked.length >= LIKES_FOR_BANNER) {
        setShowBanner(true);
      }
    } else {
      trackEvent("listing_skipped", { metadata: { listingId: current.id } });
    }

    if (!isAuthenticated && newTotal >= SWIPES_FOR_MODAL && !modalDismissed) {
      setShowModal(true);
    }

    setSwipeAnim(dir);
    setTimeout(() => {
      setSwipeAnim("none");
      setDragX(0);
      setCurrentIdx(prev => prev + 1);
    }, 300);
  }, [current, likedIds, totalSwiped, isAuthenticated, modalDismissed, swipeAnim]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  triggerSwipe("left");
      if (e.key === "ArrowRight") triggerSwipe("right");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [triggerSwipe]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (swipeAnim !== "none") return;
    setIsDragging(true);
    startXRef.current = e.clientX;
    cardRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragX(e.clientX - startXRef.current);
  };
  const onPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragX > DRAG_THRESHOLD)       triggerSwipe("right");
    else if (dragX < -DRAG_THRESHOLD) triggerSwipe("left");
    else setDragX(0);
  };

  const handleHelpDecide = () => {
    const swipeData = { liked: allListings.filter(l => likedIds.includes(l.id)), totalSwiped };
    sessionStorage.setItem("swipeData", JSON.stringify(swipeData));
    navigate("/outfitter");
  };

  const handleSaveAndLogin = () => {
    const swipeData = { liked: allListings.filter(l => likedIds.includes(l.id)), totalSwiped };
    sessionStorage.setItem("swipeData", JSON.stringify(swipeData));
    login();
  };

  const handleReset = () => {
    setCurrentIdx(0);
    setLikedIds([]);
    setTotalSwiped(0);
    setShowBanner(false);
    setModalDismissed(false);
  };

  const likeOpacity = Math.max(0, Math.min(1, (dragX - 40) / 60));
  const passOpacity = Math.max(0, Math.min(1, (-dragX - 40) / 60));

  const cardStyle: React.CSSProperties = swipeAnim !== "none"
    ? {}
    : isDragging
      ? { transform: `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`, transition: "none", cursor: "grabbing" }
      : { transition: "transform 0.15s ease", cursor: "grab" };

  const swipeClass = swipeAnim === "left"
    ? "translate-x-[-130%] rotate-[-20deg] opacity-0 transition-all duration-300"
    : swipeAnim === "right"
      ? "translate-x-[130%] rotate-[20deg] opacity-0 transition-all duration-300"
      : "";

  const badge = current ? getDealBadge(current.dealScore) : null;

  return (
    <Layout>
      <SEO
        title="Discover RVs — Swipe to Match"
        description="Swipe through curated RV listings and find your perfect rig on MatchRV. Like it, skip it, or let the AI Outfitter narrow it down for you."
        canonical="https://matchrv.com/discover"
      />

      {/* 5-like sticky banner */}
      {showBanner && !isAuthenticated && (
        <div className="sticky top-0 z-50 bg-[#ffe08b] border-b border-[#e8c832] px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-[#241a00]">
            💛 You have {likedIds.length} unsaved pick{likedIds.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={handleSaveAndLogin}
            className="flex items-center gap-1 bg-[#241a00] text-[#ffe08b] px-4 py-1.5 rounded-full text-xs font-black whitespace-nowrap"
          >
            Save them <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 10-swipe modal */}
      {showModal && !modalDismissed && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="text-4xl mb-4">💾</div>
            <h2 className="text-xl font-black text-[#161d1d] mb-2">Don't lose your picks</h2>
            <p className="text-[#6b7a7a] text-sm mb-6 leading-relaxed">
              You've liked <span className="font-black text-[#0B1117]">{likedIds.length}</span> RV{likedIds.length !== 1 ? "s" : ""} — sign in to save them and get personalized AI recommendations.
            </p>
            <button
              onClick={handleSaveAndLogin}
              className="w-full bg-[#0B1117] text-white py-3.5 rounded-2xl font-black text-sm mb-3 hover:bg-[#002829] transition-colors"
            >
              Sign In &amp; Save My Picks
            </button>
            <button
              onClick={() => { setShowModal(false); setModalDismissed(true); }}
              className="w-full text-[#6b7a7a] text-sm font-medium py-2 hover:text-[#3b4949] transition-colors"
            >
              Keep swiping without saving
            </button>
          </div>
        </div>
      )}

      <div className="min-h-[calc(100vh-80px)] flex flex-col bg-[#f4fbfa]">

        {/* Header */}
        <header className="px-4 sm:px-8 py-4 flex items-center justify-between border-b border-[#E2E8F0] bg-white">
          <div>
            <h1 className="font-display text-2xl font-black text-[#0B1117]">Discover</h1>
            <p className="text-xs text-[#6b7a7a] font-medium">Swipe to find your perfect rig</p>
          </div>
          {likedIds.length > 0 && (
            <button
              onClick={handleHelpDecide}
              className="flex items-center gap-2 px-4 py-2 bg-[#0B1117] text-white rounded-full text-xs font-black hover:bg-[#002829] transition-colors shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" /> Help me decide
            </button>
          )}
        </header>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#0B1117] border-t-transparent rounded-full animate-spin" />
          </div>

        ) : isFinished ? (
          /* End screen */
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="w-24 h-24 bg-[#0B1117]/10 rounded-full flex items-center justify-center mb-6 text-4xl">🎉</div>
            <h2 className="font-display font-black text-3xl text-[#161d1d] mb-3">You've seen them all!</h2>
            <p className="text-[#6b7a7a] text-base mb-1">
              You liked <span className="font-black text-[#0B1117]">{likedIds.length}</span> out of {allListings.length} RVs.
            </p>
            {likedIds.length > 0 && (
              <p className="text-[#6b7a7a] text-sm mb-8">Ready to let AI pick the best one for you?</p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              {likedIds.length > 0 && (
                <button
                  onClick={handleHelpDecide}
                  className="flex items-center gap-2 px-6 py-3.5 bg-[#0B1117] text-white rounded-2xl font-black text-sm hover:bg-[#002829] transition-colors shadow-md"
                >
                  <Sparkles className="w-4 h-4" /> Let AI pick the best one
                </button>
              )}
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-6 py-3.5 border-2 border-[#0B1117] text-[#0B1117] rounded-2xl font-black text-sm hover:bg-[#0B1117] hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Start over
              </button>
              <Link href="/browse">
                <span className="flex items-center gap-2 px-6 py-3.5 bg-white border border-[#E2E8F0] text-[#161d1d] rounded-2xl font-black text-sm hover:bg-[#eef5f4] transition-colors cursor-pointer">
                  Browse All RVs <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          </div>

        ) : (
          <div className="flex-1 flex flex-col items-center px-4 py-5 max-w-lg mx-auto w-full">

            {/* Progress bar */}
            <div className="w-full mb-5">
              <div className="flex justify-between text-xs text-[#6b7a7a] mb-1.5 font-medium">
                <span>{currentIdx} of {allListings.length} reviewed</span>
                <span>{likedIds.length} liked</span>
              </div>
              <div className="h-1.5 w-full bg-[#E2E8F0] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0B1117] rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Card stack */}
            <div className="relative w-full" style={{ height: "520px" }}>

              {/* Peeking next card */}
              {next && (
                <div className="absolute inset-x-0 top-3 bottom-0 bg-[#E2E8F0] rounded-3xl border border-[#bac9c9]/20 scale-[0.96] origin-bottom" />
              )}

              {/* Main card */}
              {current && (
                <div
                  ref={cardRef}
                  className={`absolute inset-0 bg-white rounded-3xl shadow-xl overflow-hidden select-none ${swipeClass}`}
                  style={swipeClass ? {} : { ...cardStyle, touchAction: "none" }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  {/* LIKE stamp */}
                  <div
                    className="absolute top-8 left-5 z-20 border-4 border-green-500 text-green-500 px-3 py-1.5 rounded-xl font-black text-xl tracking-widest rotate-[-15deg] pointer-events-none"
                    style={{ opacity: likeOpacity }}
                  >
                    LIKE ✓
                  </div>
                  {/* PASS stamp */}
                  <div
                    className="absolute top-8 right-5 z-20 border-4 border-red-500 text-red-500 px-3 py-1.5 rounded-xl font-black text-xl tracking-widest rotate-[15deg] pointer-events-none"
                    style={{ opacity: passOpacity }}
                  >
                    PASS ✗
                  </div>

                  {/* Image */}
                  <div className="relative h-[260px] bg-[#0B1117]/10 overflow-hidden">
                    {current.images?.[0] ? (
                      <img
                        src={current.images[0]}
                        alt={current.title}
                        className="w-full h-full object-cover pointer-events-none"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl">🏕</div>
                    )}

                    {/* Deal score badge */}
                    {badge && (
                      <div className={`absolute top-4 left-4 px-3 py-1.5 rounded-full text-xs font-black shadow-sm ${badge.className}`}>
                        {badge.label}
                      </div>
                    )}

                    {/* Info icon → listing detail */}
                    <Link href={`/listing/${current.id}`}>
                      <span
                        className="absolute top-4 right-4 w-8 h-8 bg-black/40 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors"
                        onClick={e => e.stopPropagation()}
                        onPointerDown={e => e.stopPropagation()}
                        title="View full listing"
                      >
                        <Info className="w-4 h-4 text-white" />
                      </span>
                    </Link>

                    {/* Title overlay */}
                    <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-black/75 to-transparent pointer-events-none" />
                    <div className="absolute bottom-4 left-4 right-12 pointer-events-none">
                      <p className="text-white font-black text-lg leading-snug line-clamp-2">{current.title}</p>
                      <div className="flex items-center gap-1 text-white/70 text-xs mt-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{current.location}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-5 flex flex-col gap-4">
                    {/* Price + meta */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-2xl font-black text-[#161d1d]">{formatCurrency(current.price)}</p>
                        <p className="text-xs text-[#6b7a7a] font-medium mt-0.5">{formatRvType(current.type)}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${current.condition === "new" ? "bg-blue-100 text-blue-700" : "bg-[#eef5f4] text-[#6b7a7a]"}`}>
                          {current.condition === "new" ? "New" : "Used"}
                        </span>
                        {current.year && <p className="text-xs text-[#6b7a7a] mt-1">{current.year}</p>}
                      </div>
                    </div>

                    {/* Specs chips */}
                    <div className="flex flex-wrap gap-2">
                      {current.length != null && (
                        <span className="px-3 py-1 bg-[#eef5f4] rounded-full text-xs font-bold text-[#3b4949]">{current.length}' long</span>
                      )}
                      {current.sleeps != null && (
                        <span className="px-3 py-1 bg-[#eef5f4] rounded-full text-xs font-bold text-[#3b4949]">Sleeps {current.sleeps}</span>
                      )}
                      {current.slides != null && current.slides > 0 && (
                        <span className="px-3 py-1 bg-[#eef5f4] rounded-full text-xs font-bold text-[#3b4949]">{current.slides} slide{current.slides > 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-8 mt-6">
              <button
                onClick={() => triggerSwipe("left")}
                className="w-16 h-16 rounded-full bg-white border-2 border-[#E2E8F0] flex items-center justify-center shadow-md hover:border-red-300 hover:scale-110 active:scale-95 transition-all"
                title="Pass (←)"
              >
                <X className="w-7 h-7 text-red-400" />
              </button>
              <button
                onClick={() => triggerSwipe("right")}
                className="w-20 h-20 rounded-full bg-[#0B1117] flex items-center justify-center shadow-lg shadow-[#0B1117]/25 hover:bg-[#002829] hover:scale-110 active:scale-95 transition-all"
                title="Like (→)"
              >
                <Heart className="w-8 h-8 text-white fill-white" />
              </button>
            </div>

            {/* Desktop keyboard hint */}
            <p className="hidden md:block text-center text-xs text-[#6b7a7a]/50 mt-4 font-medium tracking-wide">
              ← Pass &nbsp;·&nbsp; → Like
            </p>

          </div>
        )}
      </div>
    </Layout>
  );
}
