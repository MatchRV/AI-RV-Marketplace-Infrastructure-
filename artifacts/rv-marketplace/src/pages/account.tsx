import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Button } from "@/components/ui-elements";
import { ListingCard } from "@/components/listing-card";
import { useAppAuth } from "@/contexts/auth-context";
import {
  User, Heart, Bell, Bookmark, MessageSquare, Map, Home,
  ArrowRight, Edit2, Check, X, Ruler, LogOut
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Listing } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL || "/";

interface DrivewayDims {
  driveway_length_ft: number | null;
  driveway_width_ft: number | null;
}

interface Trip {
  id: number;
  name: string;
  status: string;
  stop_count?: number;
  nights?: number;
}

interface AccountData {
  savedCount: number;
  alertsCount: number;
  searchesCount: number;
  tripsCount: number;
  messagesUnread: number;
  recentListings: Listing[];
  driveway: DrivewayDims;
  recentTrips: Trip[];
}

async function fetchAccountData(isAuthenticated: boolean): Promise<AccountData | null> {
  if (!isAuthenticated) return null;
  const creds = { credentials: "include" as RequestCredentials };
  try {
    const [savedRes, alertsRes, searchesRes, tripsRes, messagesRes, drivewayRes] = await Promise.all([
      fetch(`${BASE}api/user/saved`, creds),
      fetch(`${BASE}api/user/alerts`, creds),
      fetch(`${BASE}api/user/searches`, creds),
      fetch(`${BASE}api/trips`, creds),
      fetch(`${BASE}api/user/messages`, creds),
      fetch(`${BASE}api/user/driveway`, creds),
    ]);

    const [savedData, alertsData, searchesData, tripsData, messagesData, drivewayData] = await Promise.all([
      savedRes.ok ? savedRes.json() : { listings: [] },
      alertsRes.ok ? alertsRes.json() : { alerts: [] },
      searchesRes.ok ? searchesRes.json() : { searches: [] },
      tripsRes.ok ? tripsRes.json() : { trips: [] },
      messagesRes.ok ? messagesRes.json() : { messages: [] },
      drivewayRes.ok ? drivewayRes.json() : {},
    ]);

    return {
      savedCount: (savedData.listings ?? []).length,
      alertsCount: (alertsData.alerts ?? []).length,
      searchesCount: (searchesData.searches ?? []).length,
      tripsCount: (tripsData.trips ?? []).length,
      messagesUnread: (messagesData.messages ?? []).filter((m: { read: boolean }) => !m.read).length,
      recentListings: (savedData.listings ?? []).slice(0, 3),
      driveway: {
        driveway_length_ft: (drivewayData as { driveway_length_ft?: number | null }).driveway_length_ft ?? null,
        driveway_width_ft: (drivewayData as { driveway_width_ft?: number | null }).driveway_width_ft ?? null,
      },
      recentTrips: (tripsData.trips ?? []).slice(0, 3),
    };
  } catch {
    return null;
  }
}

export function Account() {
  const { user, isAuthenticated, isLoading: authLoading, login, logout } = useAppAuth();
  const [data, setData] = useState<AccountData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const [editingDriveway, setEditingDriveway] = useState(false);
  const [lengthInput, setLengthInput] = useState("");
  const [widthInput, setWidthInput] = useState("");
  const [savingDriveway, setSavingDriveway] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      setDataLoading(true);
      fetchAccountData(isAuthenticated).then((d) => {
        setData(d);
        if (d?.driveway) {
          setLengthInput(d.driveway.driveway_length_ft != null ? String(d.driveway.driveway_length_ft) : "");
          setWidthInput(d.driveway.driveway_width_ft != null ? String(d.driveway.driveway_width_ft) : "");
        }
        setDataLoading(false);
      });
    }
  }, [isAuthenticated, authLoading]);

  const handleSaveDriveway = async () => {
    setSavingDriveway(true);
    try {
      const res = await fetch(`${BASE}api/user/driveway`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          driveway_length_ft: lengthInput ? parseFloat(lengthInput) : null,
          driveway_width_ft: widthInput ? parseFloat(widthInput) : null,
        }),
      });
      if (res.ok) {
        setData((prev) =>
          prev ? {
            ...prev,
            driveway: {
              driveway_length_ft: lengthInput ? parseFloat(lengthInput) : null,
              driveway_width_ft: widthInput ? parseFloat(widthInput) : null,
            },
          } : prev
        );
        setEditingDriveway(false);
      }
    } finally {
      setSavingDriveway(false);
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-32">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-24 text-center px-4">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <User className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-3xl font-display font-bold mb-3">Your Account</h2>
          <p className="text-muted-foreground mb-8 max-w-md text-lg">
            Sign in to save listings, set price alerts, plan trips, and check driveway fit.
          </p>
          <Button size="lg" onClick={login} className="gap-2">
            <User className="w-5 h-5" />
            Sign In to Continue
          </Button>
        </div>
      </Layout>
    );
  }

  const hasDriveway = data?.driveway?.driveway_length_ft != null || data?.driveway?.driveway_width_ft != null;

  const stats = [
    { icon: Heart, label: "Saved", value: data?.savedCount ?? 0, href: "/saved", color: "text-red-500 bg-red-50 border-red-200" },
    { icon: Bell, label: "Alerts", value: data?.alertsCount ?? 0, href: "/alerts", color: "text-amber-500 bg-amber-50 border-amber-200" },
    { icon: Bookmark, label: "Searches", value: data?.searchesCount ?? 0, href: "/searches", color: "text-blue-500 bg-blue-50 border-blue-200" },
    { icon: Map, label: "Trips", value: data?.tripsCount ?? 0, href: "/trips", color: "text-green-500 bg-green-50 border-green-200" },
    {
      icon: MessageSquare,
      label: "Messages",
      value: data?.messagesUnread ?? 0,
      href: "/messages",
      color: "text-purple-500 bg-purple-50 border-purple-200",
      badge: (data?.messagesUnread ?? 0) > 0 ? "unread" : undefined,
    },
  ];

  const tripStatusColor = (status: string) => {
    if (status === "completed") return "bg-green-100 text-green-700";
    if (status === "active") return "bg-blue-100 text-blue-700";
    return "bg-muted text-muted-foreground";
  };

  const tripStatusLabel = (status: string) => {
    if (status === "completed") return "Completed";
    if (status === "active") return "Active";
    return "Planning";
  };

  return (
    <Layout>
      <SEO title="My Account" noIndex />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">

        {/* Profile Card */}
        <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-6">
          {user?.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt=""
              className="w-20 h-20 rounded-full object-cover ring-4 ring-primary/20 flex-shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="w-10 h-10 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-display font-bold truncate">
              {user?.firstName && user?.lastName
                ? `${user.firstName} ${user.lastName}`
                : ((user ?? {}) as { username?: string }).username ?? "My Account"}
            </h1>
            {user?.email && (
              <p className="text-muted-foreground text-sm mt-1 truncate">{user.email}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">Member since {new Date().getFullYear()}</p>
          </div>
          <button
            onClick={logout}
            className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground hover:text-red-500 transition-colors border border-border rounded-xl px-4 py-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        {/* Stats Grid */}
        <div>
          <h2 className="text-lg font-bold mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {stats.map((s) => (
              <Link key={s.href} href={s.href}>
                <div className={`border rounded-xl p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all cursor-pointer text-center ${s.color}`}>
                  <s.icon className="w-6 h-6" />
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-xs font-medium">{s.label}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Driveway Settings */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Home className="w-5 h-5 text-primary" />
              Driveway Settings
            </h2>
            {!editingDriveway && (
              <button
                onClick={() => setEditingDriveway(true)}
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Edit2 className="w-4 h-4" />
                {hasDriveway ? "Edit" : "Set up"}
              </button>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            {!editingDriveway ? (
              <div>
                {hasDriveway ? (
                  <div className="flex flex-col sm:flex-row gap-6">
                    <div className="flex-1">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-muted rounded-xl p-4 text-center">
                          <div className="text-xs text-muted-foreground mb-1">Length</div>
                          <div className="text-2xl font-bold">{data?.driveway?.driveway_length_ft ?? "—"} ft</div>
                        </div>
                        <div className="bg-muted rounded-xl p-4 text-center">
                          <div className="text-xs text-muted-foreground mb-1">Width</div>
                          <div className="text-2xl font-bold">{data?.driveway?.driveway_width_ft ?? "—"} ft</div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Listings will automatically show whether an RV fits your driveway.
                      </p>
                    </div>
                    {/* Mini SVG diagram */}
                    <div className="flex-shrink-0 flex items-center justify-center">
                      <svg viewBox="0 0 180 100" width="180" height="100" xmlns="http://www.w3.org/2000/svg">
                        <rect x="5" y="5" width="170" height="90" rx="6" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1.5" />
                        <rect x="12" y="12" width="156" height="76" rx="4" fill="hsl(var(--background))" stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4,2" />
                        <rect x="55" y="28" width="80" height="44" rx="3" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="2" />
                        <text x="95" y="53" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#22c55e">RV</text>
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Ruler className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground mb-4">No driveway dimensions saved yet.</p>
                    <p className="text-sm text-muted-foreground mb-5">
                      Add your driveway size to get fit badges on every listing page.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setEditingDriveway(true)} className="gap-2">
                      <Ruler className="w-4 h-4" /> Set Driveway Dimensions
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Driveway Length (ft)</label>
                    <input
                      type="number"
                      value={lengthInput}
                      onChange={(e) => setLengthInput(e.target.value)}
                      placeholder="e.g. 45"
                      className="w-full h-11 px-4 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Driveway Width (ft)</label>
                    <input
                      type="number"
                      value={widthInput}
                      onChange={(e) => setWidthInput(e.target.value)}
                      placeholder="e.g. 12"
                      className="w-full h-11 px-4 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleSaveDriveway} disabled={savingDriveway} className="gap-2" size="sm">
                    <Check className="w-4 h-4" />
                    {savingDriveway ? "Saving…" : "Save Dimensions"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingDriveway(false);
                      setLengthInput(data?.driveway?.driveway_length_ft != null ? String(data.driveway.driveway_length_ft) : "");
                      setWidthInput(data?.driveway?.driveway_width_ft != null ? String(data.driveway.driveway_width_ft) : "");
                    }}
                    className="gap-2"
                  >
                    <X className="w-4 h-4" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Saved Listings */}
        {!dataLoading && (data?.savedCount ?? 0) > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-500" />
                Saved Listings
              </h2>
              {(data?.savedCount ?? 0) > 3 && (
                <Link href="/saved" className="flex items-center gap-1 text-sm text-primary hover:underline">
                  View all {data?.savedCount} <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {(data?.recentListings ?? []).map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </div>
        )}

        {/* Recent Trips */}
        {!dataLoading && (data?.tripsCount ?? 0) > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Map className="w-5 h-5 text-green-600" />
                My Trips
              </h2>
              <Link href="/trips" className="flex items-center gap-1 text-sm text-primary hover:underline">
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {(data?.recentTrips ?? []).map((trip) => (
                <Link key={trip.id} href={`/trips/${trip.id}`}>
                  <div className="bg-card border border-border rounded-xl px-5 py-4 flex items-center justify-between hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer">
                    <div>
                      <div className="font-medium">{trip.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {trip.stop_count != null ? `${trip.stop_count} stops` : "No stops yet"}
                        {trip.nights ? ` · ${trip.nights} nights` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${tripStatusColor(trip.status)}`}>
                        {tripStatusLabel(trip.status)}
                      </span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no data yet */}
        {!dataLoading && (data?.savedCount ?? 0) === 0 && (data?.tripsCount ?? 0) === 0 && (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <Bookmark className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Your account is ready!</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Start saving listings, setting price alerts, and building trip plans. It all lives here.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/browse">
                <Button size="sm">Browse RVs</Button>
              </Link>
              <Link href="/trips">
                <Button size="sm" variant="outline">Plan a Trip</Button>
              </Link>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
