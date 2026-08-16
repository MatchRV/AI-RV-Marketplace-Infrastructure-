import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useAppAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui-elements";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, MapPin, Map, Calendar, ExternalLink, Plus, X, ChevronUp, ChevronDown,
  Zap, Droplets, Tent, Search, Share2, Copy, Check,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

interface LiveCampground {
  npsId: string;
  name: string;
  description: string | null;
  state: string;
  city: string;
  lat: number;
  lon: number;
  hookupType: string;
  maxRvLength: number | null;
  totalSites: number | null;
  nightlyRateMin: number | null;
  nightlyRateMax: number | null;
  bookingUrl: string | null;
  amenities: string[];
  campgroundType: string;
  phone: string | null;
  imageUrl: string | null;
  source: string;
}

interface Campground {
  id: number;
  name: string;
  description: string | null;
  state: string;
  city: string;
  lat: number;
  lon: number;
  hookupType: string;
  maxRvLength: number | null;
  totalSites: number | null;
  nightlyRateMin: number | null;
  nightlyRateMax: number | null;
  bookingUrl: string | null;
  amenities: string[];
  campgroundType: string;
  phone: string | null;
}

interface Stop {
  id: number;
  tripId: number;
  stopOrder: number;
  arrivalDate: string | null;
  departureDate: string | null;
  nights: number | null;
  notes: string | null;
  campground: Campground;
}

interface Trip {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  status: string;
}

const HOOKUP_LABELS: Record<string, string> = {
  full: "Full Hookups",
  water_electric: "Water & Electric",
  dry: "Dry Camping",
};

const STATE_NAMES: Record<string, string> = {
  WA: "Washington", OR: "Oregon", ID: "Idaho", MT: "Montana",
};

function HookupBadge({ type }: { type: string }) {
  if (type === "full") return (
    <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
      <Zap className="w-3 h-3" /> Full Hookups
    </span>
  );
  if (type === "water_electric") return (
    <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
      <Droplets className="w-3 h-3" /> Water & Electric
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
      <Tent className="w-3 h-3" /> Dry Camping
    </span>
  );
}

function CampgroundCard({ cg, onAdd, adding }: { cg: Campground; onAdd: () => void; adding: boolean }) {
  const rate = cg.nightlyRateMin
    ? cg.nightlyRateMax && cg.nightlyRateMax !== cg.nightlyRateMin
      ? `$${Math.round(cg.nightlyRateMin)}–$${Math.round(cg.nightlyRateMax)}/night`
      : `$${Math.round(cg.nightlyRateMin)}/night`
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-snug">{cg.name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 shrink-0" /> {cg.city}, {STATE_NAMES[cg.state] || cg.state}
          </div>
        </div>
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full capitalize shrink-0">
          {cg.campgroundType}
        </span>
      </div>

      {cg.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{cg.description}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <HookupBadge type={cg.hookupType} />
        {cg.maxRvLength && (
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Max {cg.maxRvLength}′ RV</span>
        )}
        {rate && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{rate}</span>
        )}
      </div>

      <div className="flex gap-2 mt-auto">
        <Button size="sm" onClick={onAdd} disabled={adding} className="flex-1 text-xs gap-1.5">
          <Plus className="w-3.5 h-3.5" /> {adding ? "Adding..." : "Add Stop"}
        </Button>
        {cg.bookingUrl && (
          <a href={cg.bookingUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="text-xs gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Book
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

function LiveCampgroundCard({ cg, onAdd, adding }: { cg: LiveCampground; onAdd: () => void; adding: boolean }) {
  const rate = cg.nightlyRateMin
    ? `$${Math.round(cg.nightlyRateMin)}/night`
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-snug">{cg.name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 shrink-0" />
            {cg.city ? `${cg.city}, ` : ""}{cg.state || "National Park"}
          </div>
        </div>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium shrink-0">NPS</span>
      </div>

      {cg.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{cg.description}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {cg.amenities.length > 0 && cg.amenities.slice(0, 3).map((a) => (
          <span key={a} className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{a}</span>
        ))}
        {rate && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{rate}</span>}
      </div>

      <div className="flex gap-2 mt-auto">
        <Button size="sm" onClick={onAdd} disabled={adding} className="flex-1 text-xs gap-1.5">
          <Plus className="w-3.5 h-3.5" /> {adding ? "Adding..." : "Add Stop"}
        </Button>
        {cg.bookingUrl && (
          <a href={cg.bookingUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="text-xs gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> NPS
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

function StopRow({ stop, index, total, onMove, onRemove, onUpdate, readOnly = false }: {
  stop: Stop; index: number; total: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onUpdate: (fields: Partial<Stop>) => void;
  readOnly?: boolean;
}) {
  const [editNights, setEditNights] = useState(stop.nights?.toString() || "");
  const [editArrival, setEditArrival] = useState(stop.arrivalDate || "");
  const cg = stop.campground;

  function saveNights() {
    const n = parseInt(editNights, 10);
    if (!isNaN(n) && n > 0) onUpdate({ nights: n });
    else if (editNights === "") onUpdate({ nights: null });
  }

  function saveArrival() {
    onUpdate({ arrivalDate: editArrival || null });
  }

  const rate = cg.nightlyRateMin
    ? cg.nightlyRateMax && cg.nightlyRateMax !== cg.nightlyRateMin
      ? `$${Math.round(cg.nightlyRateMin)}–$${Math.round(cg.nightlyRateMax)}/nt`
      : `$${Math.round(cg.nightlyRateMin)}/nt`
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start gap-3">
        {!readOnly ? (
          <div className="flex flex-col items-center gap-0.5 pt-0.5">
            <button onClick={() => onMove(-1)} disabled={index === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
              <ChevronUp className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-muted-foreground w-5 text-center">{index + 1}</span>
            <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <span className="text-xs font-bold text-muted-foreground w-5 text-center pt-1">{index + 1}</span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div>
              <div className="font-semibold">{cg.name}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {cg.city}, {cg.state}
              </div>
            </div>
            {!readOnly && (
              <button onClick={onRemove} className="text-muted-foreground hover:text-red-500 transition-colors p-1 shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            <HookupBadge type={cg.hookupType} />
            {cg.maxRvLength && <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Max {cg.maxRvLength}′</span>}
            {rate && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{rate}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {readOnly ? (
              <>
                {stop.arrivalDate && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> {stop.arrivalDate}
                  </span>
                )}
                {stop.nights && (
                  <span className="text-xs text-muted-foreground">{stop.nights} night{stop.nights !== 1 ? "s" : ""}</span>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground font-medium">Arrival</label>
                  <input
                    type="date"
                    value={editArrival}
                    onChange={(e) => setEditArrival(e.target.value)}
                    onBlur={saveArrival}
                    className="border border-border rounded-md px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground font-medium">Nights</label>
                  <input
                    type="number"
                    value={editNights}
                    onChange={(e) => setEditNights(e.target.value)}
                    onBlur={saveNights}
                    min="1"
                    max="30"
                    placeholder="—"
                    className="border border-border rounded-md px-2 py-1 text-xs bg-background w-16 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </>
            )}
            {cg.bookingUrl && (
              <a href={cg.bookingUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
                <Button size="sm" variant="outline" className="text-xs gap-1.5 h-7">
                  <ExternalLink className="w-3 h-3" /> Book Now
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAppAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [campgrounds, setCampgrounds] = useState<Campground[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTab, setSearchTab] = useState<"curated" | "nationwide">("curated");
  const [cgSearch, setCgSearch] = useState("");
  const [cgState, setCgState] = useState("");
  const [cgHookup, setCgHookup] = useState("");
  const [cgRvLen, setCgRvLen] = useState("");
  const [addingId, setAddingId] = useState<number | null>(null);
  const [liveSearch, setLiveSearch] = useState("");
  const [liveState, setLiveState] = useState("");
  const [liveResults, setLiveResults] = useState<LiveCampground[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);

  const loadTrip = useCallback(async () => {
    try {
      const searchParams = window.location.search;
      const r = await fetch(`/api/trips/${id}${searchParams}`, { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      setTrip(d.trip);
      setStops(d.stops || []);
      setIsOwner(d.isOwner === true);
    } finally { setIsLoading(false); }
  }, [id]);

  useEffect(() => { loadTrip(); }, [loadTrip]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (cgSearch) params.set("q", cgSearch);
    if (cgState) params.set("state", cgState);
    if (cgHookup) params.set("hookup_type", cgHookup);
    if (cgRvLen) params.set("max_rv_length", cgRvLen);
    fetch(`/api/campgrounds?${params}`)
      .then((r) => r.json())
      .then((d) => setCampgrounds(d.campgrounds || []))
      .catch(() => {});
  }, [cgSearch, cgState, cgHookup, cgRvLen]);

  async function addStop(campgroundId: number) {
    setAddingId(campgroundId);
    try {
      const r = await fetch(`/api/trips/${id}/stops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ campgroundId }),
      });
      const d = await r.json();
      if (d.stop) setStops((prev) => [...prev, d.stop]);
    } finally { setAddingId(null); }
  }

  async function removeStop(stopId: number) {
    await fetch(`/api/trips/${id}/stops/${stopId}`, { method: "DELETE", credentials: "include" });
    setStops((prev) => prev.filter((s) => s.id !== stopId));
  }

  async function moveStop(index: number, dir: -1 | 1) {
    const newStops = [...stops];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= newStops.length) return;
    [newStops[index], newStops[swapIdx]] = [newStops[swapIdx], newStops[index]];
    newStops.forEach((s, i) => { s.stopOrder = i; });
    setStops(newStops);
    await Promise.all([
      fetch(`/api/trips/${id}/stops/${newStops[index].id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ stopOrder: index }) }),
      fetch(`/api/trips/${id}/stops/${newStops[swapIdx].id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ stopOrder: swapIdx }) }),
    ]);
  }

  useEffect(() => {
    if (searchTab !== "nationwide") return;
    const timer = setTimeout(async () => {
      setLiveLoading(true);
      try {
        const params = new URLSearchParams({ limit: "20" });
        if (liveSearch) params.set("q", liveSearch);
        if (liveState) params.set("state", liveState);
        const r = await fetch(`/api/campgrounds/live/search?${params}`);
        const d = await r.json();
        setLiveResults(d.campgrounds || []);
      } catch { }
      finally { setLiveLoading(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [liveSearch, liveState, searchTab]);

  async function addLiveStop(cg: LiveCampground) {
    setAddingId(-1);
    try {
      const importRes = await fetch("/api/campgrounds/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(cg),
      });
      const importData = await importRes.json();
      if (!importData.campground?.id) return;
      await addStop(importData.campground.id);
    } finally { setAddingId(null); }
  }

  async function generateShareLink() {
    try {
      const r = await fetch(`/api/trips/${id}/share`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (d.shareUrl) {
        const fullUrl = `${window.location.origin}${d.shareUrl}`;
        setShareLink(fullUrl);
        setShowSharePanel(true);
      }
    } catch { }
  }

  async function copyShareLink() {
    if (shareLink) {
      await navigator.clipboard.writeText(shareLink);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    }
  }

  async function updateStop(stopId: number, fields: Partial<Stop>) {
    await fetch(`/api/trips/${id}/stops/${stopId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(fields),
    });
    setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, ...fields } : s)));
  }

  const totalNights = stops.reduce((sum, s) => sum + (s.nights || 0), 0);
  const states = [...new Set(stops.map((s) => s.campground.state))];

  if (isLoading) return (
    <Layout>
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </Layout>
  );

  if (!trip) return (
    <Layout>
      <div className="text-center py-20">
        <p className="text-muted-foreground">Trip not found.</p>
        <Link href="/trips"><Button variant="ghost" className="mt-4">Back to Trips</Button></Link>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <SEO title="Trip Detail" noIndex />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/trips">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> My Trips
          </button>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold">{trip.name}</h1>
            {!isOwner && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded-full">
                <Map className="w-3.5 h-3.5" /> Shared trip — view only
              </div>
            )}
            {(trip.startDate || trip.endDate) && (
              <div className="flex items-center gap-2 text-muted-foreground mt-2 text-sm">
                <Calendar className="w-4 h-4" />
                {trip.startDate || "TBD"} → {trip.endDate || "TBD"}
              </div>
            )}
            {stops.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
                <span>{stops.length} stop{stops.length !== 1 ? "s" : ""}</span>
                {totalNights > 0 && <span>· {totalNights} nights</span>}
                {states.length > 0 && <span>· {states.join(", ")}</span>}
              </div>
            )}
          </div>
          {isOwner && (
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" onClick={generateShareLink} className="gap-2">
                <Share2 className="w-4 h-4" /> Share
              </Button>
              <Button onClick={() => setShowSearch(!showSearch)} className="gap-2">
                <Plus className="w-4 h-4" /> Add Campground
              </Button>
            </div>
          )}
        </div>

        {showSharePanel && shareLink && (
          <div className="mb-6 bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Share2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium mb-1">Share this trip</p>
              <p className="text-xs text-muted-foreground truncate">{shareLink}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={copyShareLink} className="gap-1.5">
                {copyDone ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copyDone ? "Copied!" : "Copy"}
              </Button>
              <button onClick={() => setShowSharePanel(false)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className={`grid gap-8 ${showSearch ? "lg:grid-cols-[1fr_380px]" : "grid-cols-1"}`}>
          <div className="space-y-4">
            {stops.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
                <MapPin className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-semibold mb-1">No stops yet</h3>
                {isOwner ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-4">Search for campgrounds and add stops to your itinerary.</p>
                    <Button onClick={() => setShowSearch(true)} className="gap-2"><Plus className="w-4 h-4" /> Add First Stop</Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">This trip has no stops planned yet.</p>
                )}
              </div>
            ) : (
              stops.map((stop, i) => (
                <StopRow
                  key={stop.id}
                  stop={stop}
                  index={i}
                  total={stops.length}
                  onMove={isOwner ? (dir) => moveStop(i, dir) : () => {}}
                  onRemove={isOwner ? () => removeStop(stop.id) : () => {}}
                  onUpdate={isOwner ? (fields) => updateStop(stop.id, fields) : () => {}}
                  readOnly={!isOwner}
                />
              ))
            )}
          </div>

          {showSearch && (
            <div className="lg:sticky lg:top-24 lg:self-start">
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Find Campgrounds</h3>
                    <button onClick={() => setShowSearch(false)} className="text-muted-foreground hover:text-foreground p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Source tabs */}
                  <div className="flex rounded-lg border border-border overflow-hidden mb-3 text-xs font-medium">
                    <button
                      onClick={() => setSearchTab("curated")}
                      className={`flex-1 py-2 transition-colors ${searchTab === "curated" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                    >
                      Curated (60)
                    </button>
                    <button
                      onClick={() => { setSearchTab("nationwide"); if (!liveSearch && !liveState) setLiveState(""); }}
                      className={`flex-1 py-2 transition-colors ${searchTab === "nationwide" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                    >
                      Nationwide (NPS)
                    </button>
                  </div>

                  {searchTab === "curated" ? (
                    <>
                      <div className="relative mb-3">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={cgSearch}
                          onChange={(e) => setCgSearch(e.target.value)}
                          placeholder="Search name or city..."
                          className="w-full border border-border rounded-lg pl-9 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <select value={cgState} onChange={(e) => setCgState(e.target.value)} className="border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/40">
                          <option value="">All States</option>
                          <option value="WA">Washington</option>
                          <option value="OR">Oregon</option>
                          <option value="ID">Idaho</option>
                          <option value="MT">Montana</option>
                        </select>
                        <select value={cgHookup} onChange={(e) => setCgHookup(e.target.value)} className="border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/40">
                          <option value="">Hookups</option>
                          <option value="full">Full</option>
                          <option value="water_electric">W+E</option>
                          <option value="dry">Dry</option>
                        </select>
                        <input
                          type="number"
                          value={cgRvLen}
                          onChange={(e) => setCgRvLen(e.target.value)}
                          placeholder="RV ft"
                          min="20"
                          max="80"
                          className="border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative mb-3">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={liveSearch}
                          onChange={(e) => setLiveSearch(e.target.value)}
                          placeholder="Search national park campgrounds..."
                          className="w-full border border-border rounded-lg pl-9 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                          autoFocus
                        />
                      </div>
                      <select value={liveState} onChange={(e) => setLiveState(e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/40">
                        <option value="">All States / Nationwide</option>
                        <option value="WA">Washington</option>
                        <option value="OR">Oregon</option>
                        <option value="ID">Idaho</option>
                        <option value="MT">Montana</option>
                        <option value="CA">California</option>
                        <option value="CO">Colorado</option>
                        <option value="UT">Utah</option>
                        <option value="AZ">Arizona</option>
                        <option value="WY">Wyoming</option>
                        <option value="AK">Alaska</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        Live data · National Park Service
                      </p>
                    </>
                  )}
                </div>

                <div className="overflow-y-auto max-h-[60vh] p-4 space-y-3">
                  {searchTab === "curated" ? (
                    campgrounds.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No campgrounds found.</p>
                    ) : campgrounds.map((cg) => (
                      <CampgroundCard
                        key={cg.id}
                        cg={cg}
                        onAdd={() => addStop(cg.id)}
                        adding={addingId === cg.id}
                      />
                    ))
                  ) : liveLoading ? (
                    <div className="flex justify-center py-10">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : liveResults.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">Search for a campground name, park, or location above.</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Powered by National Park Service</p>
                    </div>
                  ) : liveResults.map((cg) => (
                    <LiveCampgroundCard
                      key={cg.npsId}
                      cg={cg}
                      onAdd={() => addLiveStop(cg)}
                      adding={addingId === -1}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
