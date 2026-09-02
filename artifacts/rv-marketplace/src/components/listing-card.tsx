import { Link } from "wouter";
import { useState } from "react";
import { MapPin, Maximize2, BedDouble, Calendar, Heart, ArrowRight } from "lucide-react";
import type { Listing } from "@workspace/api-client-react";
import { formatCurrency, getDealScoreInfo, formatRvType } from "@/lib/utils";
import { useAppAuth } from "@/contexts/auth-context";

const DEAL_PILL: Record<string, string> = {
  great_deal: "bg-emerald-100 text-emerald-900",
  good_deal:  "bg-green-100 text-green-800",
  fair_deal:  "bg-amber-100 text-amber-800",
  high_price: "bg-orange-100 text-orange-800",
  overpriced: "bg-red-100 text-red-800",
};

export function ListingCard({ listing }: { listing: Listing }) {
  const dealInfo = getDealScoreInfo(listing.dealScore);
  const { isAuthenticated, isSaved, toggleSave, login } = useAppAuth();
  const saved = isSaved(listing.id);
  const primaryImage = listing.images?.[0] || null;
  const [imgSrc, setImgSrc] = useState(primaryImage);
  const [imgLoaded, setImgLoaded] = useState(false);

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) { login(); return; }
    toggleSave(listing.id);
  };

  return (
    <Link href={`/listing/${listing.id}`}>
      <div className="group bg-white rounded-[1.5rem] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col h-full border border-[#E2E8F0]">
        <div className="relative aspect-[4/3] overflow-hidden bg-[#eef5f4]">
          {imgSrc ? (
            <>
              {!imgLoaded && <div className="absolute inset-0 bg-[#E2E8F0] animate-pulse" />}
              <img
                src={imgSrc}
                alt={listing.title}
                loading="lazy"
                width={400}
                height={300}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgSrc(null)}
                className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              />
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#eef5f4]">
              <div className="w-16 h-10 rounded-lg bg-[#bac9c9]/60 flex items-center justify-center">
                <svg width="32" height="20" viewBox="0 0 32 20" fill="none" className="text-[#6b7a7a]">
                  <rect x="2" y="5" width="28" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="0" y="8" width="4" height="6" rx="1" fill="currentColor" opacity="0.4"/>
                  <circle cx="8" cy="17" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <circle cx="24" cy="17" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
              </div>
              <span className="text-xs text-[#6b7a7a] font-medium">No photo</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

          <div className={`absolute top-3 left-3 px-3 py-1 rounded text-xs font-bold tracking-wide ${DEAL_PILL[listing.dealScore] ?? DEAL_PILL.fair_deal}`}>
            {dealInfo.label}
          </div>

          <button
            onClick={handleSave}
            className="absolute top-3 right-3 p-2 rounded-full bg-white/80 backdrop-blur hover:bg-white transition-all shadow-sm"
          >
            <Heart className={`w-4 h-4 ${saved ? "fill-red-500 text-red-500" : "text-[#3b4949]"}`} />
          </button>

          {listing.dealSavings && listing.dealSavings > 0 && (
            <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-bold text-[#0B1117] shadow-sm">
              Save {formatCurrency(listing.dealSavings)}
            </div>
          )}
        </div>

        <div className="p-5 flex flex-col flex-grow">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#924c00] mb-1">
            {formatRvType(listing.type)}
          </div>
          <h3 className="font-display font-bold text-[#161d1d] text-base leading-snug line-clamp-2 mb-3 group-hover:text-[#0B1117] transition-colors">
            {listing.title}
          </h3>

          <div className="mt-auto">
            <div className="text-2xl font-black text-[#0B1117] tracking-tight">
              {formatCurrency(listing.price)}
            </div>
            {listing.marketValue && listing.marketValue > listing.price && (
              <div className="text-xs text-[#6b7a7a] line-through">
                {formatCurrency(listing.marketValue)} est. market
              </div>
            )}
          </div>

          <div className="h-px w-full bg-[#E2E8F0] my-4" />

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { icon: <Maximize2 className="w-3.5 h-3.5" />, val: listing.length ? `${listing.length}'` : "—" },
              { icon: <BedDouble className="w-3.5 h-3.5" />, val: `Sleeps ${listing.sleeps}` },
              { icon: <Calendar className="w-3.5 h-3.5" />, val: String(listing.year) },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-[#eef5f4] text-[#3b4949]">
                {s.icon}
                <span className="text-xs font-semibold">{s.val}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm text-[#6b7a7a]">
              <MapPin className="w-4 h-4 text-[#2a6a4a]" />
              <span className="truncate max-w-[140px]">{listing.location}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#0B1117]/10 text-[#0B1117] flex items-center justify-center group-hover:bg-[#0B1117] group-hover:text-white transition-colors">
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
