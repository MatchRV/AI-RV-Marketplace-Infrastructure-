import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useAppAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui-elements";
import { Link } from "wouter";
import { Map, Plus, Calendar, MapPin, ChevronRight, Tent, Trash2, Route, Star, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";

interface Trip {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  status: string;
  stopCount: number;
  createdAt: string;
}

function formatDate(d: string | null) {
  if (!d) return null;
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusColor(status: string) {
  if (status === "active") return "bg-green-100 text-green-700";
  if (status === "completed") return "bg-muted text-muted-foreground";
  return "bg-primary/10 text-primary";
}

const SAMPLE_STOPS = [
  {
    night: 1,
    name: "Deception Pass State Park",
    location: "Oak Harbor, WA",
    type: "State Park",
    hookups: "30-amp / Water",
    rating: 4.9,
    nights: 2,
    color: "#0B1117",
  },
  {
    night: 3,
    name: "Birch Bay State Park",
    location: "Blaine, WA",
    type: "State Park",
    hookups: "Full hookup",
    rating: 4.7,
    nights: 2,
    color: "#2a6a4a",
  },
  {
    night: 5,
    name: "Larrabee State Park",
    location: "Bellingham, WA",
    type: "State Park",
    hookups: "30-amp / Water",
    rating: 4.8,
    nights: 3,
    color: "#002829",
  },
];

function LoggedOutPreview({ login }: { login: () => void }) {
  return (
    <Layout>
      <SEO title="My Trips — Trip Planner" noIndex />
      {/* Hero */}
      <div className="bg-[#0B1117] text-white px-4 sm:px-8 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block bg-[#ffe08b] text-[#241a00] px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase mb-4">
            Trip Planner
          </span>
          <h1 className="font-display font-black text-4xl md:text-6xl tracking-tight mb-4">
            Plan Your Perfect<br />
            <span className="text-[#00CED1]">RV Adventure</span>
          </h1>
          <p className="text-white/80 text-lg max-w-xl mx-auto mb-8">
            Build multi-stop itineraries from 50+ curated PNW campgrounds with one-click booking links, hookup details, and drive-time estimates.
          </p>
          <button
            onClick={login}
            className="inline-flex items-center gap-2 bg-[#00CED1] text-[#0B1117] px-8 py-4 rounded-full font-black text-base hover:bg-white transition-colors shadow-xl"
          >
            Start Planning Free <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sample itinerary preview */}
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12">
        <div className="text-center mb-8">
          <p className="text-xs font-black uppercase tracking-widest text-[#924c00] mb-2">Sample Itinerary</p>
          <h2 className="font-display font-black text-2xl md:text-3xl text-[#161d1d]">Olympic Peninsula Loop · 7 nights</h2>
          <p className="text-[#6b7a7a] text-sm mt-1">Bellingham → Olympic → Hood Canal → Seattle</p>
        </div>

        {/* Trip timeline */}
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[#E2E8F0]" />
          <div className="space-y-4">
            {SAMPLE_STOPS.map((stop, i) => (
              <div key={i} className="relative flex gap-4 pl-14">
                {/* Timeline dot */}
                <div
                  className="absolute left-4 top-5 w-5 h-5 rounded-full border-2 border-white shadow-md flex items-center justify-center"
                  style={{ backgroundColor: stop.color }}
                >
                  <span className="text-[8px] font-black text-white">{i + 1}</span>
                </div>

                <div className="flex-1 bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black uppercase tracking-widest text-[#924c00]">
                          Night {stop.night}–{stop.night + stop.nights - 1} · {stop.type}
                        </span>
                      </div>
                      <h3 className="font-display font-bold text-lg text-[#161d1d] mb-1">{stop.name}</h3>
                      <div className="flex flex-wrap gap-3 text-xs text-[#6b7a7a]">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {stop.location}</span>
                        <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-[#ffe08b] text-[#ffe08b]" /> {stop.rating}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="bg-[#eef5f4] rounded-xl px-3 py-1.5 text-xs font-bold text-[#3b4949]">
                        {stop.hookups}
                      </div>
                      <div className="text-xs text-[#6b7a7a] mt-1">{stop.nights} nights</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Blurred "sign in" overlay on final stop */}
            <div className="relative flex gap-4 pl-14">
              <div className="absolute left-4 top-5 w-5 h-5 rounded-full bg-[#bac9c9] border-2 border-white shadow-md" />
              <div className="flex-1 bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm blur-[2px] select-none">
                <div className="h-4 w-32 bg-[#E2E8F0] rounded mb-2" />
                <div className="h-6 w-48 bg-[#E2E8F0] rounded mb-3" />
                <div className="h-3 w-24 bg-[#E2E8F0] rounded" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={login}
                  className="bg-[#0B1117] text-white px-6 py-2.5 rounded-full font-bold text-sm shadow-xl hover:bg-[#002829] transition-colors z-10"
                >
                  Sign in to see full trip
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Feature grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              icon: Map,
              title: "50+ PNW Campgrounds",
              desc: "Curated spots across WA, OR, ID & MT with hookup details, photos, and direct booking links.",
              color: "#0B1117",
            },
            {
              icon: Calendar,
              title: "Smart Itineraries",
              desc: "Set arrival dates, track nights at each campground, and get drive-time estimates between stops.",
              color: "#924c00",
            },
            {
              icon: MapPin,
              title: "One-Click Booking",
              desc: "Direct links to Recreation.gov, Oregon State Parks, and private resorts. No copy-pasting.",
              color: "#2a6a4a",
            },
          ].map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${color}15` }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <h3 className="font-bold text-[#161d1d] mb-2">{title}</h3>
              <p className="text-sm text-[#6b7a7a] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Final CTA */}
        <div className="mt-12 bg-[#0B1117] rounded-3xl p-8 text-center text-white">
          <h3 className="font-display font-black text-2xl mb-2">Ready to hit the road?</h3>
          <p className="text-white/70 mb-6">Sign in to save your itinerary and unlock one-click booking.</p>
          <button
            onClick={login}
            className="bg-[#00CED1] text-[#0B1117] px-8 py-4 rounded-full font-black hover:bg-white transition-colors shadow-lg"
          >
            Sign In to Start Planning Free
          </button>
        </div>
      </div>
    </Layout>
  );
}

export function Trips() {
  const { isAuthenticated, login } = useAppAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { setIsLoading(false); return; }
    fetch("/api/trips", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setTrips(d.trips || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newName.trim(), startDate: newStart || null, endDate: newEnd || null }),
      });
      const d = await r.json();
      if (d.trip) {
        setTrips((prev) => [{ ...d.trip, stopCount: 0 }, ...prev]);
        setShowNew(false);
        setNewName(""); setNewStart(""); setNewEnd("");
      }
    } finally { setCreating(false); }
  }

  async function handleDelete(tripId: number) {
    if (!confirm("Delete this trip?")) return;
    await fetch(`/api/trips/${tripId}`, { method: "DELETE", credentials: "include" });
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
  }

  if (!isAuthenticated) return <LoggedOutPreview login={login} />;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-[#161d1d]">My Trips</h1>
            <p className="text-[#6b7a7a] mt-1">Plan your PNW RV adventures</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Trip
          </Button>
        </div>

        {showNew && (
          <form onSubmit={handleCreate} className="bg-white border border-[#0B1117]/20 rounded-2xl p-6 mb-6 shadow-sm">
            <h3 className="font-semibold text-lg mb-4">Create a New Trip</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="block text-sm font-medium mb-1.5">Trip Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Olympic Peninsula Loop"
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm bg-[#f4fbfa] focus:outline-none focus:ring-2 focus:ring-[#0B1117]/30"
                  required autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm bg-[#f4fbfa] focus:outline-none focus:ring-2 focus:ring-[#0B1117]/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">End Date</label>
                <input
                  type="date"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm bg-[#f4fbfa] focus:outline-none focus:ring-2 focus:ring-[#0B1117]/30"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button type="submit" disabled={creating || !newName.trim()}>
                {creating ? "Creating..." : "Create Trip"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setShowNew(false); setNewName(""); }}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-[#eef5f4] animate-pulse" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-20">
            <Tent className="w-14 h-14 text-[#bac9c9] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-[#161d1d] mb-2">No trips yet</h3>
            <p className="text-[#6b7a7a] mb-6">Create your first trip to start building a campground itinerary.</p>
            <Button onClick={() => setShowNew(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Plan a Trip
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {trips.map((trip) => (
              <div key={trip.id} className="group bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden hover:border-[#0B1117]/30 hover:shadow-md transition-all">
                <Link href={`/trips/${trip.id}`}>
                  <div className="flex items-center justify-between p-5 cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-lg truncate text-[#161d1d]">{trip.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${statusColor(trip.status)}`}>
                          {trip.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#6b7a7a]">
                        {(trip.startDate || trip.endDate) && (
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(trip.startDate) || "TBD"}
                            {trip.endDate && trip.endDate !== trip.startDate && ` → ${formatDate(trip.endDate)}`}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {trip.stopCount} stop{trip.stopCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(trip.id); }}
                        className="p-2 text-[#6b7a7a] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete trip"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-5 h-5 text-[#6b7a7a] group-hover:text-[#0B1117] transition-colors" />
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
