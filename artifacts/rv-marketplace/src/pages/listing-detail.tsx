import { useRoute } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useGetListing, useTowMatch } from "@workspace/api-client-react";
import type { TowMatchResponse } from "@workspace/api-client-react";
import { Input } from "@/components/ui-elements";
import { formatCurrency, formatNumber, getDealScoreInfo, formatRvType } from "@/lib/utils";
import {
  MapPin, Check, AlertTriangle, ShieldCheck, Truck, ArrowLeft,
  Heart, Bell, Send, Car, ChevronLeft, ChevronRight, Maximize2,
  BedDouble, Calendar, Layers, Smartphone, Search, Zap, Star,
  BadgeCheck, Tag, X, Mail, ImageOff
} from "lucide-react";
import { DrivewayFitChecker } from "@/components/driveway-fit-checker";
import { RvDimensionViewer } from "@/components/rv-dimension-viewer";
import { QRCodeSVG } from "qrcode.react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { trackEvent } from "@/lib/analytics";
import { buildLeadBuyerProfile, recordBuyerIntent } from "@/lib/buyer-intent";
import { cleanListingImages } from "@/lib/listing-images";
import { useAppAuth } from "@/contexts/auth-context";

const DEAL_CHIP: Record<string, { bg: string; text: string }> = {
  great_deal: { bg: "bg-emerald-100", text: "text-emerald-900" },
  good_deal:  { bg: "bg-green-100",   text: "text-green-800"  },
  fair_deal:  { bg: "bg-amber-100",   text: "text-amber-800"  },
  high_price: { bg: "bg-orange-100",  text: "text-orange-800" },
  overpriced: { bg: "bg-red-100",     text: "text-red-800"    },
};

function SpecItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#eef5f4] rounded-2xl p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#924c00] mb-1">{label}</div>
      <div className="font-black text-[#0B1117] text-xl leading-tight">{value}</div>
    </div>
  );
}

interface OutfitterSession {
  sessionId: string;
  profile: Record<string, unknown>;
  messages: { role: string; content: string }[];
  updatedAt: string;
}

function getOutfitterSession(): OutfitterSession | null {
  try {
    const raw = localStorage.getItem("rv_outfitter_session");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function submitLead(params: {
  listing: { id: number; title?: string; make?: string; model?: string; year?: number; price?: number; type?: string; dealerId?: unknown; dealer?: { name?: string; city?: string; state?: string } };
  message?: string;
  leadSource: string;
  outfitterSession: OutfitterSession | null;
  BASE: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  smsOptIn?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { listing, message, leadSource, outfitterSession, BASE, contactName, contactEmail, contactPhone, smsOptIn } = params;
  const buyerProfile = buildLeadBuyerProfile(outfitterSession?.profile ?? {}, {
    leadSource,
    smsOptIn: smsOptIn ?? false,
  });
  const intentSessionId = typeof buyerProfile.sessionId === "string" ? buyerProfile.sessionId : null;
  try {
    const res = await fetch(`${BASE}api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: outfitterSession?.sessionId ?? intentSessionId,
        listingId: listing.id,
        dealerId: listing.dealerId ?? null,
        listingSnapshot: {
          title: listing.title,
          make: listing.make,
          model: listing.model,
          year: listing.year,
          price: listing.price,
          type: listing.type,
          dealerName: listing.dealer?.name,
          dealerCity: listing.dealer?.city,
          dealerState: listing.dealer?.state,
        },
        buyerProfile,
        conversation: outfitterSession?.messages ?? [],
        message: message ?? null,
        contactName: contactName ?? null,
        contactEmail: contactEmail ?? null,
        contactPhone: contactPhone ?? null,
        smsOptIn: smsOptIn ?? false,
        leadSource,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "Lead submission failed");
      return { ok: false, error: text.slice(0, 200) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

const BASE = import.meta.env.BASE_URL || "/";

const QUICK_MESSAGES = [
  "Is this still available?",
  "I'd like to schedule a walk-through",
  "What financing options do you offer?",
];

export function ListingDetail() {
  const [, params] = useRoute("/listing/:id");
  const listingId = parseInt(params?.id || "0");
  const { data: listing, isLoading } = useGetListing(listingId, { query: { enabled: !!listingId, queryKey: ["/api/listing", listingId] } });
  const towMutation = useTowMatch();
  const [towForm, setTowForm] = useState({ make: "", model: "", year: "" });
  const [towResult, setTowResult] = useState<TowMatchResponse | null>(null);
  const trackedView = useRef(false);
  const savedLeadFired = useRef(false);
  const { isAuthenticated, isSaved, toggleSave, login, user } = useAppAuth();
  const [contactMsg, setContactMsg] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const [isContactSubmitting, setIsContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [alertPrice, setAlertPrice] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertSet, setAlertSet] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const contactFormRef = useRef<HTMLDivElement>(null);
  const [isContactFormVisible, setIsContactFormVisible] = useState(false);

  // Email capture slide-up drawer state
  const [showEmailDrawer, setShowEmailDrawer] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const emailDrawerShownRef = useRef(false);

  useEffect(() => {
    if (listing && !trackedView.current) {
      trackedView.current = true;
      recordBuyerIntent("listing_view", {
        listingId: listing.id,
        dealerId: listing.dealerId as number,
        metadata: {
          title: listing.title,
          make: listing.make,
          model: listing.model,
          year: listing.year,
          type: listing.type,
          price: listing.price,
          location: listing.location,
          dealerName: listing.dealer?.name,
          dealerCity: listing.dealer?.city,
          dealerState: listing.dealer?.state,
        },
      });
    }
  }, [listing]);

  // Reset gallery to the first photo when navigating between listings
  useEffect(() => {
    setActivePhoto(0);
  }, [listing?.id]);

  // Contact form visibility observer (for hiding sticky CTA when form in view)
  useEffect(() => {
    const el = contactFormRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsContactFormVisible(entry.isIntersecting),
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [listing]);

  // Email capture trigger: 12s timer or 60% scroll for logged-out users
  useEffect(() => {
    if (!listing || isAuthenticated) return;
    const dismissed = localStorage.getItem("price_alert_dismissed");
    if (dismissed || emailDrawerShownRef.current) return;

    let timer: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      const scrollPct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      if (scrollPct >= 0.6 && !emailDrawerShownRef.current) {
        emailDrawerShownRef.current = true;
        setShowEmailDrawer(true);
        clearTimeout(timer);
      }
    };

    timer = setTimeout(() => {
      if (!emailDrawerShownRef.current) {
        emailDrawerShownRef.current = true;
        setShowEmailDrawer(true);
      }
    }, 12000);

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [listing, isAuthenticated]);

  const dismissEmailDrawer = () => {
    setShowEmailDrawer(false);
    localStorage.setItem("price_alert_dismissed", "1");
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    try {
      const res = await fetch(`${BASE}api/price-alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput,
          listingId: listing?.id,
          listingType: listing?.type,
          buyerProfile: buildLeadBuyerProfile({}, { leadSource: "price_alert_email" }),
        }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      return;
    }
    setEmailSubmitted(true);
    localStorage.setItem("price_alert_dismissed", "1");
    setTimeout(() => setShowEmailDrawer(false), 2000);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="bg-background border-b border-[#E2E8F0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5">
            <div className="h-4 w-24 bg-[#E2E8F0] rounded animate-pulse mb-4" />
            <div className="h-8 w-2/3 bg-[#E2E8F0] rounded animate-pulse mb-3" />
            <div className="h-4 w-40 bg-[#E2E8F0] rounded animate-pulse" />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="aspect-[16/10] rounded-[2rem] bg-[#E2E8F0] animate-pulse" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-[#E2E8F0] animate-pulse" />)}
              </div>
              <div className="h-40 rounded-2xl bg-[#E2E8F0] animate-pulse" />
            </div>
            <div className="space-y-4">
              <div className="h-64 rounded-2xl bg-[#E2E8F0] animate-pulse" />
              <div className="h-40 rounded-2xl bg-[#E2E8F0] animate-pulse" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!listing) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#eef5f4] flex items-center justify-center mx-auto mb-6">
            <Search className="w-10 h-10 text-[#6b7a7a]" />
          </div>
          <h1 className="font-display font-black text-3xl text-[#161d1d] mb-3">Listing Not Found</h1>
          <p className="text-[#3b4949] mb-8 max-w-md mx-auto">
            This listing may have sold or been removed. Browse our current inventory to find your perfect RV.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => window.history.back()}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border-2 border-[#E2E8F0] text-[#161d1d] font-bold text-sm hover:bg-[#eef5f4] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Go Back
            </button>
            <a
              href="/browse"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#0B1117] text-white font-bold text-sm hover:bg-[#002829] transition-colors"
            >
              Browse All RVs
            </a>
          </div>
        </div>
      </Layout>
    );
  }

  const dealInfo = getDealScoreInfo(listing.dealScore);
  const chip = DEAL_CHIP[listing.dealScore] ?? DEAL_CHIP.fair_deal;
  const photos = cleanListingImages(listing.images);
  const safePhoto = photos.length ? Math.min(activePhoto, photos.length - 1) : 0;
  const chartData = listing.priceHistory?.flatMap(p => {
    const d = new Date(p.date);
    if (!p.date || isNaN(d.getTime())) return [];
    return [{ date: format(d, "MMM d"), price: p.price }];
  }) ?? [];

  const listingUrl = typeof window !== "undefined"
    ? `${window.location.origin}${import.meta.env.BASE_URL}listing/${listing.id}`
    : `https://matchrv.com/listing/${listing.id}`;

  const siteOrigin = typeof window !== "undefined"
    ? `${window.location.origin}${import.meta.env.BASE_URL}`
    : "https://matchrv.com/";

  const vehicleSchema = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    "name": listing.title,
    "description": listing.description || `${listing.year} ${listing.make} ${listing.model}, a ${formatRvType(listing.type)} for sale on MatchRV.`,
    "image": photos[0],
    "brand": {
      "@type": "Brand",
      "name": listing.make
    },
    "model": listing.model,
    "modelDate": String(listing.year),
    "vehicleCondition": listing.condition === "new"
      ? "https://schema.org/NewCondition"
      : "https://schema.org/UsedCondition",
    "offers": {
      "@type": "Offer",
      "price": listing.price,
      "priceCurrency": "USD",
      "itemCondition": listing.condition === "new"
        ? "https://schema.org/NewCondition"
        : "https://schema.org/UsedCondition",
      "availability": "https://schema.org/InStock",
      "url": listingUrl,
      "seller": listing.dealer
        ? { "@type": "AutoDealer", "name": listing.dealer.name }
        : undefined
    }
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": siteOrigin
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Browse RVs",
        "item": `${siteOrigin}browse`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": listing.title,
        "item": listingUrl
      }
    ]
  };

  const handleTowCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!towForm.make || !towForm.model || !towForm.year) return;
    try {
      const res = await towMutation.mutateAsync({
        data: {
          vehicleMake: towForm.make,
          vehicleModel: towForm.model,
          vehicleYear: parseInt(towForm.year),
          listingId: listing.id,
        },
      });
      setTowResult(res);
      trackEvent("tow_check", { listingId: listing.id, dealerId: listing.dealerId as number, metadata: { canTow: res.canTow } });
      recordBuyerIntent("tow_check", {
        listingId: listing.id,
        dealerId: listing.dealerId as number,
        metadata: { canTow: res.canTow },
        sendAnalytics: false,
      });
    } catch (e) { console.error(e); }
  };

  const savingsPercent = listing.dealSavings && listing.marketValue
    ? Math.round((listing.dealSavings / listing.marketValue) * 100)
    : 0;

  const listingDescription = `${listing.condition === "new" ? "New" : "Used"} ${listing.year} ${listing.make} ${listing.model} ${formatRvType(listing.type)} for sale${listing.location ? ` in ${listing.location}` : ""}. ${listing.price ? `Priced at $${listing.price.toLocaleString()}.` : ""} ${listing.description ? listing.description.slice(0, 100) + "…" : "View photos, specs, and deal score on MatchRV."}`.slice(0, 160);

  return (
    <Layout>
      <SEO
        title={`${listing.year} ${listing.make} ${listing.model} for Sale`}
        description={listingDescription}
        canonical={listingUrl}
        ogImage={photos[0]}
        jsonLd={[vehicleSchema, breadcrumbSchema]}
      />
      {/* Header breadcrumb */}
      <div className="bg-background border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-1.5 text-sm font-bold text-[#3b4949] hover:text-[#0B1117] transition-colors mb-3"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Search
            </button>
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-xs font-black uppercase tracking-widest text-[#924c00]">
                {listing.year} · {formatRvType(listing.type)}
              </span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${chip.bg} ${chip.text}`}>
                {listing.condition === "new" ? "New" : "Used"}
              </span>
            </div>
            <h1 className="font-display font-black text-2xl md:text-3xl text-[#161d1d] leading-tight tracking-tight cursor-default select-none">
              {listing.title}
            </h1>
            <div className="flex items-center gap-1.5 text-sm text-[#3b4949] mt-2">
              <MapPin className="w-4 h-4 text-[#00696b]" />
              {listing.location} · {listing.daysOnMarket} days on market
            </div>
          </div>

          <div className="text-left md:text-right">
            <div className="font-display font-black text-4xl text-[#0B1117] tracking-tight">
              {formatCurrency(listing.price)}
            </div>
            <div className="flex items-center md:justify-end gap-2 mt-1">
              <span className="text-sm text-[#3b4949] line-through">{formatCurrency(listing.marketValue)} Est.</span>
              <span className={`text-xs font-black px-3 py-1 rounded ${chip.bg} ${chip.text}`}>
                {dealInfo.label}
              </span>
            </div>

            {/* Trust badges row */}
            <div className="flex flex-wrap items-center md:justify-end gap-2 mt-3">
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded">
                <Zap className="w-3 h-3" /> Live Listing
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded">
                <Star className="w-3 h-3" /> Deal Scored
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide bg-purple-50 text-purple-700 border border-purple-200 px-2 py-1 rounded">
                <BadgeCheck className="w-3 h-3" /> AI Matched
              </span>
              {savingsPercent > 0 ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded">
                  <Tag className="w-3 h-3" /> {savingsPercent}% Below Market
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded">
                  <ShieldCheck className="w-3 h-3" /> No Hidden Fees
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* ── LEFT COLUMN ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Gallery */}
            {photos.length > 0 ? (
              <div className="rounded-[2rem] overflow-hidden relative bg-[#161d1d] aspect-[16/10]">
                <img
                  src={photos[safePhoto]}
                  alt={listing.title}
                  width={1280}
                  height={800}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                {/* Nav arrows */}
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={() => setActivePhoto(p => (p - 1 + photos.length) % photos.length)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white transition shadow-lg"
                    >
                      <ChevronLeft className="w-5 h-5 text-[#161d1d]" />
                    </button>
                    <button
                      onClick={() => setActivePhoto(p => (p + 1) % photos.length)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white transition shadow-lg"
                    >
                      <ChevronRight className="w-5 h-5 text-[#161d1d]" />
                    </button>
                  </>
                )}

                {/* Photo count */}
                <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur text-white px-3 py-1.5 rounded-xl text-xs font-bold">
                  {safePhoto + 1} / {photos.length}
                </div>
              </div>
            ) : (
              <div className="rounded-[2rem] overflow-hidden relative bg-[#eef5f4] aspect-[16/10] flex flex-col items-center justify-center text-center px-6">
                <ImageOff className="w-10 h-10 text-[#6b7a7a] mb-3" />
                <div className="font-bold text-[#161d1d]">Photos coming soon</div>
                <div className="text-sm text-[#3b4949] mt-1 max-w-xs">Contact the dealer for current photos of this RV.</div>
              </div>
            )}

            {/* Thumbnail strip */}
            {photos.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {photos.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePhoto(i)}
                    className={`flex-shrink-0 w-20 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                      i === safePhoto ? "border-[#0B1117] scale-105" : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Key specs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SpecItem label="Length" value={listing.length ? `${listing.length} ft` : "Not listed"} />
              <SpecItem label="Sleeps" value={listing.sleeps ?? "Not listed"} />
              <SpecItem label="Slides" value={listing.slides ?? 0} />
              <SpecItem label="Dry Weight" value={listing.dryWeight ? `${formatNumber(listing.dryWeight)} lbs` : "Not listed"} />
            </div>

            {/* Price analysis */}
            <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="font-display font-black text-xl text-[#161d1d] cursor-default select-none">Price Analysis</h3>
                  <p className="text-sm text-[#3b4949] mt-0.5">Powered by real-time market data</p>
                </div>
                <div className={`px-4 py-2 rounded-xl text-center ${chip.bg} ${chip.text}`}>
                  <div className="text-[10px] uppercase tracking-wider font-black mb-0.5">Rating</div>
                  <div className="font-black text-lg leading-none">{dealInfo.label}</div>
                </div>
              </div>

              {listing.dealSavings && listing.dealSavings > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-5 mb-6 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">You're saving {formatCurrency(listing.dealSavings)}</div>
                    <p className="text-sm mt-1 opacity-80">
                      Priced {formatCurrency(listing.dealSavings)} below average market for a {listing.year} {listing.make} in similar condition.
                    </p>
                  </div>
                </div>
              )}

              {chartData.length > 1 && (
                <div>
                  <h4 className="font-black text-xs uppercase tracking-widest text-[#3b4949] mb-4">Price History</h4>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#3b4949" }} dy={8} />
                        <YAxis domain={["dataMin - 1000", "dataMax + 1000"]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#3b4949" }} tickFormatter={v => `$${v / 1000}k`} />
                        <RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Price"]} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }} />
                        <Line type="monotone" dataKey="price" stroke="#0B1117" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: "#fff", stroke: "#0B1117" }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            {listing.description && (
              <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-8">
                <h3 className="font-display font-black text-xl text-[#161d1d] mb-4 cursor-default select-none">About This RV</h3>
                <p className="text-[#3b4949] leading-relaxed whitespace-pre-line">{listing.description}</p>
              </div>
            )}

            {/* Features */}
            {listing.features && listing.features.length > 0 && (
              <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-8">
                <h3 className="font-display font-black text-xl text-[#161d1d] mb-6 cursor-default select-none">Included Amenities</h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {listing.features.map(f => (
                    <li key={f} className="flex items-center gap-3 text-[#161d1d] text-sm">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-emerald-700" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 3D Dimension Viewer */}
            {listing.length && listing.widthFt && listing.heightFt && (
              <RvDimensionViewer
                lengthFt={listing.length}
                widthFt={listing.widthFt}
                heightFt={listing.heightFt}
                rvType={listing.type}
              />
            )}

            {/* AR Driveway Fit — QR on desktop, link on mobile */}
            {(() => {
              const arParams = new URLSearchParams();
              if (listing.length) arParams.set("length", String(listing.length));
              if (listing.widthFt) arParams.set("width", String(listing.widthFt));
              if (listing.heightFt) arParams.set("height", String(listing.heightFt));
              arParams.set("name", `${listing.year ?? ""} ${listing.make ?? ""} ${listing.model ?? ""}`.trim() || listing.title);
              const base = typeof window !== "undefined" ? `${window.location.origin}${import.meta.env.BASE_URL}` : "";
              const arUrl = `${base}ar?${arParams.toString()}`;
              return (
                <div className="bg-[#0B1117] rounded-2xl p-6">
                  {/* Desktop: show QR */}
                  <div className="hidden md:flex items-center gap-6">
                    <div className="bg-white rounded-xl p-3 flex-shrink-0">
                      <QRCodeSVG
                        value={arUrl}
                        size={96}
                        fgColor="#0B1117"
                        bgColor="#ffffff"
                        level="M"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Smartphone className="w-4 h-4 text-[#00CED1]" />
                        <span className="text-[#00CED1] text-xs font-black uppercase tracking-widest">View on Your Phone</span>
                      </div>
                      <h4 className="text-white font-display font-black text-lg leading-tight mb-1">
                        AR Driveway Fit Check
                      </h4>
                      <p className="text-white/70 text-sm leading-relaxed">
                        Scan with your phone's camera to place this RV at life-size scale in your actual driveway using augmented reality.
                      </p>
                    </div>
                  </div>
                  {/* Mobile: direct link */}
                  <div className="md:hidden text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Smartphone className="w-4 h-4 text-[#00CED1]" />
                      <span className="text-[#00CED1] text-xs font-black uppercase tracking-widest">AR Experience</span>
                    </div>
                    <h4 className="text-white font-display font-black text-lg leading-tight mb-1">
                      AR Driveway Fit Check
                    </h4>
                    <p className="text-white/70 text-sm mb-4">
                      Place this RV at life-size scale in your actual driveway.
                    </p>
                    <a
                      href={arUrl}
                      className="inline-block bg-white text-[#0B1117] font-black px-6 py-3 rounded text-sm hover:bg-[#00CED1] transition"
                    >
                      Open AR Driveway Viewer →
                    </a>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── ACTION CARD COLUMN ── */}
          <div className="space-y-5">

            {/* Sticky action card */}
            <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-6 shadow-xl sticky top-24">
              <div className="text-center mb-6">
                <div className="font-display font-black text-4xl text-[#0B1117] tracking-tight">
                  {formatCurrency(listing.price)}
                </div>
                <p className="text-xs text-[#3b4949] mt-1">Excludes tax, title, and license</p>
              </div>

              <div className="space-y-3">
                <button
                  className="w-full py-4 rounded-2xl bg-[#924c00] text-white font-black text-base hover:bg-[#6f3800] transition-colors"
                  onClick={() => {
                    recordBuyerIntent("contact_open", { listingId: listing.id, dealerId: listing.dealerId as number });
                    document.getElementById("contact-dealer-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  Contact Dealer
                </button>
                <button className="w-full py-3.5 rounded-2xl border-2 border-[#E2E8F0] text-[#161d1d] font-bold text-sm hover:border-[#0B1117] transition-colors">
                  Calculate Payments
                </button>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => {
                    if (!isAuthenticated) { login(); return; }
                    toggleSave(listing.id);
                    // Capture "saved" lead on first save
                    if (!isSaved(listing.id) && !savedLeadFired.current) {
                      savedLeadFired.current = true;
                      recordBuyerIntent("listing_save", { listingId: listing.id, dealerId: listing.dealerId as number });
                      submitLead({ listing, leadSource: "saved_listing", outfitterSession: getOutfitterSession(), BASE });
                    }
                  }}
                  className={`flex-1 py-3 rounded-2xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                    isSaved(listing.id)
                      ? "border-red-200 bg-red-50 text-red-600"
                      : "border-[#E2E8F0] text-[#161d1d] hover:border-[#0B1117]"
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isSaved(listing.id) ? "fill-red-500 text-red-500" : ""}`} />
                  {isSaved(listing.id) ? "Saved" : "Save"}
                </button>
                <button
                  onClick={() => {
                    if (alertSet) return;
                    setAlertEmail(user?.email ?? "");
                    setAlertPrice(String(Math.round(listing.price * 0.9)));
                  }}
                  className={`flex-1 py-3 rounded-2xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                    alertSet ? "border-[#0B1117] bg-[#0B1117]/5 text-[#0B1117]" : "border-[#E2E8F0] text-[#161d1d] hover:border-[#0B1117]"
                  }`}
                >
                  <Bell className="w-4 h-4" />
                  {alertSet ? "Alert Set" : "Price Alert"}
                </button>
              </div>

              {alertPrice && !alertSet && (
                <div className="mt-4 p-4 bg-[#eef5f4] rounded-2xl space-y-3">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-[#3b4949] block mb-2">
                      Alert me when price drops to:
                    </label>
                    <Input
                      type="number"
                      value={alertPrice}
                      onChange={(e) => setAlertPrice(e.target.value)}
                      className="w-full rounded-xl border-[#E2E8F0]"
                    />
                  </div>
                  {!isAuthenticated && (
                    <div>
                      <label className="text-xs font-black uppercase tracking-wider text-[#3b4949] block mb-2">
                        Where should we send it?
                      </label>
                      <Input
                        type="email"
                        value={alertEmail}
                        onChange={(e) => setAlertEmail(e.target.value)}
                        placeholder="you@email.com"
                        className="w-full rounded-xl border-[#E2E8F0]"
                      />
                    </div>
                  )}
                  <button
                    disabled={alertSubmitting || (!isAuthenticated && !alertEmail.includes("@"))}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#0B1117] text-white text-sm font-bold hover:bg-[#002829] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={async () => {
                      const target = parseFloat(alertPrice);
                      if (!target || target <= 0) return;
                      setAlertSubmitting(true);
                      try {
                        if (isAuthenticated) {
                          const r = await fetch("/api/user/alerts", {
                            method: "POST", credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ listingId: listing.id, targetPrice: target }),
                          });
                          if (!r.ok) throw new Error();
                        } else {
                          const profile = buildLeadBuyerProfile({}, { leadSource: "price_alert" });
                          const r = await fetch("/api/price-alerts", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              email: alertEmail.trim(),
                              listingId: listing.id,
                              listingType: listing.type,
                              buyerProfile: { ...profile, targetPrice: target },
                            }),
                          });
                          if (!r.ok) throw new Error();
                        }
                        setAlertSet(true);
                        setAlertPrice("");
                        setAlertEmail("");
                      } catch {
                        // keep the form open so the user can retry
                      } finally {
                        setAlertSubmitting(false);
                      }
                    }}
                  >
                    {alertSubmitting ? "Setting alert..." : "Set price alert"}
                  </button>
                </div>
              )}

              {/* Dealer */}
              {listing.dealer && (
                <div className="mt-6 pt-6 border-t border-[#E2E8F0]">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#3b4949] mb-4">Offered By</div>
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#0B1117] flex items-center justify-center font-black text-xl text-white flex-shrink-0">
                      {listing.dealer.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-[#161d1d]">{listing.dealer.name}</div>
                      <div className="text-xs text-[#3b4949]">{listing.dealer.city}, {listing.dealer.state}</div>
                      <div className="text-xs font-bold text-amber-600 mt-0.5">
                        ★ {listing.dealer.rating?.toFixed(1)} · {listing.dealer.reviewCount} reviews
                      </div>
                    </div>
                  </div>

                  <div className="mt-5" id="contact-dealer-form" ref={contactFormRef}>
                    {/* Why MatchRV? objection handling */}
                    <div className="mb-4 p-4 bg-[#eef5f4] rounded-2xl border border-[#E2E8F0]">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[#924c00] mb-1.5">Why MatchRV?</div>
                      <p className="text-xs text-[#3b4949] leading-relaxed">
                        We verify every listing is active before it's shown. No bait-and-switch, no stale photos.
                        Dealers on MatchRV respond within hours, not days.
                      </p>
                    </div>

                    {contactSent ? (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm flex items-center gap-2">
                        <Check className="w-4 h-4" /> Message sent to {listing.dealer.name}
                      </div>
                    ) : (
                      <>
                        {/* Guest contact fields — shown when not signed in */}
                        {!isAuthenticated && (
                          <div className="space-y-2 mb-3">
                            <input
                              type="text"
                              placeholder="Your name"
                              value={guestName}
                              onChange={e => setGuestName(e.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl border-2 border-[#E2E8F0] bg-white text-sm focus:outline-none focus:border-[#00696b] text-[#161d1d] placeholder:text-[#6b7a7a]"
                            />
                            <input
                              type="email"
                              placeholder="Your email"
                              value={guestEmail}
                              onChange={e => setGuestEmail(e.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl border-2 border-[#E2E8F0] bg-white text-sm focus:outline-none focus:border-[#00696b] text-[#161d1d] placeholder:text-[#6b7a7a]"
                            />
                            <input
                              type="tel"
                              placeholder="Phone (optional)"
                              value={guestPhone}
                              onChange={e => setGuestPhone(e.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl border-2 border-[#E2E8F0] bg-white text-sm focus:outline-none focus:border-[#00696b] text-[#161d1d] placeholder:text-[#6b7a7a]"
                            />
                            {guestPhone.trim() && (
                              <label className="flex items-start gap-2.5 px-1 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={smsOptIn}
                                  onChange={e => setSmsOptIn(e.target.checked)}
                                  className="mt-0.5 w-4 h-4 accent-[#0B1117] shrink-0 cursor-pointer"
                                />
                                <span className="text-xs text-[#3b4949] leading-relaxed">
                                  Text me updates about this RV and matches from MatchRV. Message &amp; data rates may apply. Reply STOP to opt out at any time.{" "}
                                  <a href="/privacy" className="underline hover:text-[#0B1117]" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                                </span>
                              </label>
                            )}
                          </div>
                        )}

                        {/* Quick-message prompt chips */}
                        <div className="flex flex-col gap-2 mb-3">
                          <div className="text-[10px] font-black uppercase tracking-widest text-[#3b4949] mb-0.5">Quick questions:</div>
                          {QUICK_MESSAGES.map(msg => (
                            <button
                              key={msg}
                              onClick={() => setContactMsg(msg)}
                              className={`text-left px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                                contactMsg === msg
                                  ? "border-[#0B1117] bg-[#0B1117]/5 text-[#0B1117]"
                                  : "border-[#E2E8F0] text-[#3b4949] hover:border-[#00696b] hover:text-[#0B1117]"
                              }`}
                            >
                              {msg}
                            </button>
                          ))}
                        </div>

                        <textarea
                          placeholder={`Ask ${listing.dealer.name} about this ${listing.year} ${listing.make}…`}
                          value={contactMsg}
                          onChange={(e) => setContactMsg(e.target.value)}
                          className="w-full min-h-[80px] p-4 rounded-2xl border-2 border-[#E2E8F0] bg-white text-sm resize-none focus:outline-none focus:border-[#00696b] text-[#161d1d] placeholder:text-[#6b7a7a]"
                        />
                        <button
                          disabled={
                            !contactMsg.trim() ||
                            (!isAuthenticated && (!guestName.trim() || !guestEmail.trim())) ||
                            isContactSubmitting
                          }
                          className="w-full mt-2 py-3.5 rounded-2xl bg-[#0B1117] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#002829] transition-colors disabled:opacity-40"
                          onClick={async () => {
                            setIsContactSubmitting(true);
                            setContactError(null);
                            try {
                              if (!isAuthenticated) {
                                const { ok, error } = await submitLead({
                                  listing,
                                  message: contactMsg,
                                  leadSource: "contact_dealer",
                                  outfitterSession: getOutfitterSession(),
                                  BASE,
                                  contactName: guestName.trim(),
                                  contactEmail: guestEmail.trim(),
                                  contactPhone: guestPhone.trim() || undefined,
                                  smsOptIn: guestPhone.trim() ? smsOptIn : false,
                                });
                                if (ok) {
                                  recordBuyerIntent("dealer_contact", { listingId: listing.id, dealerId: listing.dealerId as number });
                                  setContactSent(true);
                                  setContactMsg("");
                                  setGuestName("");
                                  setGuestEmail("");
                                  setGuestPhone("");
                                } else {
                                  setContactError(error ?? "Unable to send message. Please try again.");
                                }
                                return;
                              }
                              const r = await fetch(`${BASE}api/user/messages`, {
                                method: "POST", credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ dealerId: listing.dealerId, listingId: listing.id, body: contactMsg }),
                              });
                              if (!r.ok) {
                                setContactError("Unable to send message. Please try again.");
                                return;
                              }
                              const { ok, error } = await submitLead({
                                listing,
                                message: contactMsg,
                                leadSource: "contact_dealer",
                                outfitterSession: getOutfitterSession(),
                                BASE,
                                contactName: user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || null : null,
                                contactEmail: user?.email ?? null,
                              });
                              if (ok) {
                                recordBuyerIntent("dealer_contact", { listingId: listing.id, dealerId: listing.dealerId as number });
                                setContactSent(true);
                                setContactMsg("");
                              } else {
                                setContactError(error ?? "Lead saved, but dealer notification failed. Please try again.");
                              }
                            } finally {
                              setIsContactSubmitting(false);
                            }
                          }}
                        >
                          {isContactSubmitting ? (
                            <span className="animate-pulse">Sending…</span>
                          ) : (
                            <>
                              <Send className="w-4 h-4" /> Contact Dealer
                            </>
                          )}
                        </button>
                        {contactError && (
                          <p className="mt-2 text-sm text-red-600 flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4" /> {contactError}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ── TOW CHECK COLUMN ── */}
          <div className="hidden lg:block self-start sticky top-24">
            <div className="bg-[#0B1117] text-white rounded-[2rem] p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                {["class_a", "class_b", "class_c"].includes(listing.type)
                  ? <Car className="w-20 h-20" />
                  : <Truck className="w-20 h-20" />}
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-[#93d5ad]" />
                  <h3 className="font-display font-black text-base leading-tight">
                    {["class_a", "class_b", "class_c"].includes(listing.type) ? "Dinghy Tow" : "Tow Match"}
                  </h3>
                </div>

                {["class_a", "class_b", "class_c"].includes(listing.type) ? (
                  <>
                    <p className="text-xs text-white/70 mb-4 leading-relaxed">
                      This motorhome can flat-tow a vehicle for errands and day trips.
                    </p>
                    <div className="bg-black/20 rounded-2xl p-3">
                      <div className="text-[10px] text-white/50 uppercase tracking-wider mb-0.5">Typical Tow Rating</div>
                      <div className="font-black text-lg">
                        {listing.hitchWeight
                          ? `${formatNumber(listing.hitchWeight)} lbs`
                          : listing.type === "class_a" ? "Up to 10,000 lbs"
                          : listing.type === "class_b" ? "Up to 5,000 lbs"
                          : "Up to 8,000 lbs"}
                      </div>
                      <div className="text-[10px] text-white/40 mt-0.5">Verify with dealer</div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-white/70 mb-4 leading-relaxed">
                      Check if your vehicle can safely tow this {listing.length ? `${listing.length}' ` : ""}{listing.make}.
                    </p>
                    {towResult ? (
                      <div className={`p-3 rounded-2xl ${towResult.canTow ? "bg-green-500/20 border border-green-500/30" : "bg-red-500/20 border border-red-500/30"}`}>
                        <div className="flex items-start gap-2">
                          {towResult.canTow
                            ? <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                            : <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
                          <div>
                            <div className={`font-bold text-sm ${towResult.canTow ? "text-green-300" : "text-red-300"}`}>
                              {towResult.canTow ? "Safe to Tow!" : "Not Recommended"}
                            </div>
                            <p className="text-xs text-white/80 mt-1 leading-relaxed">{towResult.notes}</p>
                            <button
                              className="mt-2 text-xs font-bold text-white/60 hover:text-white underline"
                              onClick={() => setTowResult(null)}
                            >
                              Check Another
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleTowCheck} className="space-y-2">
                        {[
                          { ph: "Year", key: "year" },
                          { ph: "Make (e.g. Ford)", key: "make" },
                          { ph: "Model (e.g. F-150)", key: "model" },
                        ].map(({ ph, key }) => (
                          <Input
                            key={key}
                            placeholder={ph}
                            className="bg-black/20 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/20 rounded-xl text-sm"
                            value={towForm[key as keyof typeof towForm]}
                            onChange={e => setTowForm({ ...towForm, [key]: e.target.value })}
                          />
                        ))}
                        <button
                          type="submit"
                          className="w-full py-3 rounded-2xl bg-[#00CED1] text-[#0B1117] font-black text-sm hover:bg-[#93d5ad] transition-colors"
                          disabled={towMutation.isPending}
                        >
                          {towMutation.isPending ? "Verifying…" : "Verify Tow"}
                        </button>
                      </form>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Driveway Fit Checker — below green box */}
            <div className="mt-4">
              <DrivewayFitChecker listing={listing} />
            </div>
          </div>
        </div>
      </div>

      {/* ── STICKY MOBILE CTA BAR ── */}
      {!isContactFormVisible && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl shadow-black/20 flex gap-3 p-3">
            <button
              onClick={() => {
                document.getElementById("contact-dealer-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="flex-1 py-3 rounded-xl bg-[#924c00] text-white font-black text-sm hover:bg-[#6f3800] transition-colors"
            >
              Contact Dealer
            </button>
            <button
              onClick={() => {
                if (!isAuthenticated) { login(); return; }
                toggleSave(listing.id);
                if (!isSaved(listing.id) && !savedLeadFired.current) {
                  savedLeadFired.current = true;
                  recordBuyerIntent("listing_save", { listingId: listing.id, dealerId: listing.dealerId as number });
                  submitLead({ listing, leadSource: "saved_listing", outfitterSession: getOutfitterSession(), BASE });
                }
              }}
              className={`px-4 py-3 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                isSaved(listing.id)
                  ? "border-red-200 bg-red-50 text-red-600"
                  : "border-[#E2E8F0] text-[#161d1d] hover:border-[#0B1117]"
              }`}
            >
              <Heart className={`w-4 h-4 ${isSaved(listing.id) ? "fill-red-500 text-red-500" : ""}`} />
              {isSaved(listing.id) ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* ── EMAIL CAPTURE SLIDE-UP DRAWER (desktop only — mobile has sticky CTA bar) ── */}
      {showEmailDrawer && (
        <div className="hidden md:block fixed inset-x-0 bottom-0 z-50 lg:bottom-8 lg:right-8 lg:left-auto lg:w-96">
          <div className="bg-white border border-[#E2E8F0] rounded-t-3xl lg:rounded-3xl shadow-2xl shadow-black/25 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#0B1117] flex items-center justify-center">
                  <Bell className="w-4 h-4 text-[#00CED1]" />
                </div>
                <div>
                  <div className="font-black text-[#161d1d] text-sm">Get price alerts</div>
                  <div className="text-xs text-[#3b4949]">for similar RVs</div>
                </div>
              </div>
              <button
                onClick={dismissEmailDrawer}
                className="p-1.5 rounded-full hover:bg-[#eef5f4] transition-colors"
              >
                <X className="w-4 h-4 text-[#3b4949]" />
              </button>
            </div>

            {emailSubmitted ? (
              <div className="flex items-center gap-2 py-3 text-emerald-700">
                <Check className="w-5 h-5" />
                <span className="font-bold text-sm">You're on the list!</span>
              </div>
            ) : (
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3b4949]" />
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full pl-9 pr-4 py-3 rounded-xl border-2 border-[#E2E8F0] bg-white text-sm focus:outline-none focus:border-[#00696b] text-[#161d1d] placeholder:text-[#6b7a7a]"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#0B1117] text-white font-bold text-sm hover:bg-[#002829] transition-colors"
                >
                  Notify Me of Similar RVs
                </button>
                <p className="text-[10px] text-[#3b4949] text-center">No spam. Unsubscribe anytime.</p>
              </form>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
