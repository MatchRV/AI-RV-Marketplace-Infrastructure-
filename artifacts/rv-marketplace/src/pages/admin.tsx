import { useState, useEffect, useCallback } from "react";
import { SEO } from "@/components/seo";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Lock, Eye, Search, MessageSquare, Truck, Activity, TrendingUp, Users, RefreshCw,
  Target, ChevronDown, ChevronUp, Phone, User, Home, DollarSign, Calendar,
  CheckCircle, Clock, XCircle, Database, Play, Zap, AlertTriangle, Radio, Upload, List, type LucideIcon
} from "lucide-react";

const BASE = import.meta.env.BASE_URL || "/";

// ─── Analytics types ───────────────────────────────────────────────────────

interface SummaryData {
  totalEvents: number;
  listingViews: number;
  searches: number;
  outfitterSessions: number;
  towChecks: number;
  pageViews: number;
  days: number;
}
interface DealerView { dealer_id: number; dealer_name: string; view_count: string; unique_visitors: string; }
interface TopListing { listing_id: number; listing_title: string; dealer_name: string; view_count: string; unique_visitors: string; }
interface RvTypeCount { rv_type: string; count: string; }
interface StateCount { state: string; count: string; }
interface BudgetEntry { range: string; count: number; }
interface TowVehicle { make: string; model: string; count: string; }
interface UseCaseEntry { use_case: string; count: string; }
interface TimelineRow { date: string; count: string; }
interface DashboardData {
  summary: SummaryData;
  dealers: { dealers: DealerView[] };
  topListings: { listings: TopListing[] };
  searchTrends: { types: RvTypeCount[]; states: StateCount[] };
  towVehicles: { vehicles: TowVehicle[] };
  outfitter: { rvTypes: RvTypeCount[]; useCases: UseCaseEntry[] };
  timeline: { timeline: TimelineRow[] };
  budgets: { budgets: BudgetEntry[] };
}

// ─── Activity types ────────────────────────────────────────────────────────

interface ActivityEvent {
  id: number;
  eventType: string;
  sessionId: string | null;
  listingId: number | null;
  dealerId: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── Leads types ───────────────────────────────────────────────────────────

interface ListingSnapshot {
  title?: string; make?: string; model?: string; year?: number; price?: number;
  type?: string; dealerName?: string; dealerCity?: string; dealerState?: string;
}
interface BuyerProfile {
  rvType?: string; useCase?: string; travelers?: number; hasKids?: boolean; hasPets?: boolean;
  hasTrade?: boolean; towVehicle?: string; paymentType?: string; minBudget?: number;
  maxBudget?: number; monthlyPayment?: number; downPayment?: number; minLength?: number;
  maxLength?: number; experience?: string; campingStyle?: string; activities?: string[];
}
interface ConvMessage { role: string; content: string; }
interface Lead {
  id: number;
  sessionId?: string;
  listingId?: number;
  dealerId?: number;
  listingSnapshot: ListingSnapshot;
  buyerProfile: BuyerProfile;
  conversation: ConvMessage[];
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  message?: string;
  leadSource: string;
  status: string;
  notes?: string;
  crmSyncStatus?: string | null;
  createdAt: string;
}

// ─── KPI types ─────────────────────────────────────────────────────────────

interface KpiData {
  reportFunnel: { quizStarts: number; quizCompletes: number; reportsGenerated: number; unlockAttempts: number; completionRate: number | null };
  costEstimate: { reportsGenerated: number; costPerReport: number; totalCost: number; grossRevenue: number; agentRevenue: number };
  leadQuality: { totalLeads: number; qualified: number; withAiProfile: number; reportPurchases: number; agentInquiries: number; leadQualifiedRate: number | null };
  returnVisitors: { returnVisits: number; totalSessions: number; returnRate: number | null };
  topKeywords: { keyword: string; count: number }[];
  topLandingPages: { page: string; count: number }[];
  dealerInterest: { dealer_id: number; dealer_name: string; total_views: number; unique_visitors: number }[];
  days: number;
}

// ─── Data hooks ────────────────────────────────────────────────────────────

function useKpiData(adminKey: string, days: number) {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchKpis = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    const qs = days === 0 ? "?days=0" : `?days=${days}`;
    try {
      const r = await fetch(`${BASE}api/admin/analytics/kpis${qs}`, { headers: { "x-admin-key": adminKey } });
      if (!r.ok) { setData(null); setLoading(false); return; }
      setData(await r.json());
    } catch { setData(null); }
    setLoading(false);
  }, [adminKey, days]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);
  return { data, loading, refresh: fetchKpis };
}

function useAdminData(adminKey: string, days: number) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    const headers = { "x-admin-key": adminKey };
    const qs = days === 0 ? "?days=0" : `?days=${days}`;
    try {
      const results = await Promise.allSettled([
        fetch(`${BASE}api/admin/analytics/summary${qs}`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}api/admin/analytics/dealer-views${qs}`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}api/admin/analytics/top-listings${qs}`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}api/admin/analytics/search-trends${qs}`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}api/admin/analytics/tow-vehicles${qs}`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}api/admin/analytics/outfitter-insights${qs}`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}api/admin/analytics/timeline${qs}`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}api/admin/analytics/budgets${qs}`, { headers }).then(r => r.ok ? r.json() : null),
      ]);
      const [summary, dealers, topListings, searchTrends, towVehicles, outfitter, timeline, budgets] =
        results.map(r => r.status === "fulfilled" ? r.value : null);
      if (!summary) { setData(null); setLoading(false); return; }
      setData({
        summary: summary ?? { totalEvents: 0, listingViews: 0, searches: 0, outfitterSessions: 0, towChecks: 0, pageViews: 0, days },
        dealers: dealers ?? { dealers: [] },
        topListings: topListings ?? { listings: [] },
        searchTrends: searchTrends ?? { types: [], states: [] },
        towVehicles: towVehicles ?? { vehicles: [] },
        outfitter: outfitter ?? { rvTypes: [], useCases: [] },
        timeline: timeline ?? { timeline: [] },
        budgets: budgets ?? { budgets: [] },
      });
    } catch { setData(null); }
    setLoading(false);
  }, [adminKey, days]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  return { data, loading, refresh: fetchAll };
}

function useLeadsData(adminKey: string) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchLeads = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    const headers = { "x-admin-key": adminKey };
    let qs = "";
    if (statusFilter === "crm_failed") {
      qs = "?crmStatus=failed";
    } else if (statusFilter !== "all") {
      qs = `?status=${statusFilter}`;
    }
    try {
      const r = await fetch(`${BASE}api/admin/leads${qs}`, { headers });
      if (!r.ok) { setLeads([]); setLoading(false); return; }
      const data = await r.json();
      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
      setNewCount(data.newCount ?? 0);
    } catch { setLeads([]); }
    setLoading(false);
  }, [adminKey, statusFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const updateLeadStatus = async (id: number, status: string, notes?: string) => {
    const headers = { "x-admin-key": adminKey, "Content-Type": "application/json" };
    await fetch(`${BASE}api/admin/leads/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status, notes }),
    });
    fetchLeads();
  };

  const retryCrmSync = async (id: number): Promise<{ ok: boolean; crmSyncStatus: string }> => {
    const headers = { "x-admin-key": adminKey, "Content-Type": "application/json" };
    const r = await fetch(`${BASE}api/admin/leads/${id}/retry-crm`, { method: "POST", headers });
    const data = await r.json();
    fetchLeads();
    if (!r.ok && data.crmSyncStatus) return { ok: false, crmSyncStatus: data.crmSyncStatus };
    if (!r.ok) throw new Error(data.message ?? "Retry failed");
    return data;
  };

  return { leads, total, newCount, loading, statusFilter, setStatusFilter, refresh: fetchLeads, updateLeadStatus, retryCrmSync };
}

// ─── Import runs types ─────────────────────────────────────────────────────

interface ImportRun {
  id: number;
  imported_at: string;
  source_ip: string | null;
  dealers_inserted: number;
  dealers_updated: number;
  listings_inserted: number;
  listings_updated: number;
  listings_skipped: number;
  duration_ms: number | null;
  error: string | null;
}

function useImportRunsData(adminKey: string) {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRuns = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/admin/import-runs`, { headers: { "x-admin-key": adminKey } });
      if (!r.ok) { setRuns([]); setLoading(false); return; }
      const data = await r.json();
      setRuns(data.runs ?? []);
    } catch { setRuns([]); }
    setLoading(false);
  }, [adminKey]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);
  return { runs, loading, refresh: fetchRuns };
}

function useActivityData(adminKey: string) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const loadEvents = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/admin/analytics/recent-events`, { headers: { "x-admin-key": adminKey } });
      if (!r.ok) { setEvents([]); setLoading(false); return; }
      const data = await r.json();
      setEvents(data.events ?? []);
    } catch { setEvents([]); }
    setLoading(false);
  }, [adminKey]);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  return { events, loading, refresh: loadEvents };
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  travel_trailer: "Travel Trailer", fifth_wheel: "Fifth Wheel",
  class_a: "Class A", class_b: "Class B", class_c: "Class C",
  toy_hauler: "Toy Hauler", popup_camper: "Pop-Up", truck_camper: "Truck Camper",
};
const TIME_RANGES: { label: string; value: number }[] = [
  { label: "7d", value: 7 }, { label: "30d", value: 30 }, { label: "All", value: 0 },
];
const SOURCE_LABELS: Record<string, string> = {
  contact_dealer: "Contacted Dealer",
  saved_listing: "Saved Listing",
  outfitter_match: "AI Outfitter Match",
};
const STATUS_COLORS: Record<string, string> = {
  new: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  contacted: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  closed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

// ─── Main component ────────────────────────────────────────────────────────

export function Admin() {
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<"leads" | "analytics" | "kpis" | "scraper" | "activity" | "imports">("leads");
  const [hasScraperData, setHasScraperData] = useState<boolean | null>(null);

  const { data, loading: analyticsLoading, refresh: refreshAnalytics } = useAdminData(authenticated ? adminKey : "", days);
  const { data: kpiData, loading: kpiLoading, refresh: refreshKpis } = useKpiData(authenticated ? adminKey : "", days);
  const { leads, total, newCount, loading: leadsLoading, statusFilter, setStatusFilter, refresh: refreshLeads, updateLeadStatus, retryCrmSync } =
    useLeadsData(authenticated ? adminKey : "");
  const { events: activityEvents, loading: activityLoading, refresh: refreshActivity } =
    useActivityData(authenticated ? adminKey : "");
  const { runs: importRuns, loading: importsLoading, refresh: refreshImports } =
    useImportRunsData(authenticated ? adminKey : "");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const r = await fetch(`${BASE}api/admin/stats`, { headers: { "x-admin-key": keyInput } });
      if (!r.ok) {
        setLoginError("Invalid key — please try again");
        setLoginLoading(false);
        return;
      }
      setAdminKey(keyInput);
      setAuthenticated(true);
      // check scraper status right after login
      fetch(`${BASE}api/admin/scrape-status`, { headers: { "x-admin-key": keyInput } })
        .then(r => r.json())
        .then(d => setHasScraperData((d.data_files ?? 0) > 0))
        .catch(() => setHasScraperData(false));
    } catch {
      setLoginError("Connection error — please try again");
    }
    setLoginLoading(false);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
              <Lock className="w-8 h-8 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">RV Marketplace Admin</h1>
            <p className="text-gray-400 text-sm">Private dashboard — owner access only</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="Enter admin key"
              className="w-full h-12 px-4 rounded-xl bg-gray-900 border border-gray-800 text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {loginLoading ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Verifying…</>
              ) : "Access Dashboard"}
            </button>
          </form>
          {loginError && (
            <p className="text-red-400 text-sm text-center mt-4">{loginError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SEO title="Admin Dashboard" noIndex />
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">RV Marketplace Admin</h1>
            <p className="text-xs text-gray-500">Owner intelligence dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            {(activeTab === "analytics" || activeTab === "kpis") && (
              <div className="flex bg-gray-900 rounded-lg border border-gray-800 overflow-hidden text-sm">
                {TIME_RANGES.map(tr => (
                  <button
                    key={tr.label}
                    className={`px-4 py-2 font-medium transition ${days === tr.value ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
                    onClick={() => setDays(tr.value)}
                  >
                    {tr.label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                if (activeTab === "leads") refreshLeads();
                else if (activeTab === "activity") refreshActivity();
                else if (activeTab === "kpis") refreshKpis();
                else if (activeTab === "imports") refreshImports();
                else refreshAnalytics();
              }}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
            >
              <RefreshCw className={`w-5 h-5 ${(leadsLoading || analyticsLoading || activityLoading || kpiLoading) ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 pb-0">
          <button
            onClick={() => setActiveTab("leads")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "leads"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <Target className="w-4 h-4" />
            Leads
            {newCount > 0 && (
              <span className="bg-amber-500 text-gray-900 text-xs font-black px-2 py-0.5 rounded-full">
                {newCount} NEW
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "analytics"
                ? "border-indigo-400 text-indigo-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <Activity className="w-4 h-4" />
            Analytics
          </button>
          <button
            onClick={() => setActiveTab("scraper")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "scraper"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <Database className="w-4 h-4" />
            Run Scraper
            {hasScraperData === false && (
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("kpis")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "kpis"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            KPIs
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "activity"
                ? "border-purple-400 text-purple-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <Radio className="w-4 h-4" />
            Activity Feed
          </button>
          <button
            onClick={() => setActiveTab("imports")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "imports"
                ? "border-teal-400 text-teal-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <List className="w-4 h-4" />
            Imports
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {hasScraperData === false && activeTab !== "scraper" && (
          <button
            onClick={() => setActiveTab("scraper")}
            className="w-full mb-6 flex items-center gap-4 px-5 py-4 rounded-2xl border border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 transition text-left group"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <Database className="w-5 h-5 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-orange-300 text-sm">No live inventory fetched yet</div>
              <div className="text-xs text-gray-500 mt-0.5">Click here — or the <strong className="text-gray-400">Run Scraper</strong> tab — to pull live inventory from all 62 WA dealers.</div>
            </div>
            <div className="text-orange-500 text-xs font-semibold group-hover:translate-x-0.5 transition-transform">Go →</div>
          </button>
        )}
        {activeTab === "leads" && (
          <LeadsTab
            leads={leads}
            total={total}
            newCount={newCount}
            loading={leadsLoading}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            updateLeadStatus={updateLeadStatus}
            retryCrmSync={retryCrmSync}
          />
        )}
        {activeTab === "analytics" && data && (
          <AnalyticsTab data={data} days={days} />
        )}
        {activeTab === "scraper" && (
          <ScraperTab adminKey={adminKey} onDataChange={setHasScraperData} />
        )}
        {activeTab === "kpis" && (
          <KpisTab data={kpiData} loading={kpiLoading} days={days} />
        )}
        {activeTab === "activity" && (
          <ActivityTab events={activityEvents} loading={activityLoading} onRefresh={refreshActivity} />
        )}
        {activeTab === "imports" && (
          <ImportsTab runs={importRuns} loading={importsLoading} onRefresh={refreshImports} />
        )}
      </main>
    </div>
  );
}

// ─── KPIs Tab ───────────────────────────────────────────────────────────────

function KpisTab({ data, loading, days }: { data: KpiData | null; loading: boolean; days: number }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        Loading KPIs…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
        No KPI data available. Ensure there is activity recorded.
      </div>
    );
  }

  const { reportFunnel, costEstimate, leadQuality, returnVisitors, topKeywords, topLandingPages, dealerInterest } = data;
  const periodLabel = days === 0 ? "All time" : `Last ${days}d`;

  return (
    <div className="space-y-8">
      {/* Revenue snapshot */}
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Revenue Snapshot · {periodLabel}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Report Purchases", value: leadQuality.reportPurchases, color: "text-emerald-400", prefix: "" },
            { label: "Gross Revenue", value: `$${costEstimate.grossRevenue.toFixed(2)}`, color: "text-emerald-300", prefix: "" },
            { label: "Agent Inquiries", value: leadQuality.agentInquiries, color: "text-amber-400", prefix: "" },
            { label: "Est. Agent Revenue", value: `$${costEstimate.agentRevenue.toLocaleString()}`, color: "text-amber-300", prefix: "" },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Funnel */}
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Match Report Funnel · {periodLabel}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Quiz Starts", value: reportFunnel.quizStarts, color: "text-white" },
            { label: "Quiz Completes", value: reportFunnel.quizCompletes, color: "text-cyan-400" },
            { label: "Reports Generated", value: reportFunnel.reportsGenerated, color: "text-indigo-400" },
            { label: "Unlock Attempts", value: reportFunnel.unlockAttempts, color: "text-emerald-400" },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">{s.label}</div>
            </div>
          ))}
        </div>
        {reportFunnel.completionRate !== null && (
          <div className="mt-3 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-300">
            Completion rate: <span className="font-bold text-white">{reportFunnel.completionRate}%</span>
            <span className="text-gray-600 ml-2">(quiz starts → reports generated)</span>
          </div>
        )}
      </div>

      {/* Lead quality + return visitors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Lead Quality · {periodLabel}</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {[
              { label: "Total Leads", value: leadQuality.totalLeads },
              { label: "Qualified (contacted/closed)", value: leadQuality.qualified },
              { label: "With AI Profile", value: leadQuality.withAiProfile },
              { label: "Report Purchase Leads", value: leadQuality.reportPurchases },
              { label: "Buyers Agent Inquiries", value: leadQuality.agentInquiries },
            ].map((row, i) => (
              <div key={row.label} className={`flex items-center justify-between px-5 py-3 ${i < 4 ? "border-b border-gray-800" : ""}`}>
                <span className="text-sm text-gray-400">{row.label}</span>
                <span className="font-bold text-white">{row.value}</span>
              </div>
            ))}
            {leadQuality.leadQualifiedRate !== null && (
              <div className="px-5 py-3 bg-gray-950 text-xs text-gray-500">
                Qualified rate: <span className="text-white font-bold">{leadQuality.leadQualifiedRate}%</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Return Visitors · {periodLabel}</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {[
              { label: "Total Sessions", value: returnVisitors.totalSessions },
              { label: "Return Visits", value: returnVisitors.returnVisits },
            ].map((row, i) => (
              <div key={row.label} className={`flex items-center justify-between px-5 py-3 ${i < 1 ? "border-b border-gray-800" : ""}`}>
                <span className="text-sm text-gray-400">{row.label}</span>
                <span className="font-bold text-white">{row.value}</span>
              </div>
            ))}
            {returnVisitors.returnRate !== null && (
              <div className="px-5 py-3 bg-gray-950 text-xs text-gray-500">
                Return rate: <span className="text-white font-bold">{returnVisitors.returnRate}%</span>
              </div>
            )}
          </div>

          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3 mt-6">AI Cost Estimate · {periodLabel}</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {[
              { label: "Reports Generated", value: costEstimate.reportsGenerated },
              { label: "Est. Cost / Report", value: `$${costEstimate.costPerReport}` },
              { label: "Est. Total AI Cost", value: `$${costEstimate.totalCost.toFixed(2)}` },
            ].map((row, i) => (
              <div key={row.label} className={`flex items-center justify-between px-5 py-3 ${i < 2 ? "border-b border-gray-800" : ""}`}>
                <span className="text-sm text-gray-400">{row.label}</span>
                <span className="font-bold text-white">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top keywords */}
      {topKeywords.length > 0 && (
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Top Buyer Intent Keywords · {periodLabel}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {topKeywords.map(k => (
              <div key={k.keyword} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-300 capitalize">{k.keyword.replace(/_/g, " ")}</span>
                <span className="text-sm font-bold text-indigo-400 ml-2">{k.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top landing pages */}
      {topLandingPages.length > 0 && (
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Top Landing Pages · {periodLabel}</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {topLandingPages.map((p, i) => (
              <div key={p.page} className={`flex items-center justify-between px-5 py-3 ${i < topLandingPages.length - 1 ? "border-b border-gray-800" : ""}`}>
                <span className="text-sm text-gray-400 font-mono">{p.page || "/"}</span>
                <span className="font-bold text-white">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dealer interest */}
      {dealerInterest.length > 0 && (
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Dealer Interest (by Listing Views) · {periodLabel}</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-3 text-[10px] font-black uppercase tracking-widest text-gray-600 px-5 py-2 border-b border-gray-800">
              <span>Dealer</span><span className="text-right">Total Views</span><span className="text-right">Unique Visitors</span>
            </div>
            {dealerInterest.map((d, i) => (
              <div key={d.dealer_id} className={`grid grid-cols-3 px-5 py-3 ${i < dealerInterest.length - 1 ? "border-b border-gray-800/60" : ""}`}>
                <span className="text-sm text-gray-300 truncate">{d.dealer_name}</span>
                <span className="text-sm font-bold text-white text-right">{d.total_views}</span>
                <span className="text-sm text-cyan-400 font-bold text-right">{d.unique_visitors}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Leads Tab ─────────────────────────────────────────────────────────────

function LeadsTab({
  leads, total, newCount, loading, statusFilter, setStatusFilter, updateLeadStatus, retryCrmSync
}: {
  leads: Lead[]; total: number; newCount: number; loading: boolean;
  statusFilter: string; setStatusFilter: (s: string) => void;
  updateLeadStatus: (id: number, status: string, notes?: string) => Promise<void>;
  retryCrmSync: (id: number) => Promise<{ ok: boolean; crmSyncStatus: string }>;
}) {
  const crmFailedCount = leads.filter(l => l.crmSyncStatus === "failed").length;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{total}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Total Leads</div>
        </div>
        <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-amber-400">{newCount}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">New / Uncontacted</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-emerald-400">
            {leads.filter(l => l.buyerProfile && Object.keys(l.buyerProfile).length > 0).length}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">With AI Profile</div>
        </div>
        <div className={`bg-gray-900 rounded-xl p-4 border ${crmFailedCount > 0 ? "border-red-500/40" : "border-gray-800"}`}>
          <div className={`text-2xl font-bold ${crmFailedCount > 0 ? "text-red-400" : "text-gray-500"}`}>{crmFailedCount}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">CRM Sync Failed</div>
        </div>
      </div>

      {/* CRM failure banner */}
      {crmFailedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">
            <span className="font-bold">{crmFailedCount} lead{crmFailedCount !== 1 ? "s" : ""}</span> failed to sync to the CRM. Expand the card and click <span className="font-bold">Retry CRM Sync</span> to re-submit.
          </p>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 uppercase tracking-wider mr-2">Filter:</span>
        {["all", "new", "contacted", "closed"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition capitalize ${
              statusFilter === s
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "bg-gray-900 border-gray-700 text-gray-400 hover:text-white"
            }`}
          >
            {s === "all" ? "All Leads" : s}
          </button>
        ))}
        <button
          onClick={() => setStatusFilter("crm_failed")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold border transition flex items-center gap-1.5 ${
            statusFilter === "crm_failed"
              ? "bg-red-600 border-red-500 text-white"
              : "bg-gray-900 border-red-500/40 text-red-400 hover:border-red-500 hover:text-red-300"
          }`}
        >
          <AlertTriangle className="w-3 h-3" />
          CRM Failed
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && leads.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
          <Target className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No leads yet — they'll appear here when buyers contact dealers or save listings</p>
        </div>
      )}

      <div className="space-y-4">
        {leads.map(lead => (
          <LeadCard key={lead.id} lead={lead} onUpdateStatus={updateLeadStatus} onRetryCrm={retryCrmSync} />
        ))}
      </div>
    </div>
  );
}

function LeadCard({ lead, onUpdateStatus, onRetryCrm }: {
  lead: Lead;
  onUpdateStatus: (id: number, status: string, notes?: string) => Promise<void>;
  onRetryCrm: (id: number) => Promise<{ ok: boolean; crmSyncStatus: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [crmRetrying, setCrmRetrying] = useState(false);
  const [crmRetryResult, setCrmRetryResult] = useState<{ ok: boolean; crmSyncStatus: string } | null>(null);
  const snap = lead.listingSnapshot ?? {};
  const profile = lead.buyerProfile ?? {};

  const handleRetryCrm = async () => {
    setCrmRetrying(true);
    setCrmRetryResult(null);
    try {
      const result = await onRetryCrm(lead.id);
      setCrmRetryResult(result);
    } catch {
      setCrmRetryResult({ ok: false, crmSyncStatus: "failed" });
    } finally {
      setCrmRetrying(false);
    }
  };

  const handleStatus = async (status: string) => {
    setSaving(true);
    await onUpdateStatus(lead.id, status, notes);
    setSaving(false);
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    await onUpdateStatus(lead.id, lead.status, notes);
    setSaving(false);
  };

  const formatCurrency = (v?: number) => v ? `$${v.toLocaleString()}` : null;
  const profileHasData = profile && Object.values(profile).some(v => v !== null && v !== undefined);

  const effectiveCrmStatus = crmRetryResult?.crmSyncStatus ?? lead.crmSyncStatus;

  return (
    <div className={`bg-gray-900 border rounded-2xl overflow-hidden transition ${
      lead.crmSyncStatus === "failed" && !crmRetryResult ? "border-red-500/30" : lead.status === "new" ? "border-amber-500/40" : "border-gray-800"
    }`}>
      {/* Header row */}
      <div className="p-5 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_COLORS[lead.status] ?? STATUS_COLORS.new}`}>
              {lead.status.toUpperCase()}
            </span>
            {effectiveCrmStatus === "failed" && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full border border-red-500/40 bg-red-500/10 text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> CRM Failed
              </span>
            )}
            {effectiveCrmStatus === "synced" && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> CRM Synced
              </span>
            )}
            {effectiveCrmStatus === "pending" && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full border border-gray-600 bg-gray-800 text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> CRM Pending
              </span>
            )}
            <span className="text-xs text-gray-500 bg-gray-800 px-2.5 py-1 rounded-full">
              {SOURCE_LABELS[lead.leadSource] ?? lead.leadSource}
            </span>
            <span className="text-xs text-gray-600">
              {new Date(lead.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </div>

          {/* RV info */}
          {snap.title || snap.make ? (
            <h3 className="font-bold text-white text-base mb-0.5">
              {snap.year && `${snap.year} `}{snap.make} {snap.model}
            </h3>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-400">
            {snap.dealerName && <span><span className="text-gray-600">Dealer:</span> {snap.dealerName}{snap.dealerCity ? `, ${snap.dealerCity}` : ""}{snap.dealerState ? `, ${snap.dealerState}` : ""}</span>}
            {snap.price && <span className="font-bold text-emerald-400">{formatCurrency(snap.price)}</span>}
            {snap.type && <span className="text-gray-500">{TYPE_LABELS[snap.type] ?? snap.type}</span>}
          </div>

          {/* Buyer message */}
          {lead.message && (
            <div className="mt-3 p-3 bg-gray-800/60 rounded-xl text-sm text-gray-300 italic border border-gray-700">
              "{lead.message}"
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition"
        >
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-800 p-5 space-y-6">

          {/* Quick profile summary */}
          {profileHasData && (
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-3">AI Outfitter Buyer Profile</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {profile.rvType && <ProfileChip icon={Home} label="RV Type" value={TYPE_LABELS[profile.rvType as string] ?? String(profile.rvType)} />}
                {profile.useCase && <ProfileChip icon={Calendar} label="Use Case" value={String(profile.useCase)} />}
                {profile.travelers && <ProfileChip icon={Users} label="Travelers" value={String(profile.travelers)} />}
                {profile.paymentType && <ProfileChip icon={DollarSign} label="Payment Type" value={String(profile.paymentType)} />}
                {profile.monthlyPayment && <ProfileChip icon={DollarSign} label="Monthly Pymt" value={formatCurrency(profile.monthlyPayment as number) ?? ""} />}
                {profile.downPayment && <ProfileChip icon={DollarSign} label="Down Pymt" value={formatCurrency(profile.downPayment as number) ?? ""} />}
                {profile.maxBudget && <ProfileChip icon={DollarSign} label="Max Budget" value={formatCurrency(profile.maxBudget as number) ?? ""} />}
                {profile.towVehicle && <ProfileChip icon={Truck} label="Tow Vehicle" value={String(profile.towVehicle)} />}
                {profile.experience && <ProfileChip icon={User} label="Experience" value={String(profile.experience).replace("_", " ")} />}
                {profile.hasTrade !== undefined && <ProfileChip icon={Activity} label="Has Trade" value={profile.hasTrade ? "Yes" : "No"} />}
                {profile.hasKids !== undefined && <ProfileChip icon={User} label="Kids" value={profile.hasKids ? "Yes" : "No"} />}
                {profile.campingStyle && <ProfileChip icon={Target} label="Camping Style" value={String(profile.campingStyle).replace("_", " ")} />}
              </div>
            </div>
          )}

          {/* Conversation transcript */}
          {lead.conversation && lead.conversation.length > 0 && (
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-3">
                AI Outfitter Conversation ({lead.conversation.length} messages)
              </h4>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {lead.conversation.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] text-sm px-3 py-2 rounded-xl ${
                      msg.role === "user"
                        ? "bg-indigo-600/30 text-indigo-100 border border-indigo-500/20"
                        : "bg-gray-800 text-gray-300 border border-gray-700"
                    }`}>
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">
                        {msg.role === "user" ? "Buyer" : "AI Outfitter"}
                      </div>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">Your Notes</h4>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes about this lead..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 resize-none focus:outline-none focus:border-indigo-500 min-h-[80px]"
            />
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              className="mt-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Notes"}
            </button>
          </div>

          {/* CRM retry */}
          {effectiveCrmStatus === "failed" && (
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-red-400/80 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> CRM Sync Failed
              </h4>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRetryCrm}
                  disabled={crmRetrying}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs font-bold transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${crmRetrying ? "animate-spin" : ""}`} />
                  {crmRetrying ? "Retrying..." : "Retry CRM Sync"}
                </button>
                {crmRetryResult && (
                  <span className={`text-xs font-semibold ${crmRetryResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {crmRetryResult.ok ? "Synced successfully" : "Retry failed — CRM still unreachable"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Status actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-xs text-gray-500 self-center mr-1">Mark as:</span>
            <StatusButton
              label="New"
              icon={Clock}
              active={lead.status === "new"}
              color="amber"
              onClick={() => handleStatus("new")}
              disabled={saving}
            />
            <StatusButton
              label="Contacted"
              icon={Phone}
              active={lead.status === "contacted"}
              color="blue"
              onClick={() => handleStatus("contacted")}
              disabled={saving}
            />
            <StatusButton
              label="Closed"
              icon={CheckCircle}
              active={lead.status === "closed"}
              color="emerald"
              onClick={() => handleStatus("closed")}
              disabled={saving}
            />
            <StatusButton
              label="Dismiss"
              icon={XCircle}
              active={lead.status === "dismissed"}
              color="red"
              onClick={() => handleStatus("dismissed")}
              disabled={saving}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileChip({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-indigo-400" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
      </div>
      <div className="text-sm font-bold text-white capitalize">{value}</div>
    </div>
  );
}

function StatusButton({
  label, icon: Icon, active, color, onClick, disabled
}: {
  label: string; icon: LucideIcon; active: boolean; color: string; onClick: () => void; disabled: boolean;
}) {
  const colors: Record<string, string> = {
    amber: "border-amber-500/50 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20",
    blue: "border-blue-500/50 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20",
    emerald: "border-emerald-500/50 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20",
    red: "border-red-500/50 text-red-400 bg-red-500/10 hover:bg-red-500/20",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition disabled:opacity-40 ${
        active ? colors[color] + " ring-1 ring-current" : "border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

// ─── Scraper Tab ───────────────────────────────────────────────────────────

interface DealerStat { name: string; city: string; listing_count: number; }
interface PushStatusData {
  isPushing: boolean;
  startedAt: string | null;
  completedAt: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

interface ScrapeStatusData {
  is_scraping: boolean;
  scrape_started_at: string | null;
  scrape_completed_at: string | null;
  scrape_error: string | null;
  last_sync_at: string | null;
  last_sync_inserted: number | null;
  last_sync_updated: number | null;
  last_sync_skipped: number | null;
  data_files: number;
  total_listings_in_db: number;
  dealer_stats: DealerStat[];
  push_status?: PushStatusData;
}

function ScraperTab({ adminKey, onDataChange }: { adminKey: string; onDataChange?: (has: boolean) => void }) {
  const [status, setStatus] = useState<ScrapeStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const headers = { "x-admin-key": adminKey };

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/admin/scrape-status`, { headers });
      if (r.ok) {
        const d: ScrapeStatusData = await r.json();
        setStatus(d);
        onDataChange?.((d.data_files ?? 0) > 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [adminKey]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Poll every 10s while scraping or pushing
  useEffect(() => {
    if (!status?.is_scraping && !status?.push_status?.isPushing) return;
    const t = setInterval(fetchStatus, 10000);
    return () => clearInterval(t);
  }, [status?.is_scraping, status?.push_status?.isPushing, fetchStatus]);

  const doAction = async (endpoint: string, label: string) => {
    setActionLoading(label);
    setActionMsg(null);
    try {
      const r = await fetch(`${BASE}api/admin/${endpoint}`, { method: "POST", headers });
      const d = await r.json();
      setActionMsg(d.message ?? (d.ok ? "Done" : d.error ?? "Error"));
      fetchStatus();
    } catch (e) {
      setActionMsg("Request failed");
    }
    setActionLoading(null);
  };

  const fmt = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className={`rounded-2xl border p-5 flex items-center gap-4 ${
        status?.is_scraping
          ? "border-amber-500/40 bg-amber-500/5"
          : status?.scrape_error
          ? "border-red-500/40 bg-red-500/5"
          : "border-emerald-500/30 bg-emerald-500/5"
      }`}>
        {status?.is_scraping ? (
          <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
        ) : status?.scrape_error ? (
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
        ) : (
          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white">
            {status?.is_scraping
              ? "Scraper running…"
              : status?.scrape_error
              ? `Last run failed: ${status.scrape_error}`
              : "Scraper idle"}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {status?.is_scraping
              ? `Started ${fmt(status.scrape_started_at)}`
              : `Last completed: ${fmt(status?.scrape_completed_at)}`}
          </div>
        </div>
        <button
          onClick={fetchStatus}
          className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className="px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-sm">
          {actionMsg}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{status?.total_listings_in_db?.toLocaleString() ?? "—"}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Listings in DB</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-emerald-400">{status?.data_files ?? "—"}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Dealer Files (data/)</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-indigo-400">{status?.last_sync_inserted ?? "—"}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Last Sync: Added</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-violet-400">{status?.last_sync_updated ?? "—"}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Last Sync: Updated</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-white text-sm uppercase tracking-wider">Manual Controls</h3>
        <div className="text-xs text-gray-500">Scraper runs automatically every 6 hours. Use these for manual runs.</div>

        <div className="flex flex-wrap gap-3">
          <ActionBtn
            icon={Play}
            label="Run Full Scrape"
            sublabel="All 62 dealers (~30-60 min)"
            color="emerald"
            loading={actionLoading === "Run Full Scrape"}
            disabled={!!status?.is_scraping}
            onClick={() => doAction("scrape", "Run Full Scrape")}
          />
          <ActionBtn
            icon={Zap}
            label="Sync to DB Only"
            sublabel="No scraping, uses existing data/"
            color="indigo"
            loading={actionLoading === "Sync to DB Only"}
            disabled={!!status?.is_scraping || (status?.data_files ?? 0) === 0}
            onClick={() => doAction("sync", "Sync to DB Only")}
          />
          <ActionBtn
            icon={Upload}
            label="Push to Production"
            sublabel="Send dev DB → matchrv.com"
            color="violet"
            loading={actionLoading === "Push to Production" || !!status?.push_status?.isPushing}
            disabled={!!status?.is_scraping || !!status?.push_status?.isPushing}
            onClick={() => doAction("push-to-prod", "Push to Production")}
          />
        </div>

        {/* Push status */}
        {status?.push_status && (status.push_status.isPushing || status.push_status.completedAt) && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            status.push_status.isPushing
              ? "border-violet-500/30 bg-violet-500/5 text-violet-300"
              : status.push_status.error
              ? "border-red-500/30 bg-red-500/5 text-red-300"
              : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
          }`}>
            {status.push_status.isPushing
              ? `⬆ Pushing to production… (started ${fmt(status.push_status.startedAt)})`
              : status.push_status.error
              ? `✗ Push failed: ${status.push_status.error}`
              : `✓ Push complete at ${fmt(status.push_status.completedAt)}`}
          </div>
        )}

        <div className="text-xs text-gray-600 flex items-center gap-2 pt-1">
          <Clock className="w-3.5 h-3.5" />
          Last sync: {fmt(status?.last_sync_at)} ·
          Skipped: {status?.last_sync_skipped ?? "—"}
        </div>
      </div>

      {/* Dealer breakdown */}
      {(status?.dealer_stats ?? []).length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h3 className="font-bold text-white">Listings by Dealer</h3>
            <p className="text-xs text-gray-500 mt-0.5">Current inventory counts from the DB</p>
          </div>
          <div className="divide-y divide-gray-800 max-h-[400px] overflow-y-auto">
            {(status?.dealer_stats ?? []).map((d, i) => (
              <div key={i} className="flex items-center justify-between px-6 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-200">{d.name}</div>
                  <div className="text-xs text-gray-600">{d.city}</div>
                </div>
                <div className="text-sm font-bold text-emerald-400">{d.listing_count.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(status?.data_files ?? 0) === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
          <Database className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-semibold mb-1">No scraper data yet</p>
          <p className="text-gray-600 text-sm">Click "Run Full Scrape" to fetch live inventory from all 62 WA dealers.</p>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon: Icon, label, sublabel, color, loading, disabled, onClick
}: {
  icon: LucideIcon; label: string; sublabel: string; color: string;
  loading: boolean; disabled: boolean; onClick: () => void;
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/30",
    indigo: "bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/30",
    violet: "bg-violet-600 hover:bg-violet-500 disabled:bg-violet-900/30",
    amber: "bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900/30",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center gap-3 px-5 py-3 rounded-xl text-white font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${colors[color]}`}
    >
      {loading
        ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        : <Icon className="w-4 h-4" />}
      <div className="text-left">
        <div>{label}</div>
        <div className="text-xs opacity-70 font-normal">{sublabel}</div>
      </div>
    </button>
  );
}

// ─── Analytics Tab ─────────────────────────────────────────────────────────

function AnalyticsTab({ data, days }: { data: DashboardData; days: number }) {
  const { summary, dealers, topListings, searchTrends, towVehicles, outfitter, timeline, budgets } = data;

  const searchTimeline = (timeline.timeline ?? []).map((row: TimelineRow) => ({
    date: new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    searches: Number(row.count),
  }));

  const typeData = (searchTrends.types ?? []).map((r: RvTypeCount) => ({
    name: TYPE_LABELS[r.rv_type] ?? r.rv_type,
    value: Number(r.count),
  }));

  const budgetData = (budgets.budgets ?? []).map((r: BudgetEntry) => ({
    range: r.range,
    count: Number(r.count),
  }));

  const timeLabel = days === 0 ? "All time" : `Last ${days} days`;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Activity} label="Total Events" value={summary.totalEvents} color="indigo" />
        <StatCard icon={Eye} label="Listing Views" value={summary.listingViews} color="blue" />
        <StatCard icon={Search} label="Searches" value={summary.searches} color="violet" />
        <StatCard icon={MessageSquare} label="AI Sessions" value={summary.outfitterSessions} color="purple" />
        <StatCard icon={Truck} label="Tow Checks" value={summary.towChecks} color="cyan" />
        <StatCard icon={Users} label="Page Views" value={summary.pageViews} color="emerald" />
      </div>

      <Panel title="Search Activity Timeline" subtitle={`Daily search counts — ${timeLabel}`} icon={TrendingUp}>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={searchTimeline} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: "12px", fontSize: 12 }} />
              <Line type="monotone" dataKey="searches" stroke="#a78bfa" strokeWidth={2} dot={false} name="Searches" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Panel title="Views by Dealer" subtitle="Which dealers get the most buyer attention" icon={Eye}>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(dealers.dealers ?? []).slice(0, 10)} layout="vertical" margin={{ left: 100, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} />
                <YAxis type="category" dataKey="dealer_name" tick={{ fontSize: 11, fill: "#d1d5db" }} width={100} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: "12px", fontSize: 12 }} />
                <Bar dataKey="view_count" fill="#818cf8" radius={[0, 6, 6, 0]} name="Views" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Top Searched RV Types" subtitle="What buyers are looking for" icon={Search}>
          {typeData.length > 0 ? (
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#d1d5db" }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: "12px", fontSize: 12 }} />
                  <Bar dataKey="value" fill="#a78bfa" radius={[0, 6, 6, 0]} name="Searches" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState message="No search data yet" />}
        </Panel>

        <Panel title="Buyer Budget Distribution" subtitle="Combined budgets from searches and AI sessions" icon={TrendingUp}>
          {budgetData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={budgetData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: "12px", fontSize: 12 }} />
                  <Bar dataKey="count" fill="#a78bfa" radius={[6, 6, 0, 0]} name="Buyers" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState message="No budget data yet" />}
        </Panel>

        <Panel title="Tow Vehicle Trends" subtitle="What vehicles buyers are driving" icon={Truck}>
          {(towVehicles.vehicles ?? []).length > 0 ? (
            <div className="space-y-3">
              {(towVehicles.vehicles ?? []).map((v: TowVehicle, i: number) => (
                <div key={i} className="flex items-center justify-between bg-gray-900/50 rounded-lg px-4 py-3">
                  <span className="text-sm font-medium text-gray-200">{v.make} {v.model}</span>
                  <span className="text-sm font-bold text-indigo-400">{v.count} checks</span>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No tow check data yet" />}
        </Panel>

        <Panel title="AI Outfitter Insights" subtitle="What buyers tell the AI about their needs" icon={MessageSquare}>
          {(outfitter.rvTypes ?? []).length > 0 || (outfitter.useCases ?? []).length > 0 ? (
            <div className="space-y-6">
              {(outfitter.rvTypes ?? []).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Preferred RV Types</h4>
                  <div className="flex flex-wrap gap-2">
                    {(outfitter.rvTypes ?? []).map((r: RvTypeCount, i: number) => (
                      <span key={i} className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-lg text-sm font-medium">
                        {TYPE_LABELS[r.rv_type] ?? r.rv_type} ({r.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(outfitter.useCases ?? []).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Use Cases</h4>
                  <div className="flex flex-wrap gap-2">
                    {(outfitter.useCases ?? []).map((r: UseCaseEntry, i: number) => (
                      <span key={i} className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded-lg text-sm font-medium">
                        {r.use_case} ({r.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : <EmptyState message="No AI outfitter sessions yet" />}
        </Panel>

        <Panel title="Most Viewed Listings" subtitle="Individual listings with the most buyer interest" icon={Eye}>
          {(topListings.listings ?? []).length > 0 ? (
            <div className="space-y-2">
              {(topListings.listings ?? []).slice(0, 10).map((l: TopListing, i: number) => (
                <div key={i} className="flex items-center justify-between bg-gray-900/50 rounded-lg px-4 py-3">
                  <div className="min-w-0 flex-1 mr-4">
                    <div className="text-sm font-medium text-gray-200 truncate">{l.listing_title}</div>
                    <div className="text-xs text-gray-500">{l.dealer_name}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-indigo-400">{l.view_count} views</div>
                    <div className="text-xs text-gray-500">{l.unique_visitors} unique</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No listing views yet" />}
        </Panel>

        <Panel title="Geographic Demand" subtitle="States buyers are searching from" icon={Users}>
          {(searchTrends.states ?? []).length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(searchTrends.states ?? []).map((r: StateCount) => ({ state: r.state, count: Number(r.count) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="state" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: "12px", fontSize: 12 }} />
                  <Bar dataKey="count" fill="#34d399" radius={[6, 6, 0, 0]} name="Searches" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState message="No geographic data yet" />}
        </Panel>
      </div>
    </div>
  );
}

// ─── Shared components ─────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border mb-3 ${colorClasses[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-white">{(value ?? 0).toLocaleString()}</div>
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-white">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-gray-600 text-sm">
      {message} — data will appear as visitors use the site
    </div>
  );
}

// ─── Activity Feed Tab ──────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; color: string; icon: string }> = {
  page_view:         { label: "Viewed page",           color: "text-gray-400 bg-gray-800 border-gray-700",           icon: "👁" },
  listing_view:      { label: "Viewed listing",         color: "text-blue-400 bg-blue-500/10 border-blue-500/20",     icon: "🏕" },
  search:            { label: "Searched",               color: "text-purple-400 bg-purple-500/10 border-purple-500/20", icon: "🔍" },
  tow_check:         { label: "Tow check",              color: "text-green-400 bg-green-500/10 border-green-500/20",  icon: "🚛" },
  outfitter_session: { label: "Started Outfitter chat", color: "text-amber-400 bg-amber-500/10 border-amber-500/20",  icon: "🤖" },
  outfitter_message: { label: "Outfitter message",      color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: "💬" },
  dealer_contact:    { label: "Contacted dealer",       color: "text-red-400 bg-red-500/10 border-red-500/20",        icon: "📞" },
  contact_open:      { label: "Opened contact form",    color: "text-orange-400 bg-orange-500/10 border-orange-500/20", icon: "✉️" },
  filter_applied:    { label: "Applied filter",         color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20", icon: "🔧" },
  listing_save:      { label: "Saved listing",          color: "text-pink-400 bg-pink-500/10 border-pink-500/20",     icon: "❤️" },
  swipe_like:        { label: "Liked listing",          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: "👍" },
  swipe_pass:        { label: "Passed on listing",      color: "text-slate-400 bg-slate-500/10 border-slate-500/20", icon: "👎" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function metaSummary(metadata: Record<string, unknown>): string {
  const parts: string[] = [];
  if (metadata.path) parts.push(`path: ${metadata.path}`);
  if (metadata.query) parts.push(`"${metadata.query}"`);
  if (metadata.type) parts.push(`type: ${metadata.type}`);
  if (metadata.canTow !== undefined) parts.push(metadata.canTow ? "✓ can tow" : "✗ cannot tow");
  if (metadata.filter) parts.push(`filter: ${metadata.filter}`);
  if (metadata.value) parts.push(`${metadata.value}`);
  return parts.join(" · ");
}

// ─── Imports Tab ────────────────────────────────────────────────────────────

function ImportsTab({ runs, loading, onRefresh }: {
  runs: ImportRun[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const fmt = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString("en-US", {
          month: "short", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit",
        })
      : "—";

  const totalInserted = runs.reduce((s, r) => s + (r.listings_inserted ?? 0), 0);
  const totalUpdated = runs.reduce((s, r) => s + (r.listings_updated ?? 0), 0);
  const failedRuns = runs.filter(r => r.error);

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{runs.length}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Total Runs (last 20)</div>
        </div>
        <div className="bg-gray-900 border border-teal-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-teal-400">{totalInserted.toLocaleString()}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Listings Added</div>
        </div>
        <div className="bg-gray-900 border border-indigo-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-indigo-400">{totalUpdated.toLocaleString()}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Listings Updated</div>
        </div>
        <div className={`bg-gray-900 rounded-xl p-4 border ${failedRuns.length > 0 ? "border-red-500/40" : "border-gray-800"}`}>
          <div className={`text-2xl font-bold ${failedRuns.length > 0 ? "text-red-400" : "text-gray-500"}`}>
            {failedRuns.length}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Failed Runs</div>
        </div>
      </div>

      {/* Run history table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <List className="w-4 h-4 text-teal-400" />
            <h3 className="font-semibold text-white text-sm">Import Run History</h3>
            <span className="text-xs text-gray-600">(last 20 runs)</span>
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Loading import history…</div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-600 text-sm gap-2">
            <Upload className="w-8 h-8 text-gray-700" />
            <span>No import runs yet — they'll appear here after the first push</span>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_72px_72px_72px_72px_72px_64px] gap-2 px-5 py-2.5 border-b border-gray-800 text-[10px] font-black uppercase tracking-widest text-gray-600">
              <span>Timestamp</span>
              <span className="text-right">Added</span>
              <span className="text-right">Updated</span>
              <span className="text-right">Skipped</span>
              <span className="text-right">Dealers</span>
              <span className="text-right">Duration</span>
              <span className="text-right">Status</span>
            </div>
            <div className="divide-y divide-gray-800/60 max-h-[600px] overflow-y-auto">
              {runs.map(run => {
                const isZero = !run.error && run.listings_inserted === 0 && run.listings_updated === 0;
                const durationLabel = run.duration_ms != null
                  ? run.duration_ms >= 60000
                    ? `${(run.duration_ms / 60000).toFixed(1)}m`
                    : `${(run.duration_ms / 1000).toFixed(1)}s`
                  : "—";
                const statusBadge = run.error
                  ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">Error</span>
                  : isZero
                  ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">Empty</span>
                  : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/30">OK</span>;
                return (
                  <div
                    key={run.id}
                    className={`px-5 py-3.5 hover:bg-gray-800/40 transition ${run.error ? "bg-red-500/5" : isZero ? "bg-amber-500/5" : ""}`}
                  >
                    {/* Mobile layout */}
                    <div className="sm:hidden flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-gray-200">{fmt(run.imported_at)}</div>
                        <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
                          <span>+{run.listings_inserted} added</span>
                          <span>{run.listings_updated} updated</span>
                          <span>{run.listings_skipped} skipped</span>
                          <span>{durationLabel}</span>
                        </div>
                        {run.error && <div className="text-xs text-red-400 mt-1 truncate max-w-xs">{run.error}</div>}
                      </div>
                      <div className="flex-shrink-0">{statusBadge}</div>
                    </div>
                    {/* Desktop layout */}
                    <div className="hidden sm:grid sm:grid-cols-[1fr_72px_72px_72px_72px_72px_64px] gap-2 items-center">
                      <div>
                        <div className="text-sm text-gray-200">{fmt(run.imported_at)}</div>
                        {run.source_ip && (
                          <div className="text-[10px] text-gray-600 font-mono mt-0.5">{run.source_ip}</div>
                        )}
                        {run.error && (
                          <div className="text-xs text-red-400 mt-0.5 truncate max-w-xs">{run.error}</div>
                        )}
                      </div>
                      <div className={`text-right text-sm font-bold ${run.listings_inserted > 0 ? "text-teal-400" : "text-gray-500"}`}>
                        {run.listings_inserted > 0 ? `+${run.listings_inserted}` : run.listings_inserted}
                      </div>
                      <div className={`text-right text-sm font-bold ${run.listings_updated > 0 ? "text-indigo-400" : "text-gray-500"}`}>
                        {run.listings_updated}
                      </div>
                      <div className="text-right text-sm text-gray-500">{run.listings_skipped}</div>
                      <div className="text-right text-sm text-gray-500">
                        {run.dealers_inserted > 0
                          ? <span className="text-emerald-400">+{run.dealers_inserted}</span>
                          : <span>{run.dealers_updated}</span>}
                      </div>
                      <div className="text-right text-xs text-gray-600">{durationLabel}</div>
                      <div className="text-right">{statusBadge}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/30 font-bold">OK</span>
          At least one listing added or updated
        </div>
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">Empty</span>
          Zero new listings — investigate push script or source data
        </div>
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 font-bold">Error</span>
          Import failed with an exception
        </div>
      </div>
    </div>
  );
}

function ActivityTab({
  events, loading, onRefresh,
}: {
  events: ActivityEvent[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = typeFilter === "all"
    ? events
    : events.filter(e => e.eventType === typeFilter);

  const uniqueTypes = [...new Set(events.map(e => e.eventType))].sort();

  const highValueCount = events.filter(e =>
    ["dealer_contact", "contact_open", "listing_save", "outfitter_session"].includes(e.eventType)
  ).length;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{events.length}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Total Events</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-red-400">{highValueCount}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">High-Value Actions</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-blue-400">
            {new Set(events.map(e => e.sessionId).filter(Boolean)).size}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Unique Sessions</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-purple-400">
            {events.filter(e => e.eventType === "search").length}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Searches</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTypeFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
            typeFilter === "all"
              ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
              : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          All ({events.length})
        </button>
        {uniqueTypes.map(t => {
          const meta = EVENT_META[t];
          const count = events.filter(e => e.eventType === t).length;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                typeFilter === t
                  ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                  : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {meta?.icon} {meta?.label ?? t} ({count})
            </button>
          );
        })}
      </div>

      {/* Event feed */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-purple-400 animate-pulse" />
            <h3 className="font-semibold text-white text-sm">Live Event Feed</h3>
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Loading events…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
            No events yet — they'll appear as visitors use the site
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60 max-h-[600px] overflow-y-auto">
            {filtered.map(ev => {
              const meta = EVENT_META[ev.eventType];
              const summary = metaSummary(ev.metadata ?? {});
              return (
                <div key={ev.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-gray-800/40 transition group">
                  <div className={`mt-0.5 flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${meta?.color ?? "text-gray-400 bg-gray-800 border-gray-700"}`}>
                    {meta?.icon ?? "·"} {meta?.label ?? ev.eventType}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {ev.listingId && (
                        <span className="text-xs text-gray-500">listing #{ev.listingId}</span>
                      )}
                      {ev.dealerId && (
                        <span className="text-xs text-gray-500">dealer #{ev.dealerId}</span>
                      )}
                      {summary && (
                        <span className="text-xs text-gray-400 truncate max-w-xs">{summary}</span>
                      )}
                    </div>
                    {ev.sessionId && (
                      <div className="text-[10px] text-gray-600 mt-0.5 font-mono">
                        session {ev.sessionId.slice(0, 12)}…
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-xs text-gray-600 group-hover:text-gray-400 transition whitespace-nowrap">
                    {timeAgo(ev.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

