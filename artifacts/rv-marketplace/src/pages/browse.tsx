import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { ListingCard } from "@/components/listing-card";
import { useGetListings, useGetSearchFilters } from "@workspace/api-client-react";
import {
  SlidersHorizontal, Search, X, Bookmark, ChevronDown, Loader2,
  Mail, Check, ChevronUp, AlertCircle, Sparkles, MapPin,
} from "lucide-react";
import { formatRvType, formatCurrency } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { buildLeadBuyerProfile, recordBuyerIntent } from "@/lib/buyer-intent";
import { useAppAuth } from "@/contexts/auth-context";
import { useSearch, useLocation } from "wouter";
import { LocationSearch } from "@/components/location-search";
import type { Listing } from "@workspace/api-client-react/src/generated/api.schemas";

const BASE = import.meta.env.BASE_URL || "/";
const PAGE_SIZE = 24;

// ─── Constants ────────────────────────────────────────────────────────────────

const RV_TYPES = [
  { val: "class_a",       label: "Class A" },
  { val: "class_b",       label: "Class B" },
  { val: "class_c",       label: "Class C" },
  { val: "fifth_wheel",   label: "Fifth Wheel" },
  { val: "travel_trailer",label: "Travel Trailer" },
  { val: "toy_hauler",    label: "Toy Hauler" },
  { val: "popup_camper",  label: "Pop-Up" },
  { val: "truck_camper",  label: "Truck Camper" },
];

const MOTORHOME_TYPES = new Set(["class_a", "class_b", "class_c"]);
const TOWABLE_TYPES   = new Set(["travel_trailer", "fifth_wheel", "toy_hauler", "popup_camper", "truck_camper"]);

const SORT_OPTIONS = [
  { val: "featured",      label: "Best Match" },
  { val: "price_asc",     label: "Price: Low → High" },
  { val: "price_desc",    label: "Price: High → Low" },
  { val: "newest",        label: "Newest First" },
  { val: "just_listed",   label: "Just Listed" },
  { val: "length_asc",    label: "Length: Short → Long" },
  { val: "length_desc",   label: "Length: Long → Short" },
  { val: "biggest_drop",  label: "Biggest Price Drop" },
  { val: "best_deal",     label: "Best Deal Score" },
];

const DEAL_OPTIONS = [
  { val: "great_deal", label: "Great Deal", dot: "bg-emerald-500" },
  { val: "good_deal",  label: "Good Deal",  dot: "bg-green-400" },
];

const YEAR_RANGE = Array.from({ length: new Date().getFullYear() - 2003 + 2 }, (_, i) => 2004 + i).reverse();

// ─── Filter label map (for active chips) ──────────────────────────────────────

const CHIP_LABELS: Record<string, (v: string) => string> = {
  condition:          v => v === "new" ? "New" : "Used",
  minPrice:           v => `From ${formatCurrency(Number(v))}`,
  maxPrice:           v => `Up to ${formatCurrency(Number(v))}`,
  minYear:            v => `From ${v}`,
  maxYear:            v => `To ${v}`,
  minSleeps:          v => `Sleeps ${v}+`,
  minLength:          v => `Min ${v}ft`,
  maxLength:          v => `Max ${v}ft`,
  minSlides:          v => `${v}+ slides`,
  bedSize:            v => `${v.charAt(0).toUpperCase() + v.slice(1)} Bed`,
  maxTowWeight:       v => `Tow ≤ ${Number(v).toLocaleString()} lbs`,
  hitchType:          v => ({ bumper_pull: "Bumper Pull", gooseneck: "Gooseneck", fifth_wheel_hitch: "Fifth Wheel" }[v] ?? v),
  maxMileage:         v => `≤ ${Number(v).toLocaleString()} mi`,
  campingStyle:       v => v === "boondocking" ? "Boondocking Ready" : "Full Hookup",
  petFriendly:        () => "Pet Friendly",
  fourSeason:         () => "4-Season Ready",
  outdoorKitchen:     () => "Outdoor Kitchen",
  solarFilter:        v => v === "installed" ? "Solar Installed" : v === "ready" ? "Solar Ready" : "Has Solar",
  washerDryer:        () => "Washer/Dryer",
  generator:          () => "Generator",
  hasFireplace:       () => "Fireplace",
  hydraulicJacks:     () => "Hydraulic Jacks",
  powerAwning:        () => "Power Awning",
  outdoorShower:      () => "Outdoor Shower",
  backupCamera:       () => "Backup Camera",
  theaterSeating:     () => "Theater Seating",
  enclosedUnderbelly: () => "Enclosed Underbelly",
  rearBedroom:        () => "Rear Bedroom",
  rearLiving:         () => "Rear Living",
  frontKitchen:       () => "Front Kitchen",
  islandKitchen:      () => "Island Kitchen",
  walkAroundBed:      () => "Walk-Around Bed",
  priceDrops:         () => "Price Drops",
  newArrivals:        () => "New Arrivals",
  longOnLot:          () => "Long on Lot",
  dealScore:          v => ({ great_deal: "Great Deal", good_deal: "Good Deal" }[v] ?? v),
  state:              v => v,
};

const BOOL_FILTER_KEYS = [
  "petFriendly","fourSeason","outdoorKitchen","washerDryer","generator",
  "hasFireplace","hydraulicJacks","powerAwning","outdoorShower","backupCamera",
  "theaterSeating","enclosedUnderbelly","rearBedroom","rearLiving",
  "frontKitchen","islandKitchen","walkAroundBed","priceDrops","newArrivals","longOnLot",
];

// ─── URL ↔ filter state helpers ───────────────────────────────────────────────

function filtersToQS(f: Record<string, string>, search: string): string {
  const p = new URLSearchParams();
  if (search) p.set("q", search);
  Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
  return p.toString();
}

function qsToFilters(qs: string): { filters: Record<string, string>; search: string } {
  const p = new URLSearchParams(qs);
  const filters: Record<string, string> = {};
  for (const [k, v] of p.entries()) {
    if (k === "q") continue;
    filters[k] = v;
  }
  return { filters, search: p.get("q") ?? "" };
}

const LS_KEY = "matchrv_browse_filters";

function diffFilters(prev: Record<string, string>, next: Record<string, string>): Record<string, string | null> {
  const changed: Record<string, string | null> = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  keys.forEach((key) => {
    if ((prev[key] ?? "") !== (next[key] ?? "")) {
      changed[key] = next[key] ?? null;
    }
  });
  return changed;
}

// ─── Skeleton card (matches ListingCard dimensions to prevent layout shift) ──

function SkeletonCard() {
  return (
    <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm flex flex-col h-full border border-[#E2E8F0]" aria-hidden="true">
      <div className="aspect-[4/3] bg-[#e8efef] animate-pulse" />
      <div className="p-5 flex flex-col flex-grow gap-3">
        <div className="h-3 w-24 rounded bg-[#e8efef] animate-pulse" />
        <div className="h-5 w-4/5 rounded bg-[#e8efef] animate-pulse" />
        <div className="h-6 w-28 rounded bg-[#e8efef] animate-pulse" />
        <div className="mt-auto flex gap-3 pt-3">
          <div className="h-4 w-16 rounded bg-[#e8efef] animate-pulse" />
          <div className="h-4 w-16 rounded bg-[#e8efef] animate-pulse" />
          <div className="h-4 w-16 rounded bg-[#e8efef] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Browse() {
  const queryString  = useSearch();
  const [, navigate] = useLocation();

  // Initialise from URL, fallback to localStorage
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const { filters: f } = qsToFilters(queryString);
    if (Object.keys(f).length > 0) return f;
    try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); } catch { return {}; }
  });
  const [search,            setSearch]            = useState(() => qsToFilters(queryString).search);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMoreFilters,   setShowMoreFilters]   = useState(false);
  const [makeSearch,        setMakeSearch]        = useState("");
  const [saveSearchMsg,     setSaveSearchMsg]     = useState("");
  const [showSaveDialog,    setShowSaveDialog]    = useState(false);
  const [searchName,        setSearchName]        = useState("");
  const [locationLabel,     setLocationLabel]     = useState(filters.state ? `State: ${filters.state}` : "");
  const [offset,            setOffset]            = useState(0);
  const [allListings,       setAllListings]       = useState<Listing[]>([]);
  const [captureEmail,      setCaptureEmail]      = useState("");
  const [captureSubmitted,  setCaptureSubmitted]  = useState(false);

  const trackedRef  = useRef(false);
  const prevQSRef   = useRef(queryString);
  const prevFiltRef = useRef(filters);
  const pendingLocationRef = useRef<{ city?: string; state?: string; label?: string; source: string } | null>(null);

  const { isAuthenticated, login } = useAppAuth();
  const { data: filterOptions } = useGetSearchFilters();

  // ── Track page view ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!trackedRef.current) { trackedRef.current = true; trackEvent("page_view", { metadata: { page: "browse" } }); }
  }, []);

  // ── Sync URL → state (external navigation) ───────────────────────────────
  useEffect(() => {
    if (queryString === prevQSRef.current) return;
    prevQSRef.current = queryString;
    const { filters: f, search: s } = qsToFilters(queryString);
    setFilters(f); setSearch(s); setOffset(0); setAllListings([]);
  }, [queryString]);

  // ── Sync state → URL + localStorage (debounced 300ms) ────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      const qs = filtersToQS(filters, search);
      const newUrl = qs ? `?${qs}` : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
      try { localStorage.setItem(LS_KEY, JSON.stringify(filters)); } catch { /* noop */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, search]);

  // ── Reset offset on filter change ────────────────────────────────────────
  useEffect(() => {
    if (prevFiltRef.current === filters) return;
    const previousFilters = prevFiltRef.current;
    const changedFilters = diffFilters(previousFilters, filters);
    prevFiltRef.current = filters;
    if (Object.values(filters).some(Boolean)) {
      const location = pendingLocationRef.current ?? (filters.state ? { state: filters.state, label: filters.state, source: "state_filter" } : undefined);
      trackEvent("search", { metadata: filters });
      recordBuyerIntent("filter_applied", {
        filters,
        metadata: {
          page: "browse",
          filters,
          changedFilters,
          location,
        },
      });
      pendingLocationRef.current = null;
    }
    setOffset(0); setAllListings([]);
  }, [filters]);

  // ── Debounce search input ────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(prev => {
        const next = { ...prev };
        if (search) next.search = search; else delete next.search;
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Data fetching ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: listingsData, isLoading } = (useGetListings as any)(
    { ...filters, limit: PAGE_SIZE, offset }
  );

  useEffect(() => {
    if (!listingsData?.listings) return;
    if (offset === 0) setAllListings(listingsData.listings as Listing[]);
    else setAllListings(prev => {
      const newIds = new Set(prev.map((l: Listing) => l.id));
      const fresh = (listingsData.listings as Listing[]).filter((l: Listing) => !newIds.has(l.id));
      return [...prev, ...fresh];
    });
  }, [listingsData?.listings, offset]);

  // Sync display — show fresh data immediately on first page so there's no flash
  const displayedListings = useMemo(() => {
    if (offset === 0 && listingsData?.listings) return listingsData.listings as Listing[];
    return allListings;
  }, [offset, listingsData?.listings, allListings]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const setFilter = useCallback((key: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value) next[key] = value; else delete next[key];
      return next;
    });
  }, []);

  const toggleBool = useCallback((key: string) => {
    setFilters(prev => {
      const next = { ...prev };
      if (next[key] === "true") delete next[key]; else next[key] = "true";
      return next;
    });
  }, []);

  const toggleMulti = useCallback((key: string, val: string) => {
    setFilters(prev => {
      const current = prev[key] ? prev[key].split(",") : [];
      const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
      const updated = { ...prev };
      if (next.length) updated[key] = next.join(","); else delete updated[key];
      return updated;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({}); setSearch(""); setLocationLabel("");
    setOffset(0); setAllListings([]); setShowMobileFilters(false);
    try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
  }, []);

  const handleLoadMore = useCallback(() => setOffset(prev => prev + PAGE_SIZE), []);

  // ── Derived values ───────────────────────────────────────────────────────

  const total   = listingsData?.total ?? 0;
  const showing = displayedListings.length;
  const hasMore = showing < total;

  const activeTypes    = filters.type ? filters.type.split(",") : [];
  const isMotorhome    = activeTypes.length > 0 && activeTypes.every(t => MOTORHOME_TYPES.has(t));
  const isTowable      = activeTypes.length > 0 && activeTypes.every(t => TOWABLE_TYPES.has(t));

  const advancedFilterKeys = [
    "make","minSleeps","minLength","maxLength","minSlides","bedSize",
    "maxTowWeight","hitchType","maxMileage","campingStyle",
    "petFriendly","fourSeason","outdoorKitchen","solarFilter","washerDryer",
    "generator","hasFireplace","hydraulicJacks","powerAwning","outdoorShower",
    "backupCamera","theaterSeating","enclosedUnderbelly",
    "rearBedroom","rearLiving","frontKitchen","islandKitchen","walkAroundBed",
    "priceDrops","newArrivals","longOnLot",
  ];
  const advancedCount = advancedFilterKeys.filter(k => filters[k]).length;

  const activeChips = useMemo(() => {
    const chips: { key: string; value: string; label: string }[] = [];
    for (const [k, v] of Object.entries(filters)) {
      if (!v) continue;
      if (k === "type") {
        v.split(",").forEach(t => chips.push({ key: "type", value: t, label: formatRvType(t) }));
      } else if (k === "make") {
        v.split(",").forEach(m => chips.push({ key: "make", value: m, label: m }));
      } else if (k === "search") {
        chips.push({ key: "search", value: v, label: `"${v}"` });
      } else if (CHIP_LABELS[k]) {
        chips.push({ key: k, value: v, label: CHIP_LABELS[k](v) });
      }
    }
    return chips;
  }, [filters]);

  const hasActiveFilters = activeChips.length > 0 || search.length > 0;

  // ── Outfitter CTA ────────────────────────────────────────────────────────
  const handleStartMatching = () => {
    const params = new URLSearchParams();
    if (filters.type) params.set("type", filters.type);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    if (filters.minSleeps) params.set("minSleeps", filters.minSleeps);
    if (filters.condition) params.set("condition", filters.condition);
    navigate(`/outfitter?${params.toString()}`);
  };

  // ── Sidebar (shared for desktop + mobile) ────────────────────────────────

  const FilterPanel = () => {
    const makeOptions = (filterOptions?.makes ?? []).filter((m: string) =>
      !makeSearch || m.toLowerCase().includes(makeSearch.toLowerCase())
    );
    const activeMakes = filters.make ? filters.make.split(",") : [];

    return (
      <div className="space-y-0">
        {/* ── Location ──────────────────────────────────────────────── */}
        <FilterSection title="Location">
          <LocationSearch
            value={locationLabel}
            onSelect={(city, state, label) => {
              pendingLocationRef.current = { city, state, label, source: "location_search" };
              setLocationLabel(label);
              setFilter("state", state);
            }}
            onClear={() => { setLocationLabel(""); setFilter("state", ""); }}
          />
        </FilterSection>

        {/* ── RV Type ───────────────────────────────────────────────── */}
        <FilterSection title="RV Type">
          <div className="flex flex-wrap gap-1.5">
            {RV_TYPES.map(({ val, label }) => {
              const active = activeTypes.includes(val);
              return (
                <button
                  key={val}
                  onClick={() => toggleMulti("type", val)}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all border ${
                    active
                      ? "bg-[#0B1117] text-white border-[#0B1117]"
                      : "bg-white text-[#3b4949] border-[#E2E8F0]/40 hover:border-[#0B1117]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </FilterSection>

        {/* ── Condition ─────────────────────────────────────────────── */}
        <FilterSection title="Condition">
          <div className="flex gap-1">
            {[{v:"",l:"All"},{v:"new",l:"New"},{v:"used",l:"Used"}].map(({v,l}) => {
              const active = (filters.condition ?? "") === v;
              return (
                <button key={l} onClick={() => setFilter("condition", v)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    active ? "bg-[#0B1117] text-white" : "bg-[#eef5f4] text-[#161d1d] hover:bg-[#e2eae9]"
                  }`}>{l}</button>
              );
            })}
          </div>
        </FilterSection>

        {/* ── Price Range ───────────────────────────────────────────── */}
        <FilterSection title="Price Range">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#3b4949] text-xs">$</span>
              <input type="number" placeholder="Min"
                value={filters.minPrice ?? ""}
                onChange={e => setFilter("minPrice", e.target.value)}
                className="w-full pl-6 pr-2 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]"
              />
            </div>
            <span className="text-[#6b7a7a] text-xs">–</span>
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#3b4949] text-xs">$</span>
              <input type="number" placeholder="Max"
                value={filters.maxPrice ?? ""}
                onChange={e => setFilter("maxPrice", e.target.value)}
                className="w-full pl-6 pr-2 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]"
              />
            </div>
          </div>
        </FilterSection>

        {/* ── Year Range ────────────────────────────────────────────── */}
        <FilterSection title="Year">
          <div className="flex gap-2">
            <select value={filters.minYear ?? ""} onChange={e => setFilter("minYear", e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]">
              <option value="">Min Year</option>
              {YEAR_RANGE.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={filters.maxYear ?? ""} onChange={e => setFilter("maxYear", e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]">
              <option value="">Max Year</option>
              {YEAR_RANGE.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </FilterSection>

        {/* ── Deal Rating ───────────────────────────────────────────── */}
        <FilterSection title="Deal Rating">
          <div className="space-y-1.5">
            {DEAL_OPTIONS.map(d => {
              const active = filters.dealScore === d.val;
              return (
                <button key={d.val} onClick={() => setFilter("dealScore", active ? "" : d.val)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                    active ? "bg-[#0B1117] text-white" : "bg-[#eef5f4] text-[#161d1d] hover:bg-[#e2eae9]"
                  }`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.dot}`} />
                  {d.label}
                </button>
              );
            })}
          </div>
        </FilterSection>

        {/* ── More Filters ──────────────────────────────────────────── */}
        <div className="pt-1">
          <button
            onClick={() => setShowMoreFilters(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#eef5f4] hover:bg-[#e2eae9] transition-colors text-xs font-bold text-[#161d1d]"
          >
            <span className="flex items-center gap-2">
              More Filters
              {advancedCount > 0 && (
                <span className="bg-[#0B1117] text-white text-[10px] font-black rounded-full px-1.5 py-0.5 leading-none">
                  {advancedCount}
                </span>
              )}
            </span>
            {showMoreFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showMoreFilters && (
            <div className="mt-3 space-y-0">

              {/* Make / Brand */}
              <FilterSection title="Make / Brand">
                <input type="text" placeholder="Search brands…" value={makeSearch}
                  onChange={e => setMakeSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117] mb-2"
                />
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {makeOptions.slice(0, 30).map((m: string) => {
                    const on = activeMakes.includes(m);
                    return (
                      <label key={m} className="flex items-center gap-2 cursor-pointer group">
                        <div onClick={() => toggleMulti("make", m)}
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            on ? "bg-[#0B1117] border-[#0B1117]" : "border-[#E2E8F0] group-hover:border-[#0B1117]"
                          }`}>
                          {on && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className="text-xs text-[#161d1d]">{m}</span>
                      </label>
                    );
                  })}
                </div>
              </FilterSection>

              {/* Size & Capacity */}
              <FilterSection title="Size & Capacity">
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-[#3b4949] uppercase tracking-wide block mb-1">Min Sleeps</label>
                    <select value={filters.minSleeps ?? ""} onChange={e => setFilter("minSleeps", e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]">
                      <option value="">Any</option>
                      {[2,3,4,5,6,7,8,10].map(n => <option key={n} value={n}>{n}+</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#3b4949] uppercase tracking-wide block mb-1">Length (ft)</label>
                    <div className="flex gap-2">
                      <input type="number" placeholder="Min" value={filters.minLength ?? ""}
                        onChange={e => setFilter("minLength", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]" />
                      <input type="number" placeholder="Max" value={filters.maxLength ?? ""}
                        onChange={e => setFilter("maxLength", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#3b4949] uppercase tracking-wide block mb-1">Min Slideouts</label>
                    <select value={filters.minSlides ?? ""} onChange={e => setFilter("minSlides", e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]">
                      <option value="">Any</option>
                      <option value="0">0</option>
                      <option value="1">1+</option>
                      <option value="2">2+</option>
                      <option value="3">3+</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#3b4949] uppercase tracking-wide block mb-1">Bed Size</label>
                    <div className="flex gap-1.5">
                      {["king","queen"].map(b => {
                        const active = filters.bedSize === b;
                        return (
                          <button key={b} onClick={() => setFilter("bedSize", active ? "" : b)}
                            className={`flex-1 py-1.5 rounded text-[10px] font-bold capitalize transition-all border ${
                              active ? "bg-[#0B1117] text-white border-[#0B1117]" : "bg-white text-[#3b4949] border-[#E2E8F0]/40 hover:border-[#0B1117]"
                            }`}>{b}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </FilterSection>

              {/* Towing & Mechanical — towable */}
              {!isMotorhome && (
                <FilterSection title="Towing & Mechanical">
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-[#3b4949] uppercase tracking-wide block mb-1">My Vehicle Can Tow</label>
                      <div className="relative">
                        <input type="number" placeholder="e.g. 10000" value={filters.maxTowWeight ?? ""}
                          onChange={e => setFilter("maxTowWeight", e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#3b4949]">lbs</span>
                      </div>
                      <p className="text-[10px] text-[#3b4949] mt-1">Filters to RVs your vehicle can handle</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#3b4949] uppercase tracking-wide block mb-1">Hitch Type</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          { v:"bumper_pull",      l:"Bumper Pull" },
                          { v:"fifth_wheel_hitch",l:"Fifth Wheel" },
                          { v:"gooseneck",        l:"Gooseneck" },
                        ].map(({v,l}) => {
                          const active = filters.hitchType === v;
                          return (
                            <button key={v} onClick={() => setFilter("hitchType", active ? "" : v)}
                              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all border ${
                                active ? "bg-[#0B1117] text-white border-[#0B1117]" : "bg-white text-[#3b4949] border-[#E2E8F0]/40 hover:border-[#0B1117]"
                              }`}>{l}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </FilterSection>
              )}

              {/* Motorhome-specific filters */}
              {!isTowable && (
                <FilterSection title="Motorhome">
                  <div>
                    <label className="text-[10px] font-bold text-[#3b4949] uppercase tracking-wide block mb-1">Max Mileage</label>
                    <div className="relative">
                      <input type="number" placeholder="e.g. 50000" value={filters.maxMileage ?? ""}
                        onChange={e => setFilter("maxMileage", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#3b4949]">mi</span>
                    </div>
                  </div>
                </FilterSection>
              )}

              {/* Lifestyle */}
              <FilterSection title="Lifestyle">
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-[#3b4949] uppercase tracking-wide block mb-1.5">Camping Style</label>
                    <div className="flex gap-1">
                      {[
                        { v:"",           l:"All" },
                        { v:"boondocking",l:"Boondocking Ready" },
                        { v:"full_hookup",l:"Full Hookup" },
                      ].map(({v,l}) => {
                        const active = (filters.campingStyle ?? "") === v;
                        return (
                          <button key={l} onClick={() => setFilter("campingStyle", v)}
                            className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold leading-tight text-center transition-all ${
                              active ? "bg-[#0B1117] text-white" : "bg-[#eef5f4] text-[#161d1d] hover:bg-[#e2eae9]"
                            }`}>{l}</button>
                        );
                      })}
                    </div>
                  </div>
                  {[
                    { key:"petFriendly", label:"Pet Friendly" },
                    { key:"fourSeason",  label:"4-Season / Winter Ready" },
                  ].map(({ key, label }) => (
                    <BoolToggle key={key} label={label} active={filters[key] === "true"} onToggle={() => toggleBool(key)} />
                  ))}
                </div>
              </FilterSection>

              {/* Features */}
              <FilterSection title="Features">
                <div className="space-y-2">
                  {[
                    { key:"outdoorKitchen",    label:"Outdoor Kitchen" },
                    { key:"washerDryer",       label:"Washer/Dryer Prep" },
                    { key:"generator",         label:"Generator (onboard)" },
                    { key:"hasFireplace",      label:"Fireplace" },
                    { key:"powerAwning",       label:"Power Awning" },
                    { key:"outdoorShower",     label:"Outdoor Shower" },
                    { key:"backupCamera",      label:"Backup Camera" },
                    { key:"theaterSeating",    label:"Theater Seating" },
                    { key:"hydraulicJacks",    label:"Hydraulic Jacks" },
                    { key:"enclosedUnderbelly",label:"Enclosed Underbelly" },
                  ].map(({ key, label }) => (
                    <CheckboxFilter key={key} label={label} active={filters[key] === "true"} onToggle={() => toggleBool(key)} />
                  ))}
                  <div>
                    <label className="text-[10px] font-bold text-[#3b4949] uppercase tracking-wide block mb-1.5">Solar</label>
                    <select value={filters.solarFilter ?? ""} onChange={e => setFilter("solarFilter", e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0]/40 text-xs bg-white focus:outline-none focus:border-[#0B1117]">
                      <option value="">Any</option>
                      <option value="any">Has Solar (Ready or Installed)</option>
                      <option value="ready">Solar Ready</option>
                      <option value="installed">Solar Installed</option>
                    </select>
                  </div>
                </div>
              </FilterSection>

              {/* Floorplan */}
              <FilterSection title="Floorplan">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key:"rearBedroom",  label:"Rear Bedroom" },
                    { key:"rearLiving",   label:"Rear Living" },
                    { key:"frontKitchen", label:"Front Kitchen" },
                    { key:"islandKitchen",label:"Island Kitchen" },
                    { key:"walkAroundBed",label:"Walk-Around Bed" },
                  ].map(({ key, label }) => {
                    const active = filters[key] === "true";
                    return (
                      <button key={key} onClick={() => toggleBool(key)}
                        className={`px-3 py-1.5 rounded text-[10px] font-bold transition-all border ${
                          active ? "bg-[#00CED1] text-[#0B1117] border-[#00CED1]" : "bg-white text-[#3b4949] border-[#E2E8F0]/40 hover:border-[#0B1117]"
                        }`}>{label}</button>
                    );
                  })}
                </div>
              </FilterSection>

              {/* Deals */}
              <FilterSection title="Deals">
                <div className="space-y-2">
                  {[
                    { key:"priceDrops", label:"Price Drops Only",   desc:"Listings with reduced prices" },
                    { key:"newArrivals",label:"New Arrivals",        desc:"Listed in the last 7 days" },
                    { key:"longOnLot",  label:"Long on Lot",         desc:"60+ days — motivated sellers" },
                  ].map(({ key, label, desc }) => (
                    <button key={key} onClick={() => toggleBool(key)}
                      className={`w-full flex items-start justify-between gap-2 p-2.5 rounded-xl border transition-all text-left ${
                        filters[key] === "true" ? "border-[#0B1117] bg-[#eef5f4]" : "border-[#E2E8F0]/30 hover:border-[#0B1117]"
                      }`}>
                      <div>
                        <p className="text-xs font-bold text-[#161d1d]">{label}</p>
                        <p className="text-[10px] text-[#3b4949]">{desc}</p>
                      </div>
                      <div className={`w-8 h-4 rounded-full flex-shrink-0 mt-0.5 transition-colors relative ${filters[key] === "true" ? "bg-[#0B1117]" : "bg-[#E2E8F0]"}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${filters[key] === "true" ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Location */}
              <FilterSection title="Distance">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[#eef5f4] border border-[#E2E8F0]/20">
                  <MapPin className="w-4 h-4 text-[#3b4949] flex-shrink-0" />
                  <p className="text-xs text-[#3b4949]">Radius search <span className="font-bold text-[#3b4949]">coming soon</span></p>
                </div>
              </FilterSection>

            </div>
          )}
        </div>

        {/* ── Reset + CTA ───────────────────────────────────────────── */}
        {hasActiveFilters && (
          <button onClick={resetFilters}
            className="w-full text-[#924c00] text-xs font-bold hover:text-[#6f3800] transition-colors pt-1">
            Reset All Filters
          </button>
        )}

        {/* ── Talk to Outfitter CTA ─────────────────────────────────── */}
        <div className="mt-4 bg-gradient-to-br from-[#0B1117] to-[#002829] rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#00CED1] mb-1">Not sure what you need?</p>
          <p className="text-white font-bold text-sm leading-snug mb-3">
            Let our AI Outfitter guide you to your perfect match
          </p>
          <button onClick={handleStartMatching}
            className="w-full bg-[#ffe08b] text-[#241a00] font-black text-xs py-2.5 rounded-xl hover:bg-[#ffd04a] transition-colors flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Start Matching
          </button>
        </div>

        {/* Mobile close button */}
        <div className="lg:hidden pt-3">
          <button onClick={() => setShowMobileFilters(false)}
            className="w-full bg-[#0B1117] text-white py-3.5 rounded-2xl font-bold text-sm">
            Show {total.toLocaleString()} Results
          </button>
        </div>
      </div>
    );
  };

  // ── SEO meta ─────────────────────────────────────────────────────────────
  const activeType      = filters.type?.split(",")[0];
  const activeCondition = filters.condition;
  const typeLabel       = activeType ? formatRvType(activeType) : null;
  const condLabel       = activeCondition ? (activeCondition.charAt(0).toUpperCase() + activeCondition.slice(1)) : null;
  let browseTitle = "Browse RVs for Sale";
  if (typeLabel && condLabel) browseTitle = `${condLabel} ${typeLabel} RVs for Sale`;
  else if (typeLabel) browseTitle = `${typeLabel} RVs for Sale`;
  else if (condLabel) browseTitle = `${condLabel} RVs for Sale`;
  else if (search) browseTitle = `"${search}" RVs for Sale`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <SEO title={browseTitle} description="Browse RV inventory on MatchRV — filter by type, price, features, and more." />

      {/* ── Sticky search + sort bar ───────────────────────────────────────── */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-16 md:top-20 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative w-full sm:max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3b4949]" />
            <input
              placeholder="Search make, model, or keywords…"
              aria-label="Search listings"
              className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-[#E2E8F0] bg-white text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none focus:border-[#00696b] text-sm font-medium transition-colors"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Mobile filter button */}
            <button onClick={() => setShowMobileFilters(true)}
              className="lg:hidden flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-[#E2E8F0] bg-white text-sm font-bold text-[#161d1d] relative">
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-[#924c00] absolute top-2 right-2" />
              )}
            </button>

            {/* Sort */}
            <div className="relative">
              <select
                value={filters.sort ?? ""}
                onChange={e => setFilter("sort", e.target.value)}
                className="appearance-none pl-4 pr-10 py-3 rounded-2xl border-2 border-[#E2E8F0] bg-white text-sm font-bold text-[#161d1d] focus:outline-none focus:border-[#00696b] cursor-pointer"
              >
                {SORT_OPTIONS.map(({ val, label }) => <option key={val} value={val}>{label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3b4949] pointer-events-none" />
            </div>

            {/* Save search */}
            <button
              onClick={() => {
                if (!isAuthenticated) { login(); return; }
                if (saveSearchMsg) return;
                setSearchName(search || "My RV Search");
                setShowSaveDialog(true);
              }}
              className="hidden sm:flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-[#E2E8F0] bg-white text-sm font-bold text-[#161d1d] hover:border-[#00696b] transition-colors whitespace-nowrap"
            >
              <Bookmark className="w-4 h-4" />
              {saveSearchMsg || "Save Search"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile filter drawer ──────────────────────────────────────────── */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileFilters(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-80 bg-white overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-black text-xl text-[#0B1117]">Filters</h3>
              <button onClick={() => setShowMobileFilters(false)} className="p-2 rounded-full hover:bg-[#e8efef]">
                <X className="w-5 h-5 text-[#3b4949]" />
              </button>
            </div>
            <FilterPanel />
          </div>
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex gap-8 items-start">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-60 flex-shrink-0 sticky top-36 max-h-[calc(100vh-9rem)] overflow-y-auto pr-2 pb-8">
          <FilterPanel />
        </aside>

        {/* Results */}
        <div className="flex-1 min-w-0">

          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {activeChips.map((chip, i) => (
                <button
                  key={`${chip.key}-${chip.value}-${i}`}
                  onClick={() => {
                    if (chip.key === "type") toggleMulti("type", chip.value);
                    else if (chip.key === "make") toggleMulti("make", chip.value);
                    else if (chip.key === "search") setSearch("");
                    else if (BOOL_FILTER_KEYS.includes(chip.key)) toggleBool(chip.key);
                    else setFilter(chip.key, "");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#eef5f4] text-[#0B1117] text-xs font-bold hover:bg-[#e2eae9] transition-colors border border-[#00CED1]"
                >
                  {chip.label}
                  <X className="w-3 h-3" />
                </button>
              ))}
              <button onClick={resetFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold text-[#924c00] hover:text-[#6f3800] transition-colors">
                <X className="w-3 h-3" /> Clear All
              </button>
            </div>
          )}

          {/* Results header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display font-black text-xl md:text-2xl text-[#161d1d] tracking-tight">
                {isLoading && offset === 0
                  ? <span className="inline-flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin text-[#0B1117]" /> Searching…</span>
                  : <><span className="text-[#0B1117]">{total.toLocaleString()}</span> RVs Found</>
                }
              </h1>
              {!isLoading && showing > 0 && (
                <p className="text-xs text-[#3b4949] mt-0.5 flex items-center gap-2">
                  Showing 1–{showing.toLocaleString()} of {total.toLocaleString()}
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live · updated daily
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Listing grid */}
          {isLoading && offset === 0 && displayedListings.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : displayedListings.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-[2rem] border border-[#E2E8F0]">
              <AlertCircle className="w-12 h-12 text-[#6b7a7a] mx-auto mb-4" />
              <h3 className="text-xl font-bold text-[#161d1d] mb-2">No listings found</h3>
              <p className="text-[#3b4949] max-w-sm mx-auto text-sm mb-6">
                Try broadening your filters or clearing some criteria.
              </p>
              <button onClick={resetFilters}
                className="px-6 py-3 rounded-2xl border-2 border-[#0B1117] text-[#0B1117] font-bold text-sm hover:bg-[#0B1117] hover:text-white transition-colors">
                Reset Filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {displayedListings.map((listing, idx) => (
                  <React.Fragment key={listing.id}>
                    <ListingCard listing={listing} />
                    {idx === 11 && !isAuthenticated && (
                      <div className="col-span-1 md:col-span-2 xl:col-span-3 my-2">
                        <div className="bg-gradient-to-r from-[#0B1117] to-[#002829] rounded-[1.5rem] p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
                          <div className="flex-1 text-center md:text-left">
                            <div className="text-[#00CED1] text-xs font-black uppercase tracking-widest mb-1">Stay in the loop</div>
                            <h3 className="text-white font-display font-black text-xl md:text-2xl leading-tight">
                              Save your search + get new match alerts
                            </h3>
                          </div>
                          <div className="w-full md:w-auto md:min-w-[280px]">
                            {captureSubmitted ? (
                              <div className="flex items-center justify-center gap-2 py-3 text-[#00CED1] font-bold">
                                <Check className="w-5 h-5" /> You're on the list!
                              </div>
                            ) : (
                              <form onSubmit={async e => {
                                e.preventDefault();
                                if (!captureEmail.trim()) return;
                                try {
                                  await fetch(`${BASE}api/price-alerts`, {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      email: captureEmail,
                                      buyerProfile: buildLeadBuyerProfile({}, { leadSource: "browse_price_alert" }),
                                    }),
                                  });
                                } catch { /* noop */ }
                                setCaptureSubmitted(true);
                              }} className="flex gap-2">
                                <div className="relative flex-1">
                                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3b4949]" />
                                  <input type="email" value={captureEmail} onChange={e => setCaptureEmail(e.target.value)}
                                    placeholder="your@email.com" required
                                    className="w-full pl-9 pr-3 py-3 rounded-xl text-sm bg-white text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none" />
                                </div>
                                <button type="submit"
                                  className="px-5 py-3 rounded-xl bg-[#924c00] text-white font-bold text-sm hover:bg-[#6f3800] transition-colors whitespace-nowrap">
                                  Get Alerts
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
                {isLoading && offset > 0 && [...Array(3)].map((_, i) => (
                  <SkeletonCard key={`sk-${i}`} />
                ))}
              </div>

              {hasMore && (
                <div className="mt-12 flex flex-col items-center gap-4">
                  <p className="text-sm text-[#3b4949]">
                    Showing <strong className="text-[#161d1d]">{showing.toLocaleString()}</strong> of{" "}
                    <strong className="text-[#161d1d]">{total.toLocaleString()}</strong> listings
                  </p>
                  <button onClick={handleLoadMore} disabled={isLoading}
                    className="flex items-center gap-2.5 px-10 py-4 rounded-2xl bg-[#0B1117] text-white font-bold text-sm hover:bg-[#002829] active:scale-95 transition-all disabled:opacity-60 shadow-lg shadow-[#0B1117]/20">
                    {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</> : <>Load More RVs</>}
                  </button>
                  <p className="text-xs text-[#3b4949]">{(total - showing).toLocaleString()} more listings available</p>
                </div>
              )}
              {!hasMore && showing > 0 && (
                <div className="mt-10 text-center text-sm text-[#3b4949]">All {total.toLocaleString()} listings shown</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Save search dialog ────────────────────────────────────────────── */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowSaveDialog(false)}>
          <div className="bg-white rounded-[1.5rem] shadow-2xl max-w-md w-full p-8" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-black text-xl text-[#0B1117] mb-1">Save This Search</h3>
            <p className="text-sm text-[#3b4949] mb-5">Give your search a name so you can find it later.</p>
            <input type="text" value={searchName} onChange={e => setSearchName(e.target.value)}
              placeholder="e.g. Class B Under $100k" autoFocus
              className="w-full border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-sm font-medium bg-white text-[#161d1d] focus:outline-none focus:border-[#00696b] mb-5"
              onKeyDown={async e => {
                if (e.key !== "Enter" || !searchName.trim()) return;
                const qs = filtersToQS(filters, search);
                try {
                  await fetch(`${BASE}api/saved-searches`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: searchName, filters: qs }),
                  });
                } catch { /* noop */ }
                setSaveSearchMsg("Saved!");
                setShowSaveDialog(false);
                setTimeout(() => setSaveSearchMsg(""), 3000);
              }}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-3 rounded-xl border-2 border-[#E2E8F0] text-sm font-bold text-[#3b4949] hover:bg-[#eef5f4] transition-colors">
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!searchName.trim()) return;
                  const qs = filtersToQS(filters, search);
                  try {
                    await fetch(`${BASE}api/saved-searches`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: searchName, filters: qs }),
                    });
                  } catch { /* noop */ }
                  setSaveSearchMsg("Saved!");
                  setShowSaveDialog(false);
                  setTimeout(() => setSaveSearchMsg(""), 3000);
                }}
                className="flex-1 py-3 rounded-xl bg-[#0B1117] text-white font-bold text-sm hover:bg-[#002829] transition-colors">
                Save Search
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4 border-b border-[#E2E8F0] last:border-0">
      <h4 className="font-black text-[10px] uppercase tracking-widest text-[#3b4949] mb-3">{title}</h4>
      {children}
    </div>
  );
}

function BoolToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
        active ? "border-[#0B1117] bg-[#eef5f4]" : "border-[#E2E8F0]/30 hover:border-[#0B1117]"
      }`}>
      <span className="text-xs font-semibold text-[#161d1d]">{label}</span>
      <div className={`w-8 h-4 rounded-full flex-shrink-0 transition-colors relative ${active ? "bg-[#0B1117]" : "bg-[#E2E8F0]"}`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${active ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
    </button>
  );
}

function CheckboxFilter({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group" onClick={onToggle}>
      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
        active ? "bg-[#0B1117] border-[#0B1117]" : "border-[#E2E8F0] group-hover:border-[#0B1117]"
      }`}>
        {active && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
      <span className="text-xs text-[#161d1d]">{label}</span>
    </label>
  );
}
